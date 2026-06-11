import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null

const MEMFS_WARN_BYTES = 256 * 1024 * 1024
const MEMFS_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024

const LATIN_FONT_FILENAME = 'noto-sans.ttf'
const ARABIC_FONT_FILENAME = 'noto-sans-arabic.ttf'
const FONT_BASE = '/fonts'
let cachedFontLatin: Uint8Array | null = null
let cachedFontArabic: Uint8Array | null = null

async function ensureFonts(): Promise<void> {
  if (!cachedFontLatin) {
    const resp = await fetch(`${FONT_BASE}/NotoSans-Regular.ttf`)
    if (!resp.ok) throw new Error(`Latin font download failed: ${resp.status}`)
    cachedFontLatin = new Uint8Array(await resp.arrayBuffer())
  }
  if (!cachedFontArabic) {
    const resp = await fetch(`${FONT_BASE}/NotoSansArabic-Regular.ttf`)
    if (!resp.ok) throw new Error(`Arabic font download failed: ${resp.status}`)
    cachedFontArabic = new Uint8Array(await resp.arrayBuffer())
  }
}

async function writeFonts(instance: FFmpeg): Promise<void> {
  await ensureFonts()
  await instance.writeFile(LATIN_FONT_FILENAME, cachedFontLatin!)
  await instance.writeFile(ARABIC_FONT_FILENAME, cachedFontArabic!)
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => {
      self.postMessage({ type: 'concat-progress', progress })
    })
    ffmpeg.on('log', ({ message }) => {
      if (message.toLowerCase().includes('out of memory')) {
        self.postMessage({ type: 'oom-error' })
      }
    })

    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    self.postMessage({ type: 'ffmpeg-loaded' })
  }
  return ffmpeg
}

async function readOpfsFile(projectId: string, filename: string): Promise<Uint8Array> {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(`project_${projectId}`)
  const handle = await folder.getFileHandle(filename)
  const file = await handle.getFile()

  const reader = file.stream().getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const copy = new Uint8Array(value.byteLength)
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    chunks.push(copy)
    total += value.byteLength
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function writeOpfsFile(projectId: string, filename: string, data: Uint8Array): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(`project_${projectId}`, { create: true })
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const handle = await folder.getFileHandle(safeName, { create: true })
  const writable = await handle.createWritable()
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  await writable.write(copy)
  await writable.close()
}

