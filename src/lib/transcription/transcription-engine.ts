import type { TranscriptionSegment } from '../../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null
let loading = false
let loaded = false

export function isModelLoaded(): boolean {
  return loaded
}

export function isLoading(): boolean {
  return loading
}

export async function loadTranscriptionModel(): Promise<void> {
  if (loaded || loading) return
  loading = true
  try {
    const { pipeline: createPipeline } = await import('@xenova/transformers')
    pipeline = await createPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
    })
    loaded = true
  } finally {
    loading = false
  }
}

export async function transcribeAudio(
  audioData: Float32Array,
): Promise<{ segments: TranscriptionSegment[]; language: string }> {
  if (!pipeline) throw new Error('Model not loaded')

  const result = await pipeline(audioData, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })

  const raw: { timestamp?: [number, number]; text?: string; transcript?: string }[] = result.chunks ?? result.segments ?? []
  const segments: TranscriptionSegment[] = raw.map((chunk) => ({
    start: typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : 0,
    end: typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1] : 0,
    text: (chunk.text ?? chunk.transcript ?? '').trim(),
  }))

  const language = typeof result.language === 'string' ? result.language : 'en'
  return { segments, language }
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
      const byteOffset = dataOffset + i * bytesPerFrame
      audio[i] = view.getInt16(byteOffset, true) / 32768
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < frames; i++) {
      const byteOffset = dataOffset + i * bytesPerFrame
      audio[i] = view.getFloat32(byteOffset, true)
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < frames; i++) {
      const byteOffset = dataOffset + i * bytesPerFrame
      audio[i] = (view.getUint8(byteOffset) - 128) / 128
    }
  } else {
    return null
  }

  return { audio, sampleRate }
}
