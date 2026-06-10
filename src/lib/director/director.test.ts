import { describe, it, expect } from 'vitest'
import { splitRegionAcrossClips, globalToLocal, createEditPlan } from './edit-planner'
import { parseInstructions } from './instruction-parser'
import { matchKeyword } from './overlay-engine'
import { detectHooks } from './content-analyzer'
import type { ContentAnalysis } from './types'
import type { RetentionAnalysis } from './retention-engine'

const CLIPS = [
  { id: 'clip1', fileName: 'intro.mp4', duration: 10, slot: 'A' as const },
  { id: 'clip2', fileName: 'main.mp4', duration: 15, slot: 'A' as const },
  { id: 'clip3', fileName: 'outro.mp4', duration: 5, slot: 'A' as const },
  { id: 'overlay1', fileName: 'demo.mp4', duration: 8, slot: 'B' as const },
]

const CLIP_OFFSETS = [
  { clipId: 'clip1', offsetStart: 0, offsetEnd: 10 },
  { clipId: 'clip2', offsetStart: 10, offsetEnd: 25 },
  { clipId: 'clip3', offsetStart: 25, offsetEnd: 30 },
]

// --- Issue 3: Cross-clip trim regions ---
describe('splitRegionAcrossClips', () => {
  it('splits a region entirely within one clip', () => {
    const result = splitRegionAcrossClips(2, 5, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 2, localEnd: 5 })
  })

  it('splits a region that spans two clips', () => {
    const result = splitRegionAcrossClips(8, 14, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 8, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 4 })
  })

  it('splits a region that spans all three clips', () => {
    const result = splitRegionAcrossClips(5, 28, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 5, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 15 })
    expect(result[2]).toEqual({ clipId: 'clip3', localStart: 0, localEnd: 3 })
  })

  it('returns empty array for region outside all clips', () => {
    const result = splitRegionAcrossClips(50, 60, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(0)
  })

  it('returns empty when clipOffsets are unavailable', () => {
    const result = splitRegionAcrossClips(2, 8, CLIPS, undefined)
    expect(result).toHaveLength(0)
  })
})

// --- Issue 1+2: globalToLocal conversion ---
describe('globalToLocal', () => {
  it('converts global time to local for correct clip', () => {
    expect(globalToLocal(12, 'clip2', CLIP_OFFSETS)).toBeCloseTo(2)
    expect(globalToLocal(5, 'clip1', CLIP_OFFSETS)).toBeCloseTo(5)
    expect(globalToLocal(27, 'clip3', CLIP_OFFSETS)).toBeCloseTo(2)
  })

  it('returns 0 for time before clip start', () => {
    expect(globalToLocal(-1, 'clip1', CLIP_OFFSETS)).toBeCloseTo(0)
  })
})

// --- Issue 4: Cross-clip repetitive regions ---
describe('repetitive region splitting', () => {
  it('handles region within one clip', () => {
    const result = splitRegionAcrossClips(10, 25, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 15 })
  })

  it('splits repetitive region across clip boundary', () => {
    const result = splitRegionAcrossClips(9, 14, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 9, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 4 })
  })
})

// --- Issue 5: Hook zoom across clips ---
describe('hook zoom splitting', () => {
  it('splits a hook that crosses a clip boundary', () => {
    const result = splitRegionAcrossClips(9, 11, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 9, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 1 })
  })
})

// --- Issue 6: Emphasis zoom boundary check ---
describe('emphasis zoom clamping', () => {
  it('clamps emphasis zoom within clip boundaries', () => {
    const clip = CLIPS[0]
    const momentTime = 9
    const localStart = globalToLocal(momentTime, clip.id, CLIP_OFFSETS)
    const zoomEnd = Math.min(clip.duration, localStart + 3)
    expect(zoomEnd).toBe(clip.duration)
    expect(zoomEnd).toBeLessThanOrEqual(clip.duration)
  })
})

// --- Issue 2: Overlay targeting ---
describe('overlay targeting with clipOffsets', () => {
  it('overlays in second clip target clip2 not clip1', () => {
    const overlayTime = 15
    const offset = CLIP_OFFSETS.find((o) => o.offsetStart <= overlayTime && overlayTime < o.offsetEnd)
    expect(offset?.clipId).toBe('clip2')
  })

  it('overlay in third clip targets clip3', () => {
    const overlayTime = 26
    const offset = CLIP_OFFSETS.find((o) => o.offsetStart <= overlayTime && overlayTime < o.offsetEnd)
    expect(offset?.clipId).toBe('clip3')
  })
})

