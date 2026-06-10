import type { ContentAnalysis, HookInfo, EditDecision, StyleProfile } from './types'

export interface RetentionAnalysis {
  hook: HookInfo | null
  lowEnergyRegions: { start: number; end: number; duration: number }[]
  repetitiveRegions: { start: number; end: number; reason: string }[]
  topicChanges: { time: number; newTopic: string }[]
  highValueMoments: { time: number; reason: string; weight: number }[]
}

export function analyzeRetention(
  segments: { start: number; end: number; text: string }[],
  analysis: ContentAnalysis,
  hooks: HookInfo[],
  silenceSegments: { start: number; end: number; duration: number; confidence: number }[],
  duration: number,
): RetentionAnalysis {
  const lowEnergyRegions = silenceSegments
    .filter((s) => s.duration >= 1.0 && s.confidence > 0.3)
    .map((s) => ({ start: s.start, end: s.end, duration: s.duration }))

  const repetitiveRegions: RetentionAnalysis['repetitiveRegions'] = []
  const topicChanges: RetentionAnalysis['topicChanges'] = []

  const uniquePhrases = new Set<string>()
  for (let i = 0; i < segments.length; i++) {
    const text = segments[i].text.trim().toLowerCase()
    if (text.length > 20) {
      const keyPhrase = text.split(/\s+/).slice(0, 8).join(' ')
      if (uniquePhrases.has(keyPhrase)) {
        repetitiveRegions.push({
          start: segments[i].start,
          end: segments[i].end,
          reason: 'Repetitive content',
        })
      }
      uniquePhrases.add(keyPhrase)
    }
  }

  const topicMarkers = [
    /^(so |)now (let|we)/i, /^(next|moving on|another)/i,
    /^(and |)speaking of/i, /^(so |)that said/i,
    /^(anyway|alright|okay|right) (so |)/i,
    /^(the )?(next|second|third|final)/i,
  ]
  for (const seg of segments) {
    if (topicMarkers.some((m) => m.test(seg.text))) {
      topicChanges.push({ time: seg.start, newTopic: seg.text.slice(0, 50) })
    }
  }

  const highValueMoments: RetentionAnalysis['highValueMoments'] = []

  for (const moment of analysis.importantMoments) {
    highValueMoments.push({
      time: moment.time,
      reason: moment.description,
      weight: moment.confidence,
    })
  }

  for (const emotional of analysis.emotionalMoments) {
    highValueMoments.push({
      time: emotional.time,
      reason: `Emotional moment: ${emotional.emotion}`,
      weight: emotional.intensity,
    })
  }

  const segmentDurations = segments.map((s) => s.end - s.start)
  const avgDuration = segmentDurations.reduce((a, b) => a + b, 0) / Math.max(1, segmentDurations.length)
  for (const seg of segments) {
    if (seg.end - seg.start > avgDuration * 2.5) {
      highValueMoments.push({
        time: seg.start,
        reason: `Long segment: "${seg.text.slice(0, 40)}..."`,
        weight: 0.4,
      })
    }
  }

  highValueMoments.sort((a, b) => b.weight - a.weight)

  return {
    hook: hooks[0] ?? null,
    lowEnergyRegions,
    repetitiveRegions,
    topicChanges,
    highValueMoments: highValueMoments.slice(0, 10),
  }
}

export function generateRetentionEdits(
  retention: RetentionAnalysis,
  style: StyleProfile,
): { type: 'trim'; clipId: string; slot: 'A' | 'B'; startTime: number; endTime: number; justification: string }[] {
  const edits: {
    type: 'trim'
    clipId: string
    slot: 'A' | 'B'
    startTime: number
    endTime: number
    justification: string
  }[] = []

  for (const region of retention.lowEnergyRegions) {
    edits.push({
      type: 'trim',
      clipId: '',
      slot: 'A',
      startTime: region.start,
      endTime: region.end,
      justification: `Removed ${region.duration.toFixed(1)}s of dead air`,
    })
  }

  return edits
}
