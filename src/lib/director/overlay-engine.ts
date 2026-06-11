import type { ContentAnalysis, OverlayPlacement, OverlayDecision, StyleProfile, InstructionOverrides } from './types'

interface OverlayInput {
  overlayClip: { id: string; fileName: string; duration: number }
  index: number
  totalOverlays: number
  mainClips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[]
  contentAnalysis: ContentAnalysis
  segments: { start: number; end: number; text: string }[]
  timelineDuration: number
  style: StyleProfile
  overrides: InstructionOverrides
  usedSlots: { start: number; end: number }[]
}

interface CandidateSlot {
  start: number
  end: number
  priority: number
  reason: string
  source: 'important-moment' | 'jump-cut' | 'talking-stretch'
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

const MIN_OVERLAY_DURATION = 2
const MAX_OVERLAY_DURATION = 10
const TALKING_STRETCH_MIN = 8
const JUMP_CUT_BUFFER = 0.3

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
  return new RegExp(
    `(?:^|[^\\p{L}])${escaped}(?=[^\\p{L}]|$)`,
    'iu',
  ).test(text)
}

function findCandidateSlots(
  segments: { start: number; end: number; text: string }[],
  contentAnalysis: ContentAnalysis,
  timelineDuration: number,
): CandidateSlot[] {
  const slots: CandidateSlot[] = []

  for (const moment of contentAnalysis.importantMoments) {
    if (moment.time < timelineDuration) {
      const start = Math.max(0, moment.time - 0.5)
      const end = Math.min(timelineDuration, moment.time + 3)
      slots.push({
        start,
        end,
        priority: 10 + (moment.confidence > 0.7 ? 5 : 0),
        reason: `Important moment: ${moment.description.slice(0, 50)}`,
        source: 'important-moment',
      })
    }
  }

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end
    if (gap > 0.1 && gap < 2) {
      const cutPoint = (segments[i - 1].end + segments[i].start) / 2
      const start = Math.max(0, cutPoint - JUMP_CUT_BUFFER)
      const end = Math.min(timelineDuration, cutPoint + 1.5)
      slots.push({
        start,
        end,
        priority: 8,
        reason: `Jump-cut transition at ${cutPoint.toFixed(1)}s`,
        source: 'jump-cut',
      })
    }
  }

  let stretchStart = -1
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.end - seg.start > 3) {
      if (stretchStart < 0) stretchStart = seg.start
      const stretchDuration = seg.end - stretchStart
      if (stretchDuration >= TALKING_STRETCH_MIN && (i === segments.length - 1 || segments[i + 1].start - seg.end > 1)) {
        const overEnd = Math.min(timelineDuration, seg.start + 4)
        slots.push({
          start: seg.start,
          end: overEnd,
          priority: 6,
          reason: `Visual relief during long talking stretch starting at ${seg.start.toFixed(1)}s`,
          source: 'talking-stretch',
        })
        stretchStart = -1
      }
    } else {
      stretchStart = -1
    }
  }

  return slots.sort((a, b) => b.priority - a.priority)
}

function calculateKenBurns(
  placement: OverlayPlacement,
  _overlayDuration: number,
): { panStartX: number; panStartY: number; panEndX: number; panEndY: number } | undefined {
  if (placement === 'fullscreen') {
    return {
      panStartX: 0,
      panStartY: -5,
      panEndX: 0,
      panEndY: 0,
    }
  }
  if (placement === 'center' || placement === 'pip') {
    return {
      panStartX: 0,
      panStartY: 0,
      panEndX: 0,
      panEndY: 0,
    }
  }
  return undefined
}

