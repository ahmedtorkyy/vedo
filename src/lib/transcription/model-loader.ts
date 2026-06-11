import { loadTranscriptionModel } from './transcription-engine'

let loaded = false
let loading = false

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
    await loadTranscriptionModel('whisper-base')
    loaded = true
    notify(true)
  } catch {
    notify(false)
  } finally {
    loading = false
  }
}

export function isModelReady(): boolean {
  return loaded
}
