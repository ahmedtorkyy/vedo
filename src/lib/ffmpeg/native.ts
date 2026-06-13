// Native FFmpeg path for the desktop app (Electron stage 2).
// Mirrors the wasm worker's operations with identical ffmpeg arguments, but
// runs the real binary: OPFS bytes → temp files → spawn → output → OPFS.
// Falls back transparently: callers check isNativeFFmpeg() and use the wasm
// worker when this returns false (browser build, or binary not fetched yet).

import type { AudioCleansingOptions } from '../../types'

let available: boolean | null = null

export async function initNativeFFmpeg(): Promise<boolean> {
  if (available !== null) return available
  try {
    available = window.vedoNative ? await window.vedoNative.ffmpegAvailable() : false
  } catch {
    available = false
  }
  return available
}

export function isNativeFFmpeg(): boolean {
  return available === true
}

// --- OPFS helpers (main thread has full OPFS access in Chromium) ---

async function readOpfs(projectId: string, filename: string): Promise<ArrayBuffer> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(`project_${projectId}`)
  const fh = await dir.getFileHandle(filename)
  const file = await fh.getFile()
  return file.arrayBuffer()
}

async function writeOpfs(projectId: string, filename: string, data: ArrayBuffer): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(`project_${projectId}`, { create: true })
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fh = await dir.getFileHandle(safe, { create: true })
  const writable = await fh.createWritable()
  await writable.write(data)
  await writable.close()
}

async function stageInput(projectId: string, opfsName: string, tempName?: string): Promise<string> {
  const data = await readOpfs(projectId, opfsName)
  return window.vedoNative!.tempWrite(tempName ?? opfsName, data)
}

async function collectOutput(projectId: string, tempName: string, opfsName: string): Promise<void> {
  const data = await window.vedoNative!.tempRead(tempName)
  await writeOpfs(projectId, opfsName, data)
}

