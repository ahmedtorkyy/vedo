import type { TranscriptionSegment } from '../../types'

let worker: Worker | null = null

type ModelKey = 'whisper-tiny' | 'whisper-base' | 'whisper-small'

const SUPPORTED_LANGUAGES = [
  'en', 'ar', 'zh', 'fr', 'de', 'ja', 'ko', 'es', 'pt', 'ru',
  'it', 'nl', 'pl', 'tr', 'vi', 'th', 'hi', 'ur',
] as const

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/transcription.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}

export function supportsLanguage(lang: string): boolean {
  return SUPPORTED_LANGUAGES.includes(lang as typeof SUPPORTED_LANGUAGES[number])
}

export function getAvailableModels(): { key: ModelKey; label: string }[] {
  return [
    { key: 'whisper-tiny', label: 'Whisper Tiny (multilingual, fastest)' },
    { key: 'whisper-base', label: 'Whisper Base (multilingual, balanced)' },
    { key: 'whisper-small', label: 'Whisper Small (multilingual, best accuracy)' },
  ]
}

export async function loadTranscriptionModel(modelKey: ModelKey = 'whisper-tiny'): Promise<void> {
  const w = getWorker()
  return new Promise<void>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const { type } = e.data
      if (type === 'model-loaded') {
        w.removeEventListener('message', handler)
        resolve()
      }
      if (type === 'load-error') {
        w.removeEventListener('message', handler)
        reject(new Error(e.data.error))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'load', payload: { model: modelKey } })
  })
}

export async function transcribeAudio(
  audioData: Float32Array,
  sampleRate: number,
): Promise<{ segments: TranscriptionSegment[]; language: string }> {
  const w = getWorker()

  return new Promise<{ segments: TranscriptionSegment[]; language: string }>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const { type } = e.data
      if (type === 'result') {
        w.removeEventListener('message', handler)
        resolve({ segments: e.data.segments, language: e.data.language ?? 'en' })
      }
      if (type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(e.data.error))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'transcribe', payload: { audio: audioData, sampleRate } }, [audioData.buffer])
  })
}

export function decodeWavToF32(buffer: ArrayBuffer): { audio: Float32Array; sampleRate: number } | null {
  const view = new DataView(buffer)
  const header = readWavHeader(view)
  if (!header) return null

  const { sampleRate, dataOffset, dataLength } = header
  const channels = view.getUint16(22, true)
  const bitsPerSample = view.getUint16(34, true)
  const bytesPerFrame = channels * (bitsPerSample / 8)
  const frames = Math.floor(dataLength / bytesPerFrame)

  const audio = new Float32Array(frames)

  if (bitsPerSample === 16) {
    for (let i = 0; i < frames; i++) {
      audio[i] = view.getInt16(dataOffset + i * bytesPerFrame, true) / 32768
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < frames; i++) {
      audio[i] = view.getFloat32(dataOffset + i * bytesPerFrame, true)
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < frames; i++) {
      audio[i] = (view.getUint8(dataOffset + i * bytesPerFrame) - 128) / 128
    }
  } else {
    return null
  }

  return { audio, sampleRate }
}

function readWavHeader(view: DataView): { sampleRate: number; dataOffset: number; dataLength: number } | null {
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') return null
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
  if (wave !== 'WAVE') return null
  const sampleRate = view.getUint32(24, true)

  let dataOffset = 44
  let found = false
  for (let i = 12; i < view.byteLength - 8; i++) {
    const chunkId = String.fromCharCode(view.getUint8(i), view.getUint8(i + 1), view.getUint8(i + 2), view.getUint8(i + 3))
    const chunkSize = view.getUint32(i + 4, true)
    if (chunkId === 'data') {
      dataOffset = i + 8
      found = true
      break
    }
    i += 8 + chunkSize
  }
  if (!found) return null

  const dataLength = view.byteLength - dataOffset
  return { sampleRate, dataOffset, dataLength }
}