function assignSlotsToOverlays(
  slots: CandidateSlot[],
  overlayClips: { id: string; fileName: string; duration: number; index: number; totalOverlays: number }[],
  segments: { start: number; end: number; text: string }[],
  _contentAnalysis: ContentAnalysis,
  timelineDuration: number,
): { clipId: string; startTime: number; endTime: number; reason: string; confidence: number }[] {
  const assignments: { clipId: string; startTime: number; endTime: number; reason: string; confidence: number }[] = []
  const usedRanges: { start: number; end: number }[] = []

  for (const oc of overlayClips) {
    let assigned = false

    const overlayKeywords = extractOverlayKeywords(oc.fileName)
    let bonusScore = 0
    if (overlayKeywords.length > 0) {
      for (const seg of segments) {
        for (const kw of overlayKeywords) {
          if (matchKeyword(seg.text.toLowerCase(), kw)) {
            bonusScore += 2
          }
        }
      }
    }

    for (const slot of slots) {
      const slotDuration = slot.end - slot.start
      if (slotDuration < MIN_OVERLAY_DURATION) continue

      const isOverlapping = usedRanges.some(
        (r) => r.start < slot.end && r.end > slot.start,
      )
      if (isOverlapping) continue

      const overlayFit = Math.min(oc.duration, slotDuration, MAX_OVERLAY_DURATION)
      if (overlayFit < MIN_OVERLAY_DURATION) continue

      const endTime = Math.min(slot.start + overlayFit, timelineDuration)
      if (endTime <= slot.start) continue

      assignments.push({
        clipId: oc.id,
        startTime: slot.start,
        endTime,
        reason: slot.reason + (bonusScore > 0 ? ` (keyword bonus: +${bonusScore})` : ''),
        confidence: Math.min(1, (slot.priority + bonusScore) / 20),
      })
      usedRanges.push({ start: slot.start, end: endTime })
      assigned = true
      break
    }

    if (!assigned) {
      const fallbackStart = Math.min(timelineDuration * 0.3, timelineDuration - MIN_OVERLAY_DURATION)
      const fallbackEnd = Math.min(fallbackStart + oc.duration, timelineDuration)
      if (fallbackEnd > fallbackStart) {
        assignments.push({
          clipId: oc.id,
          startTime: Math.max(0, fallbackStart),
          endTime: fallbackEnd,
          reason: `Fallback placement at ${fallbackStart.toFixed(1)}s (no specific slot available)`,
          confidence: 0.3,
        })
      }
    }
  }

  return assignments
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
  const slots = findCandidateSlots(input.segments, input.contentAnalysis, input.timelineDuration)

  const entries = [{
    id: input.overlayClip.id,
    fileName: input.overlayClip.fileName,
    duration: input.overlayClip.duration,
    index: input.index,
    totalOverlays: input.totalOverlays,
  }]

  const assignments = assignSlotsToOverlays(
    slots,
    entries,
    input.segments,
    input.contentAnalysis,
    input.timelineDuration,
  )

  const placement = determinePlacement(input.contentAnalysis, input.style, input.overrides)

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

  for (const assignment of assignments) {
    const kenBurns = calculateKenBurns(placement, assignment.endTime - assignment.startTime)
    const params: Record<string, unknown> = {
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      muted: true,
    }
    if (kenBurns) {
      params.panStartX = kenBurns.panStartX
      params.panStartY = kenBurns.panStartY
      params.panEndX = kenBurns.panEndX
      params.panEndY = kenBurns.panEndY
    }
    if (input.overrides.safeFrameCenter) {
      params.safeFrameCenter = true
    }

    decisions.push({
      overlayClipId: assignment.clipId,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      reason: assignment.reason,
    })
  }

  if (decisions.length === 0) {
    const midPoint = input.timelineDuration * 0.3
    decisions.push({
      overlayClipId: input.overlayClip.id,
      startTime: midPoint,
      endTime: Math.min(input.timelineDuration, midPoint + input.overlayClip.duration),
      placement,
      scale: scaleMap[placement],
      opacity: opacityMap[placement],
      reason: `Overlay "${input.overlayClip.fileName}" placed at ${midPoint.toFixed(1)}s (fallback)`,
    })
  }

  return decisions
}