async function run(args: string[], totalDurationSec?: number, onProgress?: (pct: number) => void): Promise<void> {
  const native = window.vedoNative!
  const unsub = onProgress ? native.onFfmpegProgress(onProgress) : null
  try {
    const { code, stderrTail } = await native.ffmpegRun(args, totalDurationSec)
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code}: ${stderrTail.slice(-400)}`)
    }
  } finally {
    unsub?.()
  }
}

/**
 * Start each operation with a clean job directory. Cleanup must happen at
 * the START of an operation — never right after an ffmpeg run — because the
 * produced output file still needs to be collected back into OPFS, and
 * multi-step operations (concat normalization) keep files between runs.
 */
async function freshJobDir(): Promise<void> {
  await window.vedoNative!.tempCleanup().catch(() => {})
}

// --- Fonts and caption text files for render jobs ---

async function stageFonts(): Promise<void> {
  const native = window.vedoNative!
  for (const f of ['noto-sans.ttf', 'noto-sans-arabic.ttf']) {
    const resp = await fetch(`/fonts/${f === 'noto-sans.ttf' ? 'NotoSans-Regular.ttf' : 'NotoSansArabic-Regular.ttf'}`)
    if (!resp.ok) continue
    await native.tempWrite(f, await resp.arrayBuffer())
  }
}

async function stageTextFiles(files: { name: string; content: string }[] | undefined): Promise<void> {
  if (!files) return
  const native = window.vedoNative!
  const enc = new TextEncoder()
  for (const tf of files) {
    const bytes = enc.encode(tf.content)
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(bytes)
    await native.tempWrite(tf.name, copy)
  }
}

// --- Operations (argument-identical to the wasm worker) ---

export async function nativeExtractAudio(projectId: string, inputName: string): Promise<string> {
  await freshJobDir()
  const outputName = `_audio_${Date.now()}.wav`
  await stageInput(projectId, inputName)
  await run(['-y', '-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', outputName])
  await collectOutput(projectId, outputName, outputName)
  return outputName
}

export async function nativeCleanAudio(
  projectId: string,
  inputName: string,
  options: AudioCleansingOptions,
): Promise<string> {
  await freshJobDir()
  const outputName = `_cleaned_${Date.now()}.wav`
  await stageInput(projectId, inputName)

  const filters: string[] = []
  if (options.noiseReduction) filters.push('afftdn=nf=-20')
  if (options.silenceTrim && options.threshold) {
    filters.push(`silenceremove=start_periods=1:start_duration=1:start_threshold=-${options.threshold}dB:stop_periods=1:stop_duration=1:stop_threshold=-${options.threshold}dB`)
  }

  const args = filters.length > 0
    ? ['-y', '-i', inputName, '-af', filters.join(','), '-ar', '16000', '-ac', '1', '-f', 'wav', outputName]
    : ['-y', '-i', inputName, '-c', 'copy', '-f', 'wav', outputName]

  await run(args)
  await collectOutput(projectId, outputName, outputName)
  return outputName
}

export async function nativeSmartCut(
  projectId: string,
  inputName: string,
  segments: { start: number; end: number }[],
  totalDuration: number,
): Promise<string> {
  await freshJobDir()
  const outputName = `_smartcut_${Date.now()}.mp4`
  await stageInput(projectId, inputName)

  const kept: { start: number; end: number }[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.start > cursor) kept.push({ start: cursor, end: seg.start })
    cursor = seg.end
  }
  if (cursor < totalDuration) kept.push({ start: cursor, end: totalDuration })
  if (kept.length === 0) throw new Error('No content remains after removing silence')

  const selectExpr = kept
    .map((k) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`)
    .join('+')

  await run([
    '-y', '-i', inputName,
    '-filter_complex',
    `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'mp4', outputName,
  ], totalDuration)

  await collectOutput(projectId, outputName, outputName)
  return outputName
}

export async function nativeConcat(
  projectId: string,
  clips: { name: string; muted?: boolean; normalizedName?: string }[],
  onProgress?: (pct: number) => void,
): Promise<string> {
  await freshJobDir()
  const native = window.vedoNative!
  const normalizedNames: string[] = []

  for (const clip of clips) {
    if (!clip.name) continue
    if (clip.normalizedName) {
      await stageInput(projectId, clip.normalizedName)
      normalizedNames.push(clip.normalizedName)
    } else {
      await stageInput(projectId, clip.name)
      const normName = `_norm_${clip.name}`
      const args = ['-y', '-i', clip.name, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k']
      if (clip.muted) args.push('-af', 'volume=0')
      args.push(normName)
      await run(args)
      // Persist the normalized copy so future re-stitches reuse it.
      const data = await native.tempRead(normName)
      await writeOpfs(projectId, normName, data)
      await native.tempWrite(normName, data)
      normalizedNames.push(normName)
    }
  }

  const concatContent = normalizedNames.map((n) => `file '${n}'`).join('\n')
  const enc = new TextEncoder().encode(concatContent)
  const listBuf = new ArrayBuffer(enc.byteLength)
  new Uint8Array(listBuf).set(enc)
  await native.tempWrite('concat.txt', listBuf)

  const outName = `_concat_output_${Date.now()}.mp4`
  await run([
    '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    outName,
  ], undefined, onProgress)

  await collectOutput(projectId, outName, outName)
  return outName
}

export async function nativeRenderClip(payload: {
  projectId: string
  inputName: string
  outputName: string
  filterComplex: string
  overlayInputNames?: string[]
  codec: { videoCodec: string; audioCodec: string; videoParams: string[]; audioParams: string[]; muxer: string }
  textFiles?: { name: string; content: string }[]
  assFiles?: { name: string; content: string }[]
  totalDurationSec?: number
  onProgress?: (pct: number) => void
}): Promise<string> {
  const { projectId, inputName, outputName, overlayInputNames, codec, textFiles, assFiles, totalDurationSec, onProgress } = payload

  await freshJobDir()
  await stageInput(projectId, inputName)
  const args = ['-y', '-i', inputName]
  for (const ov of overlayInputNames ?? []) {
    if (!ov) continue
    await stageInput(projectId, ov)
    args.push('-i', ov)
  }

  await stageTextFiles(textFiles)
  await stageTextFiles(assFiles)
  await stageFonts()

  // The wasm path mounts fonts at MEMFS root, so the ASS filter says
  // fontsdir=/ — natively the job runs inside the temp dir, so rewrite
  // to the working directory.
  const filterComplex = payload.filterComplex.replace(':fontsdir=/', ':fontsdir=.')

  args.push(
    '-filter_complex', filterComplex,
    '-map', '[v]', '-map', '[a]',
    '-c:v', codec.videoCodec, ...codec.videoParams,
    '-c:a', codec.audioCodec, ...codec.audioParams,
    '-f', codec.muxer, outputName,
  )

  await run(args, totalDurationSec, onProgress)
  await collectOutput(projectId, outputName, outputName)
  return outputName
}

export async function nativeRenderConcat(payload: {
  projectId: string
  clips: { name: string; duration?: number }[]
  outputName: string
  codec: { videoCodec: string; audioCodec: string; videoParams: string[]; audioParams: string[]; muxer: string }
  onProgress?: (pct: number) => void
}): Promise<string> {
  const { projectId, clips, outputName, codec, onProgress } = payload
  const native = window.vedoNative!

  await freshJobDir()
  for (const clip of clips) {
    await stageInput(projectId, clip.name)
  }

  const concatContent = clips.map((c) => `file '${c.name}'`).join('\n')
  const enc = new TextEncoder().encode(concatContent)
  const listBuf = new ArrayBuffer(enc.byteLength)
  new Uint8Array(listBuf).set(enc)
  await native.tempWrite('concat.txt', listBuf)

  await run([
    '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-c:v', codec.videoCodec, ...codec.videoParams,
    '-c:a', codec.audioCodec, ...codec.audioParams,
    '-f', codec.muxer, outputName,
  ], undefined, onProgress)

  await collectOutput(projectId, outputName, outputName)
  return outputName
}
