import { loadTranscriptionModel } from './transcription-engine'
import type { ModelKey } from './transcription-engine'

/**
 * Quality ladder, best first. Ahmed's directive: maximum transcription
 * quality regardless of download size or load time. whisper-large-v3 is
 * the strongest multilingual model available (~1.5GB quantized); if the
 * browser cannot hold it we fall back one rung at a time and report
 * which model actually loaded.
 */
const MODEL_LADDER: ModelKey[] = ['whisper-large-v3', 'whisper-medium', 'whisper-small']

let loaded = false
let loading = false
let loadedModel: ModelKey | null = null

type Listener = (ready: boolean) => void
const listeners = new Set<Listener>()

function notify(ready: boolean) {
  for (const fn of listeners) {
    try { fn(ready) } catch { /* noop */ }
  }
}

export function onModelReadyChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function backgroundLoadModel(): Promise<void> {
  if (loaded) return
  if (loading) return
  loading = true
  try {
    for (const key of MODEL_LADDER) {
      try {
        await loadTranscriptionModel(key)
        loaded = true
        loadedModel = key
        notify(true)
        return
      } catch {
        // ladder: try the next smaller model
      }
    }
    notify(false)
  } finally {
    loading = false
  }
}

export function isModelReady(): boolean {
  return loaded
}

export function getLoadedModelKey(): ModelKey | null {
  return loadedModel
}

export function getModelDisplayName(): string {
  switch (loadedModel) {
    case 'whisper-large-v3': return 'Whisper Large v3 (best quality)'
    case 'whisper-medium': return 'Whisper Medium (high quality)'
    case 'whisper-small': return 'Whisper Small'
    case 'whisper-base': return 'Whisper Base'
    case 'whisper-tiny': return 'Whisper Tiny'
    default: return 'AI model'
  }
}
