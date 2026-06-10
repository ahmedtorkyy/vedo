import type { FillerWordOccurrence, SilenceSegment } from '../../types'

const FILLER_WORDS = new Set([
  'um', 'uh', 'ah', 'er', 'hmm', 'like', 'you know', 'actually', 'basically',
  'literally', 'sort of', 'kind of', 'i mean', 'you see', 'well', 'so',
  'right', 'okay', 'anyway',
  'يعني', 'اه', 'امم', 'حسنا', 'طيب',
])

export function detectFillerWords(
  segments: { start: number; end: number; text: string }[],
): FillerWordOccurrence[] {
  const occurrences: FillerWordOccurrence[] = []

  for (const segment of segments) {
    const words = segment.text.toLowerCase().split(/\s+/)
    const durationPerWord = (segment.end - segment.start) / Math.max(words.length, 1)

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-z\u0600-\u06FF]/g, '')
      if (FILLER_WORDS.has(word)) {
        occurrences.push({
          word,
          start: segment.start + i * durationPerWord,
          end: segment.start + (i + 1) * durationPerWord,
          duration: durationPerWord,
        })
      }
    }
  }

  return occurrences
}

export function detectRepeatedPhrases(
  segments: { text: string }[],
  minRepetitions: number = 2,
): string[] {
  const fullText = segments.map((s) => s.text.trim()).join(' ').toLowerCase()
  const words = fullText.split(/\s+/)
  const phrases: string[] = []
  const seen = new Set<string>()

  for (let phraseLen = 2; phraseLen <= 5; phraseLen++) {
    for (let i = 0; i <= words.length - phraseLen; i++) {
      const phrase = words.slice(i, i + phraseLen).join(' ')
      if (seen.has(phrase)) continue
      seen.add(phrase)

      let count = 0
      for (let j = 0; j <= words.length - phraseLen; j++) {
        if (words.slice(j, j + phraseLen).join(' ') === phrase) {
          count++
          j += phraseLen - 1
        }
      }
      if (count >= minRepetitions) {
        phrases.push(phrase)
      }
    }
  }

  return phrases
}

export interface LowEnergyOptions {
  threshold?: number
  minDuration?: number
}

export function detectLowEnergySections(
  audio: Float32Array,
  sampleRate: number,
  options: LowEnergyOptions = {},
): SilenceSegment[] {
  const threshold = options.threshold ?? 0.005
  const minDuration = options.minDuration ?? 1.0
  const windowSize = Math.floor(0.05 * sampleRate)

  const energies: number[] = []
  for (let i = 0; i < audio.length; i += windowSize) {
    const end = Math.min(i + windowSize, audio.length)
    let sumSq = 0
    for (let j = i; j < end; j++) {
      sumSq += audio[j] * audio[j]
    }
    energies.push(Math.sqrt(sumSq / (end - i)))
  }

  const maxEnergy = Math.max(...energies, 0.0001)

  const sections: SilenceSegment[] = []
  let lowStart: number | null = null

  for (let i = 0; i < energies.length; i++) {
    if (energies[i] / maxEnergy < threshold) {
      if (lowStart === null) lowStart = i * windowSize / sampleRate
    } else {
      if (lowStart !== null) {
        const end = i * windowSize / sampleRate
        const duration = end - lowStart
        if (duration >= minDuration) {
          sections.push({ start: lowStart, end, duration, confidence: 1, rms: energies[i - 1] ?? 0 })
        }
        lowStart = null
      }
    }
  }

  if (lowStart !== null) {
    const end = audio.length / sampleRate
    const duration = end - lowStart
    if (duration >= minDuration) {
      sections.push({ start: lowStart, end, duration, confidence: 1, rms: 0 })
    }
  }

  return sections
}
