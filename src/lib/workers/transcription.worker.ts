// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null
let loaded = false
let loading = false

const MODELS = {
  'whisper-tiny': 'Xenova/whisper-tiny',
  'whisper-base': 'Xenova/whisper-base',
  'whisper-small': 'Xenova/whisper-small',
} as const

type ModelKey = keyof typeof MODELS

async function loadModel(modelKey: ModelKey = 'whisper-tiny') {
  if (loading) return
  loading = true
  try {
    const { pipeline: createPipeline } = await import('@xenova/transformers')
    pipeline = await createPipeline('automatic-speech-recognition', MODELS[modelKey], {
      quantized: true,
    })
    loaded = true
    self.postMessage({ type: 'model-loaded', model: modelKey })
  } catch (err) {
    self.postMessage({ type: 'load-error', error: String(err) })
  } finally {
    loading = false
  }
}

function isModelLoaded(): boolean {
  return loaded
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'load') {
    await loadModel(payload?.model ?? 'whisper-tiny')
    return
  }

  if (type === 'transcribe') {
    if (!isModelLoaded()) {
      self.postMessage({ type: 'error', error: 'Model not loaded' })
      return
    }

    const { audio, wordTimestamps } = payload as { audio: Float32Array; sampleRate: number; wordTimestamps?: boolean }

    try {
      if (wordTimestamps) {
        const result = await pipeline(audio, {
          return_timestamps: 'word',
          chunk_length_s: 30,
          stride_length_s: 5,
        })

        const raw: { timestamp?: [number, number]; text?: string; word?: string; transcript?: string }[] =
          result.chunks ?? result.segments ?? []

        const words = raw.map((chunk) => ({
          word: (chunk.word ?? chunk.text ?? '').trim(),
          start: typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : 0,
          end: typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1] : 0,
        })).filter((w) => w.word.length > 0)

        const segments = raw.map((chunk) => ({
          start: typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : 0,
          end: typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1] : 0,
          text: (chunk.text ?? chunk.transcript ?? '').trim(),
        })).filter((s) => s.text.length > 0)

        const language = typeof result.language === 'string' ? result.language : 'en'

        self.postMessage({ type: 'result', segments, words, language })
      } else {
        const result = await pipeline(audio, {
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5,
        })

        const raw: { timestamp?: [number, number]; text?: string; transcript?: string }[] =
          result.chunks ?? result.segments ?? []

        const segments = raw.map((chunk) => ({
          start: typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : 0,
          end: typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1] : 0,
          text: (chunk.text ?? chunk.transcript ?? '').trim(),
        })).filter((s) => s.text.length > 0)

        const language = typeof result.language === 'string' ? result.language : 'en'

        self.postMessage({
          type: 'result',
          segments,
          language,
        })
      }
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) })
    }
  }

  if (type === 'unload') {
    pipeline = null
    loaded = false
    loading = false
    self.postMessage({ type: 'unloaded' })
  }
}

export {}
