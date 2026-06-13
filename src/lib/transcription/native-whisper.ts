// Native whisper.cpp transcription path for the desktop app (stage 3).
// Runs the real whisper binary via the Electron bridge instead of the
// browser/WASM ONNX runtime — no memory ceiling (large-v3 actually works),
// much faster, and far more reliable than onnxruntime-web's OrtRun path.
// Callers check isNativeWhisper() and fall back to the WASM worker when this
// returns false (browser build, or binary/model not fetched yet).

import type { TranscriptionSegment } from '../../types'

let available: boolean | null = null

export async function initNativeWhisper(): Promise<boolean> {
  if (available !== null) return available
  try {
    available = window.vedoNative ? await window.vedoNative.whisperAvailable() : false
  } catch {
    available = false
  }
  return available
}

export function isNativeWhisper(): boolean {
  return available === true
}

async function readOpfs(projectId: string, filename: string): Promise<ArrayBuffer> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(`project_${projectId}`)
  const fh = await dir.getFileHandle(filename)
  const file = await fh.getFile()
  return file.arrayBuffer()
}

export interface NativeTranscription {
  segments: TranscriptionSegment[]
  language: string
  words?: { word: string; start: number; end: number }[]
}

/**
 * Read a 16 kHz mono WAV from OPFS, stage it into the native temp dir, and
 * run whisper on it. Language is auto-detected (Arabic + English supported).
 */
export async function nativeTranscribeFromOpfs(
  projectId: string,
  opfsFilename: string,
  wordTimestamps?: boolean,
  onProgress?: (pct: number) => void,
): Promise<NativeTranscription> {
  const native = window.vedoNative!
  const data = await readOpfs(projectId, opfsFilename)

  const safe = opfsFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const tempName = `whisper_${Date.now()}_${safe}`
  await native.tempWrite(tempName, data)

  const unsub = onProgress ? native.onWhisperProgress(onProgress) : null
  try {
    const result = await native.whisperRun(tempName, { language: 'auto', wordTimestamps })
    const segments: TranscriptionSegment[] = result.segments
    const words = wordTimestamps
      ? segments.map((s) => ({ word: s.text, start: s.start, end: s.end }))
      : undefined
    return { segments, language: result.language || 'en', words }
  } finally {
    unsub?.()
  }
}
