import type { SilenceSegment } from '../../types'

export interface SilenceDetectionOptions {
  /** Static RMS threshold fallback (0-1). Used when noise floor can't be estimated. Default 0.01 */
  threshold?: number
  /** Minimum silence duration in seconds. Default 0.5 */
  minDuration?: number
  /** Analysis window size in seconds. Default 0.02 (20ms) */
  windowSize?: number
  /** Noise floor percentile (0-100). Lower = more aggressive. Default 15 */
  noiseFloorPercentile?: number
  /** Multiplier applied to noise floor for adaptive threshold. Default 2.0 */
  adaptiveMultiplier?: number
  /** Minimum confidence score (0-1) to include a segment. Default 0.3 */
  minConfidence?: number
}

export interface NoiseFloorEstimate {
  /** Estimated noise floor RMS level */
  rms: number
  /** Adaptive threshold = noiseFloor.rms * multiplier */
  adaptiveThreshold: number
  /** Signal-to-noise floor ratio in dB */
  snr: number
}

export function estimateNoiseFloor(
  audio: Float32Array,
  sampleRate: number,
  percentile: number = 15,
  windowSize: number = Math.floor(0.05 * sampleRate),
): NoiseFloorEstimate {
  const hopSize = Math.max(1, Math.floor(windowSize / 2))
  const rmsValues: number[] = []

  for (let i = 0; i < audio.length; i += hopSize) {
    const end = Math.min(i + windowSize, audio.length)
    let sumSq = 0
    for (let j = i; j < end; j++) {
      sumSq += audio[j] * audio[j]
    }
    rmsValues.push(Math.sqrt(sumSq / (end - i)))
  }

  rmsValues.sort((a, b) => a - b)
  const idx = Math.floor(rmsValues.length * (percentile / 100))
  const noiseRms = rmsValues[Math.min(idx, rmsValues.length - 1)]

  const signalRms = rmsValues[Math.floor(rmsValues.length * 0.95)]
  const snr = noiseRms > 0 ? 20 * Math.log10(Math.max(signalRms, 0.0001) / Math.max(noiseRms, 0.0001)) : 40

  return {
    rms: noiseRms,
    adaptiveThreshold: noiseRms * 2.0,
    snr,
  }
}

function computeZCR(audio: Float32Array, start: number, end: number): number {
  let crossings = 0
  for (let i = start + 1; i < end; i++) {
    if ((audio[i - 1] >= 0 && audio[i] < 0) || (audio[i - 1] < 0 && audio[i] >= 0)) {
      crossings++
    }
  }
  return crossings / Math.max(1, end - start)
}

function computeRMS(audio: Float32Array, start: number, end: number): number {
  let sumSq = 0
  for (let i = start; i < end; i++) {
    sumSq += audio[i] * audio[i]
  }
  return Math.sqrt(sumSq / Math.max(1, end - start))
}

function silenceConfidence(
  rms: number,
  noiseFloor: NoiseFloorEstimate,
  zcr: number,
  zcrSpeech: number,
): number {
  let score = 0

  if (rms <= noiseFloor.adaptiveThreshold) {
    score += 0.4
  } else if (rms <= noiseFloor.adaptiveThreshold * 2) {
    score += 0.2
  }

  if (zcr < zcrSpeech * 0.3) {
    score += 0.3
  } else if (zcr < zcrSpeech * 0.6) {
    score += 0.15
  }

  if (noiseFloor.snr > 10) {
    score += 0.3
  } else if (noiseFloor.snr > 5) {
    score += 0.15
  }

  return Math.min(1, score)
}

function estimateSpeechZCR(audio: Float32Array, sampleRate: number): number {
  const windowSize = Math.floor(0.03 * sampleRate)
  const hopSize = Math.floor(windowSize / 2)
  const zcrValues: number[] = []

  for (let i = 0; i < audio.length; i += hopSize) {
    const end = Math.min(i + windowSize, audio.length)
    zcrValues.push(computeZCR(audio, i, end))
  }

  zcrValues.sort((a, b) => a - b)
  const topIdx = Math.floor(zcrValues.length * 0.8)
  return zcrValues[Math.min(topIdx, zcrValues.length - 1)]
}

export function detectSilence(
  audio: Float32Array,
  sampleRate: number,
  options: SilenceDetectionOptions = {},
): SilenceSegment[] {
  const staticThreshold = options.threshold ?? 0.01
  const minDuration = options.minDuration ?? 0.5
  const windowSize = options.windowSize ?? Math.floor(0.02 * sampleRate)
  const hopSize = windowSize
  const noiseFloorPercentile = options.noiseFloorPercentile ?? 15
  const adaptiveMultiplier = options.adaptiveMultiplier ?? 2.0
  const minConfidence = options.minConfidence ?? 0.3

  const noiseFloor = estimateNoiseFloor(audio, sampleRate, noiseFloorPercentile)
  const effectiveThreshold = Math.max(staticThreshold, noiseFloor.rms * adaptiveMultiplier)

  const zcrSpeech = estimateSpeechZCR(audio, sampleRate)

  const windowResults: { rms: number; zcr: number; isSilent: boolean; confidence: number }[] = []

  for (let i = 0; i < audio.length; i += hopSize) {
    const end = Math.min(i + hopSize, audio.length)
    const rms = computeRMS(audio, i, end)
    const zcr = computeZCR(audio, i, end)
    const confidence = silenceConfidence(rms, noiseFloor, zcr, zcrSpeech)
    const isSilent = rms < effectiveThreshold

    windowResults.push({ rms, zcr, isSilent, confidence })
  }

  const rawSegments: { start: number; end: number; rmsValues: number[]; confidences: number[] }[] = []
  let silentStart: number | null = null
  const buffer: typeof windowResults = []

  for (let i = 0; i < windowResults.length; i++) {
    const w = windowResults[i]
    if (w.isSilent) {
      buffer.push(w)
      if (silentStart === null) silentStart = i * hopSize / sampleRate
    } else {
      if (silentStart !== null) {
        const end = i * hopSize / sampleRate
        const duration = end - silentStart
        if (duration >= minDuration) {
          const avgConfidence = buffer.reduce((s, b) => s + b.confidence, 0) / buffer.length
          if (avgConfidence >= minConfidence) {
            rawSegments.push({
              start: silentStart,
              end,
              rmsValues: buffer.map((b) => b.rms),
              confidences: buffer.map((b) => b.confidence),
            })
          }
        }
        silentStart = null
        buffer.length = 0
      }
    }
  }

  if (silentStart !== null) {
    const end = audio.length / sampleRate
    const duration = end - silentStart
    if (duration >= minDuration) {
      const avgConfidence = buffer.reduce((s, b) => s + b.confidence, 0) / buffer.length
      if (avgConfidence >= minConfidence) {
        rawSegments.push({
          start: silentStart,
          end,
          rmsValues: buffer.map((b) => b.rms),
          confidences: buffer.map((b) => b.confidence),
        })
      }
    }
  }

  return rawSegments.map((seg) => ({
    start: seg.start,
    end: seg.end,
    duration: seg.end - seg.start,
    confidence: seg.confidences.reduce((s, c) => s + c, 0) / seg.confidences.length,
    rms: seg.rmsValues.reduce((s, r) => s + r, 0) / seg.rmsValues.length,
  }))
}
