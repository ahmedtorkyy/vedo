import type { SilenceSegment } from '../../types'

export interface SilenceDetectionOptions {
  threshold?: number
  minDuration?: number
  windowSize?: number
}

export function detectSilence(
  audio: Float32Array,
  sampleRate: number,
  options: SilenceDetectionOptions = {},
): SilenceSegment[] {
  const threshold = options.threshold ?? 0.01
  const minDuration = options.minDuration ?? 0.5
  const windowSize = options.windowSize ?? Math.floor(0.02 * sampleRate)
  const hopSize = windowSize

  const isSilent: boolean[] = []
  for (let i = 0; i < audio.length; i += hopSize) {
    const end = Math.min(i + hopSize, audio.length)
    let sumSq = 0
    for (let j = i; j < end; j++) {
      sumSq += audio[j] * audio[j]
    }
    const rms = Math.sqrt(sumSq / (end - i))
    isSilent.push(rms < threshold)
  }

  const segments: SilenceSegment[] = []
  let silentStart: number | null = null

  for (let i = 0; i < isSilent.length; i++) {
    if (isSilent[i]) {
      if (silentStart === null) silentStart = i * hopSize / sampleRate
    } else {
      if (silentStart !== null) {
        const end = i * hopSize / sampleRate
        const duration = end - silentStart
        if (duration >= minDuration) {
          segments.push({ start: Math.max(0, silentStart), end, duration })
        }
        silentStart = null
      }
    }
  }

  if (silentStart !== null) {
    const end = audio.length / sampleRate
    const duration = end - silentStart
    if (duration >= minDuration) {
      segments.push({ start: Math.max(0, silentStart), end, duration })
    }
  }

  return segments
}
