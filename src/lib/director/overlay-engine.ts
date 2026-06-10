import type { ContentAnalysis, OverlayPlacement, OverlayDecision, StyleProfile, InstructionOverrides } from './types'

interface OverlayInput {
  overlayClip: { id: string; fileName: string; duration: number }
  mainClips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[]
  contentAnalysis: ContentAnalysis
  segments: { start: number; end: number; text: string }[]
  timelineDuration: number
  style: StyleProfile
  overrides: InstructionOverrides
}

const PLACEMENT_PREFERENCES: Record<string, OverlayPlacement> = {
  tech: 'pip',
  tutorial: 'left',
  educational: 'left',
  gaming: 'fullscreen',
  entertainment: 'right',
  vlog: 'center',
  cooking: 'pip',
  'food-review': 'pip',
  'tech-review': 'pip',
  'product-review': 'right',
  'general-review': 'right',
  podcast: 'center',
}

function extractOverlayKeywords(fileName: string): string[] {
  return fileName
    .replace(/\.\w+$/, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

export function matchKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function findRelevantTimeRange(
  keywords: string[],
  segments: { start: number; end: number; text: string }[],
  contentAnalysis: ContentAnalysis,
): { start: number; end: number; confidence: number } | null {
  if (segments.length === 0) return null

  const matchedSegments: { start: number; end: number; score: number }[] = []

  for (const seg of segments) {
    const text = seg.text.toLowerCase()
    let score = 0

    for (const kw of keywords) {
      if (matchKeyword(text, kw)) {
        score += kw.length > 4 ? 3 : 1
      }
    }

    for (const subject of contentAnalysis.keySubjects) {
      if (matchKeyword(text, subject)) {
        score += 2
      }
    }

    for (const obj of contentAnalysis.keyObjects) {
      if (matchKeyword(text, obj)) {
        score += 2
      }
    }

    for (const kw of contentAnalysis.keywords) {
      if (matchKeyword(text, kw)) {
        score += 1
      }
    }

    if (score > 0) {
      matchedSegments.push({ start: seg.start, end: seg.end, score })
    }
  }

  if (matchedSegments.length > 0) {
    const best = matchedSegments.reduce((a, b) => (a.score > b.score ? a : b))
    return {
      start: Math.max(0, best.start - 0.5),
      end: Math.min(segments[segments.length - 1]?.end ?? best.end, best.end + 0.5),
      confidence: Math.min(1, best.score / 10),
    }
  }

  for (const moment of contentAnalysis.importantMoments) {
    const seg = segments.find(
      (s) => s.start <= moment.time && s.end >= moment.time,
    )
    if (seg) {
      return {
        start: Math.max(0, seg.start - 0.3),
        end: Math.min(segments[segments.length - 1]?.end ?? seg.end, seg.end + 0.5),
        confidence: moment.confidence * 0.8,
      }
    }
  }

  return null
}

function determinePlacement(
  contentAnalysis: ContentAnalysis,
  style: StyleProfile,
  overrides: InstructionOverrides,
): OverlayPlacement {
  const categoryDefault = PLACEMENT_PREFERENCES[contentAnalysis.category] ?? 'right'

  if (overrides.framingStyle === 'close-up') return 'pip'
  if (overrides.framingStyle === 'wide') return 'center'
  if (overrides.framingStyle === 'medium') return 'right'

  if (style.overlayFrequency === 'frequent') return 'center'
  if (style.overlayFrequency === 'rare') return 'pip'

  if (contentAnalysis.category === 'gaming') return 'fullscreen'
  if (contentAnalysis.category === 'educational') return 'left'
  if (contentAnalysis.category === 'tutorial') return 'left'
  if (contentAnalysis.category === 'tech-review') return 'pip'
  if (contentAnalysis.category === 'product-review') return 'right'
  if (contentAnalysis.category === 'food-review') return 'pip'
  if (contentAnalysis.category === 'podcast') return 'center'

  return categoryDefault
}

export function determineOverlayDecisions(input: OverlayInput): OverlayDecision[] {
  const decisions: OverlayDecision[] = []
  const overlayKeywords = extractOverlayKeywords(input.overlayClip.fileName)

  const relevantRange = findRelevantTimeRange(
    overlayKeywords,
    input.segments,
    input.contentAnalysis,
  )

  const placement = determinePlacement(
    input.contentAnalysis,
    input.style,
    input.overrides,
  )

  const scaleMap: Record<OverlayPlacement, number> = {
    center: 0.5,
    left: 0.35,
    right: 0.35,
    pip: 0.25,
    fullscreen: 1.0,
  }

  const opacityMap: Record<OverlayPlacement, number> = {
    center: 0.9,
    left: 0.85,
    right: 0.85,
    pip: 0.95,
    fullscreen: 1.0,
  }

  if (relevantRange) {
    decisions.push({
      overlayClipId: input.overlayClip.id,
      startTime: relevantRange.start,
      endTime: Math.min(relevantRange.end, relevantRange.start + input.overlayClip.duration),
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      reason: `Overlay "${input.overlayClip.fileName}" placed at ${relevantRange.start.toFixed(1)}s (keyword match, confidence ${(relevantRange.confidence * 100).toFixed(0)}%)`,
    })
  } else if (input.contentAnalysis.importantMoments.length > 0) {
    const moment = input.contentAnalysis.importantMoments[0]
    decisions.push({
      overlayClipId: input.overlayClip.id,
      startTime: Math.max(0, moment.time - 0.5),
      endTime: Math.min(input.timelineDuration, moment.time + input.overlayClip.duration),
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      reason: `Overlay "${input.overlayClip.fileName}" aligned with important moment: "${moment.description.slice(0, 40)}"`,
    })
  } else {
    const midPoint = input.timelineDuration * 0.3
    decisions.push({
      overlayClipId: input.overlayClip.id,
      startTime: midPoint,
      endTime: Math.min(input.timelineDuration, midPoint + input.overlayClip.duration),
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      reason: `Overlay "${input.overlayClip.fileName}" placed at ${midPoint.toFixed(1)}s (no specific keyword match)`,
    })
  }

  return decisions
}