function purgeMemfs(): void {
  if (ffmpeg) {
    ffmpeg.terminate()
    ffmpeg = null
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'concat') {
    try {
      const instance = await getFFmpeg()
      const { projectId, clips } = payload as { projectId: string; clips: { name: string; muted?: boolean; normalizedName?: string }[] }

      let totalBytes = 0
      for (const clip of clips) {
        const root = await navigator.storage.getDirectory()
        const folder = await root.getDirectoryHandle(`project_${projectId}`)
        const handle = await folder.getFileHandle(clip.name)
        const file = await handle.getFile()
        totalBytes += file.size
      }

      if (totalBytes > MEMFS_LIMIT_BYTES) {
        self.postMessage({
          type: 'concat-error',
          error: `Total file size (${(totalBytes / 1e9).toFixed(1)}GB) exceeds MEMFS limit. Please reduce file sizes.`,
        })
        return
      }
      if (totalBytes > MEMFS_WARN_BYTES) {
        self.postMessage({
          type: 'memfs-warning',
          detail: `Files total ${(totalBytes / 1e6).toFixed(0)}MB — close to MEMFS limit.`,
        })
      }

      // Re-encode each clip to normalize codecs and apply mute, or use cached normalized file
      const normalizedNames: string[] = []
      for (const clip of clips) {
        if (!clip.name) continue
        if (clip.normalizedName) {
          const raw = await readOpfsFile(projectId, clip.normalizedName)
          await instance.writeFile(clip.normalizedName, raw)
          normalizedNames.push(clip.normalizedName)
        } else {
          const raw = await readOpfsFile(projectId, clip.name)
          await instance.writeFile(clip.name, raw)
          const normName = `_norm_${clip.name}`
          const args = ['-i', clip.name, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k']
          if (clip.muted) args.push('-af', 'volume=0')
          args.push(normName)
          await instance.exec(args)
          const normData = await instance.readFile(normName) as Uint8Array
          await writeOpfsFile(projectId, normName, normData)
          await instance.deleteFile(clip.name).catch(() => {})
          normalizedNames.push(normName)
        }
      }

      const concatContent = normalizedNames.map((c) => `file '${c}'`).join('\n')
      const concatName = 'concat.txt'
      await instance.writeFile(concatName, new TextEncoder().encode(concatContent))

      await instance.exec(['-f', 'concat', '-safe', '0', '-i', concatName, '-c', 'copy', 'output.mp4'])

      const raw = await instance.readFile('output.mp4') as Uint8Array

      const outFilename = `_concat_output_${Date.now()}.mp4`
      await writeOpfsFile(projectId, outFilename, raw)

      for (const n of normalizedNames) {
        await instance.deleteFile(n).catch(() => {})
      }
      await instance.deleteFile(concatName)
      await instance.deleteFile('output.mp4')
      purgeMemfs()

      self.postMessage({ type: 'concat-done', outputFilename: outFilename })
    } catch (err) {
      purgeMemfs()
      self.postMessage({ type: 'concat-error', error: String(err) })
    }
  }

  if (type === 'load') {
    try {
      await getFFmpeg()
    } catch (err) {
      self.postMessage({ type: 'load-error', error: String(err) })
    }
  }

  if (type === 'purge-memfs') {
    purgeMemfs()
    self.postMessage({ type: 'memfs-purged' })
  }

  if (type === 'extract-audio') {
    try {
      const instance = await getFFmpeg()
      const { projectId, inputName, outputName } = payload as { projectId: string; inputName: string; outputName: string }

      const raw = await readOpfsFile(projectId, inputName)
      await instance.writeFile(inputName, raw)

      await instance.exec([
        '-i', inputName,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        outputName,
      ])

      const result = await instance.readFile(outputName) as Uint8Array
      const copy = new Uint8Array(result.byteLength)
      copy.set(result)
      await writeOpfsFile(projectId, outputName, copy)

      await instance.deleteFile(inputName)
      await instance.deleteFile(outputName)

      self.postMessage({ type: 'audio-extracted', outputName })
    } catch (err) {
      self.postMessage({ type: 'extract-error', error: String(err) })
    }
  }

  if (type === 'clean-audio') {
    try {
      const instance = await getFFmpeg()
      const { projectId, inputName, outputName, options } = payload as {
        projectId: string; inputName: string; outputName: string; options: { noiseReduction: boolean; silenceTrim: boolean; threshold?: number }
      }

      const raw = await readOpfsFile(projectId, inputName)
      await instance.writeFile(inputName, raw)

      const filters: string[] = []
      if (options.noiseReduction) filters.push('afftdn=nf=-20')
      if (options.silenceTrim && options.threshold) {
        filters.push(`silenceremove=start_periods=1:start_duration=1:start_threshold=-${options.threshold}dB:stop_periods=1:stop_duration=1:stop_threshold=-${options.threshold}dB`)
      }

      if (filters.length > 0) {
        await instance.exec([
          '-i', inputName,
          '-af', filters.join(','),
          '-ar', '16000',
          '-ac', '1',
          '-f', 'wav',
          outputName,
        ])
      } else {
        await instance.exec([
          '-i', inputName,
          '-c', 'copy',
          '-f', 'wav',
          outputName,
        ])
      }

      const result = await instance.readFile(outputName) as Uint8Array
      const copy = new Uint8Array(result.byteLength)
      copy.set(result)
      await writeOpfsFile(projectId, outputName, copy)

      await instance.deleteFile(inputName)
      await instance.deleteFile(outputName)

      self.postMessage({ type: 'audio-cleaned', outputName })
    } catch (err) {
      self.postMessage({ type: 'clean-error', error: String(err) })
    }
  }

  if (type === 'render-clip') {
    try {
      const instance = await getFFmpeg()
      const { projectId, inputName, outputName, filterComplex, overlayInputNames, codec, textFiles, assFiles } = payload as {
        projectId: string; inputName: string; outputName: string; filterComplex: string
        overlayInputNames?: string[]
        codec?: { videoCodec: string; audioCodec: string; videoParams: string[]; audioParams: string[]; muxer: string }
        textFiles?: { name: string; content: string }[]
        assFiles?: { name: string; content: string }[]
      }

      instance.on('progress', ({ progress }) => {
        self.postMessage({ type: 'render-clip-progress', progress: Math.round(progress * 100), message: `Rendering clip... ${Math.round(progress * 100)}%` })
      })

      const raw = await readOpfsFile(projectId, inputName)
      await instance.writeFile(inputName, raw)

      if (textFiles) {
        for (const tf of textFiles) {
          await instance.writeFile(tf.name, new TextEncoder().encode(tf.content))
        }
      }

      if (assFiles) {
        for (const af of assFiles) {
          await instance.writeFile(af.name, new TextEncoder().encode(af.content))
        }
      }

      await writeFonts(instance)

      const args = ['-i', inputName]
      const writtenOverlays: string[] = []
      if (overlayInputNames && overlayInputNames.length > 0) {
        for (const overlayName of overlayInputNames) {
          if (!overlayName) continue
          const overlayRaw = await readOpfsFile(projectId, overlayName)
          await instance.writeFile(overlayName, overlayRaw)
          args.push('-i', overlayName)
          writtenOverlays.push(overlayName)
        }
      }
      args.push(
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '[a]',
      )

      if (codec) {
        args.push('-c:v', codec.videoCodec, ...codec.videoParams)
        args.push('-c:a', codec.audioCodec, ...codec.audioParams)
        args.push('-f', codec.muxer)
      } else {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
        args.push('-c:a', 'aac', '-b:a', '128k')
        args.push('-f', 'mp4')
      }
      args.push(outputName)

      await instance.exec(args)

      const result = await instance.readFile(outputName) as Uint8Array
      const copy = new Uint8Array(result.byteLength)
      copy.set(result)
      await writeOpfsFile(projectId, outputName, copy)

      for (const on of writtenOverlays) {
        await instance.deleteFile(on).catch(() => {})
      }
      await instance.deleteFile(inputName)
      await instance.deleteFile(outputName)
      purgeMemfs()

      self.postMessage({ type: 'render-clip-done', outputFilename: outputName })
    } catch (err) {
      purgeMemfs()
      self.postMessage({ type: 'render-clip-error', error: String(err) })
    }
  }

  if (type === 'render-concat') {
    try {
      const instance = await getFFmpeg()
      const { projectId, clips, outputName, codec } = payload as {
        projectId: string
        clips: { name: string; duration: number }[]
        outputName: string
        codec?: { videoCodec: string; audioCodec: string; videoParams: string[]; audioParams: string[]; muxer: string }
      }

      let totalBytes = 0
      for (const clip of clips) {
        const root = await navigator.storage.getDirectory()
        const folder = await root.getDirectoryHandle(`project_${projectId}`)
        const handle = await folder.getFileHandle(clip.name)
        const file = await handle.getFile()
        totalBytes += file.size
      }

      if (totalBytes > MEMFS_LIMIT_BYTES) {
        self.postMessage({ type: 'render-concat-error', error: `Total file size exceeds MEMFS limit.` })
        return
      }

      instance.on('progress', ({ progress }) => {
        self.postMessage({ type: 'render-concat-progress', progress: 85 + Math.round(progress * 15), message: `Concatenating... ${Math.round(progress * 100)}%` })
      })

      for (const clip of clips) {
        const raw = await readOpfsFile(projectId, clip.name)
        await instance.writeFile(clip.name, raw)
      }

      const concatInput = clips.map((c) => `file '${c.name}'`).join('\n')
      await instance.writeFile('concat.txt', new TextEncoder().encode(concatInput))

      const args = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt']

      if (codec) {
        args.push('-c:v', codec.videoCodec, ...codec.videoParams)
        args.push('-c:a', codec.audioCodec, ...codec.audioParams)
        args.push('-f', codec.muxer)
      } else {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
        args.push('-c:a', 'aac', '-b:a', '128k')
      }
      args.push(outputName)

      await instance.exec(args)

      const result = await instance.readFile(outputName) as Uint8Array
      const copy = new Uint8Array(result.byteLength)
      copy.set(result)
      await writeOpfsFile(projectId, outputName, copy)

      for (const clip of clips) {
        await instance.deleteFile(clip.name).catch(() => {})
      }
      await instance.deleteFile('concat.txt').catch(() => {})
      purgeMemfs()

      self.postMessage({ type: 'render-concat-done', outputFilename: outputName })
    } catch (err) {
      purgeMemfs()
      self.postMessage({ type: 'render-concat-error', error: String(err) })
    }
  }

  if (type === 'smart-cut') {
    try {
      const instance = await getFFmpeg()
      const { projectId, inputName, outputName, segments, totalDuration } = payload as {
        projectId: string; inputName: string; outputName: string
        segments: { start: number; end: number }[]
        totalDuration: number
      }

      const raw = await readOpfsFile(projectId, inputName)
      await instance.writeFile(inputName, raw)

      const kept: { start: number; end: number }[] = []
      let cursor = 0
      for (const seg of segments) {
        if (seg.start > cursor) {
          kept.push({ start: cursor, end: seg.start })
        }
        cursor = seg.end
      }
      if (cursor < totalDuration) {
        kept.push({ start: cursor, end: totalDuration })
      }

      if (kept.length === 0) {
        self.postMessage({ type: 'smartcut-error', error: 'No content remains after removing silence' })
        return
      }

      const selectExpr = kept
        .map((k) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`)
        .join('+')

      const audioFilter = `aselect='${selectExpr}',asetpts=N/SR/TB`
      const videoFilter = `select='${selectExpr}',setpts=N/FRAME_RATE/TB`

      await instance.exec([
        '-i', inputName,
        '-filter_complex',
        `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'mp4',
        outputName,
      ])

      const result = await instance.readFile(outputName) as Uint8Array
      const copy = new Uint8Array(result.byteLength)
      copy.set(result)
      await writeOpfsFile(projectId, outputName, copy)

      await instance.deleteFile(inputName)
      await instance.deleteFile(outputName)

      purgeMemfs()

      self.postMessage({ type: 'smartcut-done', outputFilename: outputName })
    } catch (err) {
      purgeMemfs()
      self.postMessage({ type: 'smartcut-error', error: String(err) })
    }
  }
}
