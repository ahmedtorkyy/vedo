// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null
let loaded = false
let loading = false

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

function decodeWavToF32(wavData: Uint8Array): { audio: Float32Array; sampleRate: number } | null {
  const view = new DataView(wavData.buffer, wavData.byteOffset, wavData.byteLength)

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

  if (type === 'transcribe-from-opfs') {
    if (!isModelLoaded()) {
      self.postMessage({ type: 'error', error: 'Model not loaded' })
      return
    }

    const { projectId, opfsFilename, wordTimestamps } = payload as {
      projectId: string; opfsFilename: string; wordTimestamps?: boolean
    }

    try {
      const wavData = await readOpfsFile(projectId, opfsFilename)
      const decoded = decodeWavToF32(wavData)
      if (!decoded) {
        self.postMessage({ type: 'error', error: 'Failed to decode WAV from OPFS' })
        return
      }

      if (wordTimestamps) {
        const result = await pipeline(decoded.audio, {
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
        const result = await pipeline(decoded.audio, {
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

        self.postMessage({ type: 'result', segments, language })
      }
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) })
    }

    return
  }

  if (type === 'unload') {
    pipeline = null
    loaded = false
    loading = false
    self.postMessage({ type: 'unloaded' })
  }
}

export {}