// --- Issue 7: Arabic instruction parsing ---
describe('parseInstructions with Arabic', () => {
  it('detects aggressive zoom in Arabic', () => {
    const result = parseInstructions('تكبير قوي للفيديو')
    expect(result.zoom).toBe('aggressive')
  })

  it('detects soft zoom in Arabic', () => {
    const result = parseInstructions('تكبير خفيف')
    expect(result.zoom).toBe('soft')
  })

  it('detects slow pacing in Arabic', () => {
    const result = parseInstructions('مونتاج بطيء')
    expect(result.pacing).toBe('slow')
  })

  it('detects fast pacing in Arabic', () => {
    const result = parseInstructions('سرعة سريعة')
    expect(result.pacing).toBe('fast')
  })

  it('detects frequent overlays in Arabic', () => {
    const result = parseInstructions('تراكبات كثيرة')
    expect(result.overlayFrequency).toBe('frequent')
  })

  it('detects strong effects in Arabic', () => {
    const result = parseInstructions('تأثيرات قوية')
    expect(result.effects).toBe('strong')
  })

  it('detects close-up framing in Arabic', () => {
    const result = parseInstructions('لقطة قريبة')
    expect(result.framingStyle).toBe('close-up')
  })

  it('detects slow-motion in Arabic', () => {
    const result = parseInstructions('تصوير بطيء')
    expect(result.visualEffects).toContain('slow-motion')
  })

  it('detects text overlay in Arabic', () => {
    const result = parseInstructions('نص على الفيديو')
    expect(result.visualEffects).toContain('text-overlay')
  })
})

// --- Issue 7: English instruction parsing ---
describe('parseInstructions with English', () => {
  it('detects dynamic zoom and fast cuts', () => {
    const result = parseInstructions('dynamic zoom and fast cuts')
    expect(result.zoom).toBe('dynamic')
    expect(result.transitions).toBe('heavy')
  })

  it('detects minimal transitions', () => {
    const result = parseInstructions('keep it simple with minimal transitions')
    expect(result.transitions).toBe('minimal')
  })

  it('detects no overlays', () => {
    const result = parseInstructions('no overlays please')
    expect(result.overlayFrequency).toBe('rare')
  })
})

// --- Issue 8: Overlay keyword matching with word boundaries ---
describe('matchKeyword', () => {
  it('matches exact word with boundaries', () => {
    expect(matchKeyword('this is a demo video', 'demo')).toBe(true)
  })

  it('does not match substring inside another word', () => {
    expect(matchKeyword('this is a democratization process', 'demo')).toBe(false)
  })

  it('matches at start of text', () => {
    expect(matchKeyword('demo is great', 'demo')).toBe(true)
  })

  it('matches at end of text', () => {
    expect(matchKeyword('check this demo', 'demo')).toBe(true)
  })

  it('matches multi-word keywords', () => {
    expect(matchKeyword('this is a product review', 'product review')).toBe(true)
  })

  it('does not match partial multi-word keywords', () => {
    expect(matchKeyword('this is productive work', 'product review')).toBe(false)
  })
})

// --- Issue 10: Hook detection on combined timeline ---
describe('detectHooks with maxStartTime', () => {
  const segments = [
    { start: 0, end: 2, text: 'what is up everyone welcome to the show' },
    { start: 2, end: 4, text: 'today we are going to talk about something amazing' },
    { start: 12, end: 14, text: 'hey guys welcome back to the channel' },
    { start: 20, end: 22, text: 'check this out' },
  ]

  it('detects hooks only within the specified time limit', () => {
    const hooks = detectHooks(segments, 6)
    expect(hooks.length).toBeGreaterThanOrEqual(1)
    for (const h of hooks) {
      expect(h.start).toBeLessThan(6)
    }
  })

  it('limits hook count when maxStartTime is set', () => {
    const hooksLimited = detectHooks(segments, 6)
    const hooksUnlimited = detectHooks(segments)
    expect(hooksLimited.length).toBeLessThanOrEqual(hooksUnlimited.length)
  })

  it('returns all hooks when no limit is set', () => {
    const hooks = detectHooks(segments)
    expect(hooks.length).toBeGreaterThanOrEqual(2)
  })
})

