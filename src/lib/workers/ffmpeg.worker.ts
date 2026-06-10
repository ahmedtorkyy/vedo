import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null

const MEMFS_WARN_BYTES = 256 * 1024 * 1024
const MEMFS_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024

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
      const { projectId, clips } = payload as { projectId: string; clips: { name: string }[] }

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

      for (const clip of clips) {
        const raw = await readOpfsFile(projectId, clip.name)
        await instance.writeFile(clip.name, raw)
      }

      const concatContent = clips.map((c) => `file '${c.name}'`).join('\n')
      const concatName = 'concat.txt'
      await instance.writeFile(concatName, new TextEncoder().encode(concatContent))

      await instance.exec(['-f', 'concat', '-safe', '0', '-i', concatName, '-c', 'copy', 'output.mp4'])

      const raw = await instance.readFile('output.mp4') as Uint8Array

      const outFilename = `_concat_output_${Date.now()}.mp4`
      await writeOpfsFile(projectId, outFilename, raw)

      await instance.deleteFile(concatName)
      await instance.deleteFile('output.mp4')
      for (const clip of clips) {
        await instance.deleteFile(clip.name)
      }

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
