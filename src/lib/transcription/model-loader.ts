import { loadTranscriptionModel } from './transcription-engine'

interface BackgroundLoadOptions {
  onProgress?: (pct: number) => void
  onError?: (err: unknown) => void
  onReady?: () => void
}

let loaded = false
let loading = false

export async function backgroundLoadModel(options: BackgroundLoadOptions = {}): Promise<void> {
  if (loaded) {
    options.onReady?.()
    return
  }
  if (loading) return
  loading = true

  try {
    options.onProgress?.(10)
    await loadTranscriptionModel('whisper-base')
    loaded = true
    options.onProgress?.(100)
    options.onReady?.()
  } catch (err) {
    options.onError?.(err)
  } finally {
    loading = false
  }
}

export function isModelReady(): boolean {
  return loaded
}