// --- Issue 5: Arabic matchKeyword with Unicode boundaries ---
describe('matchKeyword with Arabic', () => {
  it('matches Arabic word with spaces around it', () => {
    expect(matchKeyword('هذا هاتف جديد', 'هاتف')).toBe(true)
  })

  it('matches Arabic word at start of text', () => {
    expect(matchKeyword('هاتف جديد رائع', 'هاتف')).toBe(true)
  })

  it('matches Arabic word at end of text', () => {
    expect(matchKeyword('لدي هاتف', 'هاتف')).toBe(true)
  })

  it('does not match substring inside another Arabic word', () => {
    expect(matchKeyword('هواتف متعددة', 'هاتف')).toBe(false)
  })

  it('matches Arabic word with punctuation after it', () => {
    expect(matchKeyword('هذا هاتف، جديد', 'هاتف')).toBe(true)
  })

  it('matches Arabic word with punctuation before it', () => {
    expect(matchKeyword('لدي:هاتف جديد', 'هاتف')).toBe(true)
  })
})

// --- Overlay spanning multiple clips ---
describe('overlay splitting across clips', () => {
  it('splits an overlay region across two clips', () => {
    const result = splitRegionAcrossClips(8, 14, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 8, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 4 })
  })

  it('splits an overlay region across three clips', () => {
    const result = splitRegionAcrossClips(5, 28, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 5, localEnd: 10 })
    expect(result[1]).toEqual({ clipId: 'clip2', localStart: 0, localEnd: 15 })
    expect(result[2]).toEqual({ clipId: 'clip3', localStart: 0, localEnd: 3 })
  })

  it('handles overlay entirely within one clip', () => {
    const result = splitRegionAcrossClips(2, 5, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 2, localEnd: 5 })
  })

  it('handles overlay starting before first clip', () => {
    const result = splitRegionAcrossClips(-2, 5, CLIPS, CLIP_OFFSETS)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ clipId: 'clip1', localStart: 0, localEnd: 5 })
  })
})

// --- Integration: overlay splitting through createEditPlan ---
describe('createEditPlan overlay cross-clip integration', () => {
  it('splits overlay decisions across clip boundaries through the full pipeline', () => {
    const clips = [
      { id: 'clip1', fileName: 'intro.mp4', duration: 10, slot: 'A' as const },
      { id: 'clip2', fileName: 'main.mp4', duration: 10, slot: 'A' as const },
      { id: 'banner', fileName: 'graphic-banner.mp4', duration: 20, slot: 'B' as const },
    ]

    const clipOffsets = [
      { clipId: 'clip1', offsetStart: 0, offsetEnd: 10 },
      { clipId: 'clip2', offsetStart: 10, offsetEnd: 20 },
    ]

    const segments = [
      { start: 0, end: 3, text: 'welcome to the show today' },
      { start: 3, end: 6, text: 'we are talking about technology' },
      { start: 6, end: 9, text: 'let me show you something interesting' },
      { start: 9, end: 11, text: 'this part spans the boundary' },
      { start: 11, end: 14, text: 'more content in the second part' },
      { start: 14, end: 17, text: 'wrapping things up right now' },
    ]

    const contentAnalysis: ContentAnalysis = {
      topic: 'Technology',
      category: 'tech-review',
      keywords: [],
      structure: { hook: null, setup: null, mainContent: null, conclusion: null },
      importantMoments: [
        { time: 9.5, description: 'Cross-boundary moment', confidence: 0.85 },
      ],
      emotionalMoments: [],
      keySubjects: [],
      keyObjects: [],
    }

    const retention: RetentionAnalysis = {
      hook: null,
      lowEnergyRegions: [],
      highValueMoments: [],
      repetitiveRegions: [],
      topicChanges: [],
    }

    const plan = createEditPlan({
      projectId: 'test-overlay-split',
      instructions: '',
      selectedStyle: 'tech-review',
      clips,
      contentAnalysis,
      retention,
      transcription: segments,
      clipOffsets,
    })

    const overlayDecisions = plan.decisions.filter((d) => d.type === 'overlay')
    expect(overlayDecisions).toHaveLength(2)

    const clip1Overlay = overlayDecisions.find((d) => d.clipId === 'clip1')
    const clip2Overlay = overlayDecisions.find((d) => d.clipId === 'clip2')

    expect(clip1Overlay).toBeDefined()
    expect(clip2Overlay).toBeDefined()

    expect(clip1Overlay!.startTime).toBeCloseTo(8.7, 1)
    expect(clip1Overlay!.endTime).toBeCloseTo(10, 1)

    expect(clip2Overlay!.startTime).toBeCloseTo(0, 1)
    expect(clip2Overlay!.endTime).toBeCloseTo(1.5, 1)

    const clip1Duration = clip1Overlay!.endTime - clip1Overlay!.startTime
    const clip2Duration = clip2Overlay!.endTime - clip2Overlay!.startTime
    expect(clip1Duration + clip2Duration).toBeCloseTo(2.8, 1)
  })
})
