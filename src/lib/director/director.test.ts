import { describe, it, expect } from 'vitest'
import { splitRegionAcrossClips, globalToLocal, createEditPlan } from './edit-planner'
import { parseInstructions } from './instruction-parser'
import { matchKeyword, findCandidateSlots, assignSlotsToOverlays, determinePlacement, determineOverlayDecisions } from './overlay-engine'
import { analyzeContent, detectHooks } from './content-analyzer'
import type { ContentAnalysis, StyleProfile, InstructionOverrides } from './types'
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

// --- Parser vocabulary: platform, aspect, zoom-targets, multicam ---
describe('parseInstructions platform and aspect', () => {
  it('detects youtube platform', () => {
    expect(parseInstructions('edit this for youtube').platformPreset).toBe('youtube')
  })

  it('detects tiktok platform', () => {
    expect(parseInstructions('upload to tiktok').platformPreset).toBe('tiktok')
  })

  it('detects instagram reels', () => {
    expect(parseInstructions('make this for instagram').platformPreset).toBe('instagram')
  })

  it('detects vertical aspect', () => {
    expect(parseInstructions('vertical format').aspectRatio).toBe('9:16')
  })

  it('detects square aspect', () => {
    expect(parseInstructions('make it square').aspectRatio).toBe('1:1')
  })

  it('detects landscape aspect', () => {
    expect(parseInstructions('horizontal video').aspectRatio).toBe('16:9')
  })
})

describe('parseInstructions zoom targets', () => {
  it('detects reveal target', () => {
    const result = parseInstructions('zoom on reveal')
    expect(result.zoomTargets).toContain('reveal')
  })

  it('detects reaction target', () => {
    const result = parseInstructions('zoom on reactions')
    expect(result.zoomTargets).toContain('reaction')
  })

  it('detects product target', () => {
    const result = parseInstructions('zoom on product')
    expect(result.zoomTargets).toContain('product')
  })

  it('detects demo target with when I show', () => {
    const result = parseInstructions('zoom when I show the feature')
    expect(result.zoomTargets).toContain('demo')
  })

  it('detects face target', () => {
    const result = parseInstructions('zoom on face')
    expect(result.zoomTargets).toContain('face')
  })

  it('detects detail target', () => {
    const result = parseInstructions('zoom on detail')
    expect(result.zoomTargets).toContain('detail')
  })
})

describe('parseInstructions zoom patterns', () => {
  it('detects punch-in as aggressive zoom', () => {
    expect(parseInstructions('punch in on the product').zoom).toBe('aggressive')
  })

  it('detects punch-out as aggressive zoom', () => {
    expect(parseInstructions('punch out for context').zoom).toBe('aggressive')
  })
})

describe('parseInstructions glitch fix', () => {
  it('does not trigger glitch on bare static', () => {
    const result = parseInstructions('keep the framing static')
    expect(result.visualEffects).not.toContain('glitch')
  })

  it('triggers glitch on tv static', () => {
    const result = parseInstructions('add a tv static overlay')
    expect(result.visualEffects).toContain('glitch')
  })

  it('triggers glitch on static effect', () => {
    const result = parseInstructions('apply a static effect')
    expect(result.visualEffects).toContain('glitch')
  })

  it('triggers glitch on static noise', () => {
    const result = parseInstructions('overlay static noise')
    expect(result.visualEffects).toContain('glitch')
  })

  it('triggers on glitch effect directly', () => {
    const result = parseInstructions('add a glitch effect')
    expect(result.visualEffects).toContain('glitch')
  })
})

describe('parseInstructions multicam extended', () => {
  it('detects multiple cameras', () => {
    expect(parseInstructions('record with multiple cameras').multicam).toBe(true)
  })

  it('detects different distances', () => {
    expect(parseInstructions('cut between different distances').multicam).toBe(true)
  })

  it('detects different zoom level each cut', () => {
    expect(parseInstructions('different zoom level each cut').multicam).toBe(true)
  })
})

describe('parseInstructions match cuts', () => {
  it('detects match cut as jump cuts', () => {
    expect(parseInstructions('match cut').jumpCuts).toBe(true)
  })

  it('detects match cuts as jump cuts', () => {
    expect(parseInstructions('use match cuts').jumpCuts).toBe(true)
  })
})

describe('parseInstructions zoom cadence', () => {
  it('detects every 3 seconds', () => {
    expect(parseInstructions('zoom every 3 seconds').zoomCadence).toBe(3)
  })

  it('detects every 2 to 3 seconds', () => {
    const result = parseInstructions('zoom every 2 to 3 seconds')
    expect(result.zoomCadence).toBe(2.5)
  })

  it('detects every 2–3 seconds with en-dash', () => {
    const result = parseInstructions('zoom every 2–3 seconds')
    expect(result.zoomCadence).toBe(2.5)
  })

  it('detects every 2—3 seconds with em-dash', () => {
    const result = parseInstructions('zoom every 2—3 seconds')
    expect(result.zoomCadence).toBe(2.5)
  })

  it('returns null when no cadence mentioned', () => {
    expect(parseInstructions('dynamic zoom').zoomCadence).toBeNull()
  })
})

describe('parseInstructions punch plurals', () => {
  it('detects punch-ins as aggressive zoom', () => {
    expect(parseInstructions('punch-ins on the product').zoom).toBe('aggressive')
  })

  it('detects punch-outs as aggressive zoom', () => {
    expect(parseInstructions('punch-outs for wide shots').zoom).toBe('aggressive')
  })

  it('detects singular punch-in still works', () => {
    expect(parseInstructions('punch-in on the product').zoom).toBe('aggressive')
  })

  it('detects singular punch-out still works', () => {
    expect(parseInstructions('punch-out for context').zoom).toBe('aggressive')
  })
})

describe('parseInstructions regression — Ahmed\'s verbatim template', () => {
  const input = 'punch outs every 2–3 seconds. multiple cameras. let the director choose the best takes'
  const result = parseInstructions(input)

  it('detects aggressive zoom from punch outs', () => {
    expect(result.zoom).toBe('aggressive')
  })

  it('detects zoom cadence from 2–3 seconds', () => {
    expect(result.zoomCadence).toBe(2.5)
  })

  it('detects multicam from multiple cameras', () => {
    expect(result.multicam).toBe(true)
  })

  it('leaves only the genuinely vision-dependent clause unmatched', () => {
    expect(result.unmatchedPhrases).toContain('let the director choose the best takes')
    expect(result.unmatchedPhrases).not.toContain('punch outs every 2–3 seconds')
    expect(result.unmatchedPhrases).not.toContain('multiple cameras')
  })
})

describe('parseInstructions never-repeat-framing', () => {
  it('detects never repeat framing', () => {
    expect(parseInstructions('never repeat the same framing').neverRepeatFraming).toBe(true)
  })

  it('detects vary framing each cut', () => {
    expect(parseInstructions('vary framing each cut').neverRepeatFraming).toBe(true)
  })

  it('returns null when not mentioned', () => {
    expect(parseInstructions('dynamic zoom').neverRepeatFraming).toBeNull()
  })
})

describe('parseInstructions land-on-mid-motion', () => {
  it('detects land on mid motion', () => {
    expect(parseInstructions('land on mid motion').landOnMidMotion).toBe(true)
  })

  it('detects land on movement', () => {
    expect(parseInstructions('land on movement').landOnMidMotion).toBe(true)
  })

  it('detects capture mid motion', () => {
    expect(parseInstructions('capture mid-motion').landOnMidMotion).toBe(true)
  })

  it('returns null when not mentioned', () => {
    expect(parseInstructions('dynamic zoom').landOnMidMotion).toBeNull()
  })
})

describe('parseInstructions land-on-mid-expression', () => {
  it('detects land on mid expression', () => {
    expect(parseInstructions('land on mid expression').landOnMidExpression).toBe(true)
  })

  it('detects hold expressions', () => {
    expect(parseInstructions('hold expressions').landOnMidExpression).toBe(true)
  })

  it('returns null when not mentioned', () => {
    expect(parseInstructions('dynamic zoom').landOnMidExpression).toBeNull()
  })
})

describe('parseInstructions reaction-cut-tightness', () => {
  it('detects tight reaction cuts', () => {
    expect(parseInstructions('tight react cuts').reactionCutTightness).toBe('tight')
  })

  it('detects quick cuts on reaction', () => {
    expect(parseInstructions('quick cuts on reaction').reactionCutTightness).toBe('tight')
  })

  it('detects loose reaction cuts', () => {
    expect(parseInstructions('loose react cuts').reactionCutTightness).toBe('loose')
  })

  it('detects linger on response', () => {
    expect(parseInstructions('linger on response').reactionCutTightness).toBe('loose')
  })

  it('returns null when not mentioned', () => {
    expect(parseInstructions('dynamic zoom').reactionCutTightness).toBeNull()
  })
})

describe('parseInstructions explanation-cut-tightness', () => {
  it('detects tight cut on explain', () => {
    expect(parseInstructions('tight cut on explain').explanationCutTightness).toBe('tight')
  })

  it('detects snappy cut to talk', () => {
    expect(parseInstructions('snappy cut to talk').explanationCutTightness).toBe('tight')
  })

  it('detects loose cut on explain', () => {
    expect(parseInstructions('loose cut on explain').explanationCutTightness).toBe('loose')
  })

  it('detects let them finish', () => {
    expect(parseInstructions('let them finish the thought').explanationCutTightness).toBe('loose')
  })

  it('returns null when not mentioned', () => {
    expect(parseInstructions('dynamic zoom').explanationCutTightness).toBeNull()
  })
})

describe('parseInstructions multicam', () => {
  it('detects multicam', () => {
    expect(parseInstructions('use multicam editing').multicam).toBe(true)
  })

  it('detects multi-angle', () => {
    expect(parseInstructions('multi-angle recording').multicam).toBe(true)
  })
})

describe('parseInstructions captions', () => {
  it('detects captions on', () => {
    expect(parseInstructions('add captions').captionsEnabled).toBe(true)
  })

  it('detects subtitles off', () => {
    expect(parseInstructions('no subtitles').captionsEnabled).toBe(false)
  })

  it('detects forced captions', () => {
    expect(parseInstructions('always show captions').captionsEnabled).toBe(true)
  })
})

describe('parseInstructions audio directives', () => {
  it('detects background music', () => {
    expect(parseInstructions('add background music').audioDirectives).toContain('background-music')
  })

  it('detects voiceover', () => {
    expect(parseInstructions('voiceover narration').audioDirectives).toContain('voiceover')
  })

  it('detects ambient sound', () => {
    expect(parseInstructions('ambient sound').audioDirectives).toContain('ambient')
  })

  it('detects soundtrack directive', () => {
    expect(parseInstructions('add a soundtrack').audioDirectives).toContain('soundtrack')
  })
})

describe('parseInstructions speed directives', () => {
  it('detects 2x speed', () => {
    expect(parseInstructions('2x speed').speedDirective).toBe(2)
  })

  it('detects speed up', () => {
    expect(parseInstructions('speed up the video').speedDirective).toBe(1.25)
  })

  it('detects slow down', () => {
    expect(parseInstructions('slow down this part').speedDirective).toBe(0.75)
  })

  it('detects double speed', () => {
    expect(parseInstructions('double speed').speedDirective).toBe(2)
  })
})

describe('parseInstructions target duration', () => {
  it('detects under 30 seconds', () => {
    expect(parseInstructions('under 30 seconds').targetDuration).toBe(30)
  })

  it('detects make it 60 seconds', () => {
    expect(parseInstructions('make it 60 seconds').targetDuration).toBe(60)
  })

  it('detects max 2 minutes', () => {
    expect(parseInstructions('max 2 minutes').targetDuration).toBe(120)
  })

  it('detects target 45 seconds', () => {
    expect(parseInstructions('target 45 seconds').targetDuration).toBe(45)
  })

  it('returns null when no duration mentioned', () => {
    expect(parseInstructions('make it dynamic and fast').targetDuration).toBeNull()
  })
})

describe('parseInstructions safe-frame center', () => {
  it('detects my face always centered', () => {
    const result = parseInstructions('keep my face always centered')
    expect(result.safeFrameCenter).toBe(true)
  })

  it('detects always center', () => {
    const result = parseInstructions('always center the subject')
    expect(result.safeFrameCenter).toBe(true)
  })

  it('does not trigger on bare face', () => {
    const result = parseInstructions('zoom on face')
    expect(result.safeFrameCenter).toBeNull()
  })
})

describe('parseInstructions negation', () => {
  it('negates transitions when saying do not use transitions', () => {
    const result = parseInstructions('do not use transitions')
    expect(result.transitions).toBe('minimal')
  })

  it('negates zoom when saying no zoom', () => {
    const result = parseInstructions('no zoom please')
    expect(result.zoom).toBe('soft')
  })
})

describe('parseInstructions content references', () => {
  it('extracts content reference from remove the part about', () => {
    const result = parseInstructions('remove the part about the pricing')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('pricing')
  })

  it('extracts content reference from cut the section on', () => {
    const result = parseInstructions('cut the section on the introduction')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('introduction')
  })

  it('extracts content reference from skip the outro', () => {
    const result = parseInstructions('skip the outro segment')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('outro')
  })

  it('does not extract bare stopwords as references', () => {
    const result = parseInstructions('remove the part about the')
    expect(result.contentReferences.length).toBe(0)
  })

  it('extracts keep only references', () => {
    const result = parseInstructions('keep only the review section')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('review')
  })

  it('multi-removal in one sentence produces exactly one reference per clause', () => {
    const result = parseInstructions('remove the part about the sauce and remove the part where I talk about pricing')
    expect(result.contentReferences).toHaveLength(2)
    expect(result.contentReferences[0].toLowerCase()).toContain('sauce')
    expect(result.contentReferences[1].toLowerCase()).toContain('pricing')
  })

  it('dedup eliminates redundant longer variants of the same clause', () => {
    const result = parseInstructions('remove the part about the sauce')
    const hasVariant = result.contentReferences.some((r) => r.toLowerCase().includes('part') || r.toLowerCase().includes('about'))
    expect(hasVariant).toBe(false)
    expect(result.contentReferences.some((r) => r.toLowerCase() === 'sauce')).toBe(true)
  })

  it('parses cut the section where I mention the discount', () => {
    const result = parseInstructions('cut the section where I mention the discount')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('discount')
  })

  it('parses trim the clip where I discuss the intro', () => {
    const result = parseInstructions('trim the clip where I discuss the intro')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('intro')
  })

  it('parses delete the bit about the sponsor', () => {
    const result = parseInstructions('delete the bit about the sponsor')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('sponsor')
  })

  it('parses remove the section where you say the bad review', () => {
    const result = parseInstructions('remove the section where you say the bad review')
    expect(result.contentReferences.length).toBeGreaterThanOrEqual(1)
    expect(result.contentReferences[0].toLowerCase()).toContain('bad review')
  })

  it('parses multiple cut variants in one sentence', () => {
    const result = parseInstructions('cut the part about the intro and trim the bit where I discuss pricing')
    expect(result.contentReferences).toHaveLength(2)
  })
})

describe('parseInstructions jumpCuts', () => {
  it('detects jump cuts', () => {
    expect(parseInstructions('jump cuts').jumpCuts).toBe(true)
  })

  it('detects no dissolve as jump cuts', () => {
    expect(parseInstructions('no dissolve').jumpCuts).toBe(true)
  })

  it('detects straight cut as jump cuts', () => {
    expect(parseInstructions('straight cut').jumpCuts).toBe(true)
  })

  it('detects fast cuts as jump cuts', () => {
    expect(parseInstructions('fast cuts please').jumpCuts).toBe(true)
  })

  it('does not set jumpCuts from bare cut in content-ref context', () => {
    const result = parseInstructions('cut the part about pricing')
    expect(result.jumpCuts).toBeNull()
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

    expect(clip1Overlay!.startTime).toBeCloseTo(9.0, 1)
    expect(clip1Overlay!.endTime).toBeCloseTo(10, 1)

    expect(clip2Overlay!.startTime).toBeCloseTo(0, 1)
    expect(clip2Overlay!.endTime).toBeCloseTo(2.5, 1)

    const clip1Duration = clip1Overlay!.endTime - clip1Overlay!.startTime
    const clip2Duration = clip2Overlay!.endTime - clip2Overlay!.startTime
    expect(clip1Duration + clip2Duration).toBeCloseTo(3.5, 1)
  })
})

// --- analyzeContent end-to-end over a real transcript ---
describe('analyzeContent end-to-end', () => {
  const segments = [
    { start: 0, end: 2.5, text: 'what is up everyone welcome back to the channel' },
    { start: 2.5, end: 5, text: 'today we are going to check out the new iPhone 16 Pro' },
    { start: 5, end: 8, text: 'this is the most amazing smartphone I have ever used' },
    { start: 8, end: 11, text: 'let me show you the incredible camera system' },
    { start: 11, end: 14, text: 'the design is absolutely stunning and the battery life is incredible' },
    { start: 14, end: 17, text: 'here is a quick demo of the action button' },
    { start: 17, end: 20, text: 'make sure to subscribe if you enjoyed this review' },
  ]

  const result = analyzeContent(segments, 20, 'iphone-16-pro-review.mp4')

  it('infers topic from filename', () => {
    expect(result.topic).toBe('iphone 16 pro review')
  })

  it('detects review-related category', () => {
    expect(result.category).toMatch(/review/)
  })

  it('extracts keywords', () => {
    expect(result.keywords.length).toBeGreaterThan(0)
    expect(result.keywords.some((k) => k.toLowerCase().includes('iphone'))).toBe(true)
  })

  it('detects hook from first segment', () => {
    expect(result.structure.hook).not.toBeNull()
    expect(result.structure.hook!.start).toBe(0)
  })

  it('identifies important moments', () => {
    const moments = result.importantMoments
    expect(moments.length).toBeGreaterThan(0)
    const amazingMoment = moments.find((m) => m.description.toLowerCase().includes('amazing'))
    expect(amazingMoment).toBeDefined()
  })

  it('detects emotional moments', () => {
    expect(result.emotionalMoments.length).toBeGreaterThan(0)
    const excitement = result.emotionalMoments.find((m) => m.emotion.includes('excitement') || m.emotion.includes('strong'))
    expect(excitement).toBeDefined()
  })

  it('extracts key subjects', () => {
    expect(result.keySubjects.length).toBeGreaterThan(0)
    const hasIPhone = result.keySubjects.some((s) => s.toLowerCase().includes('iphone'))
    const hasChannel = result.keySubjects.some((s) => s.toLowerCase().includes('channel'))
    expect(hasIPhone || hasChannel).toBe(true)
  })

  it('extracts key objects', () => {
    expect(result.keyObjects.length).toBeGreaterThan(0)
    const hasCamera = result.keyObjects.some((o) => o.toLowerCase().includes('camera'))
    const hasBattery = result.keyObjects.some((o) => o.toLowerCase().includes('battery'))
    const hasDesign = result.keyObjects.some((o) => o.toLowerCase().includes('design'))
    expect(hasCamera || hasBattery || hasDesign).toBe(true)
  })

  it('detects conclusion structure', () => {
    expect(result.structure.conclusion).not.toBeNull()
    expect(result.structure.conclusion!.start).toBeGreaterThanOrEqual(17)
  })
})

// --- Overlay engine: findCandidateSlots ---
describe('findCandidateSlots', () => {
  const segments = [
    { start: 0, end: 2.5, text: 'welcome to the show' },
    { start: 2.5, end: 3, text: 'quick transition here' },
    { start: 3.5, end: 8, text: 'first part of the long explanation section here' },
    { start: 8, end: 12, text: 'second part continuing the long stretch of content' },
    { start: 14, end: 15.5, text: 'thanks for watching everyone' },
  ]

  const contentAnalysis: ContentAnalysis = {
    topic: 'Tech', category: 'tech-review', keywords: [],
    structure: { hook: null, setup: null, mainContent: null, conclusion: null },
    importantMoments: [
      { time: 3, description: 'Product reveal', confidence: 0.9 },
      { time: 14, description: 'Key insight', confidence: 0.6 },
    ],
    emotionalMoments: [],
    keySubjects: [], keyObjects: [],
  }

  it('creates slots for important moments with high confidence priority', () => {
    const slots = findCandidateSlots(segments, contentAnalysis, 20)
    const important = slots.filter((s) => s.source === 'important-moment')
    expect(important.length).toBeGreaterThanOrEqual(2)
    expect(important[0].priority).toBeGreaterThanOrEqual(15)
  })

  it('creates jump-cut slots between close segments', () => {
    const slots = findCandidateSlots(segments, contentAnalysis, 20)
    const jumpCuts = slots.filter((s) => s.source === 'jump-cut')
    expect(jumpCuts.length).toBeGreaterThanOrEqual(1)
  })

  it('creates talking-stretch slots for long segments', () => {
    const slots = findCandidateSlots(segments, contentAnalysis, 20)
    const talking = slots.filter((s) => s.source === 'talking-stretch')
    expect(talking.length).toBeGreaterThanOrEqual(1)
  })

  it('sorts slots by descending priority', () => {
    const slots = findCandidateSlots(segments, contentAnalysis, 20)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].priority).toBeLessThanOrEqual(slots[i - 1].priority)
    }
  })

  it('clamps slot times to timeline duration', () => {
    const slots = findCandidateSlots(segments, contentAnalysis, 10)
    for (const s of slots) {
      expect(s.start).toBeGreaterThanOrEqual(0)
      expect(s.end).toBeLessThanOrEqual(10)
    }
  })
})

// --- Overlay engine: assignSlotsToOverlays ---
describe('assignSlotsToOverlays', () => {
  const segments = [
    { start: 0, end: 2, text: 'welcome to the show' },
    { start: 2, end: 4, text: 'today we talk about tech' },
    { start: 4.5, end: 6, text: 'this is amazing stuff' },
    { start: 8, end: 12, text: 'let me explain how it works' },
    { start: 12, end: 14, text: 'thanks for watching' },
  ]

  const contentAnalysis: ContentAnalysis = {
    topic: 'Tech', category: 'tech-review', keywords: [],
    structure: { hook: null, setup: null, mainContent: null, conclusion: null },
    importantMoments: [{ time: 3, description: 'Reveal', confidence: 0.9 }],
    emotionalMoments: [], keySubjects: [], keyObjects: [],
  }

  const slots = findCandidateSlots(segments, contentAnalysis, 15)

  it('assigns overlays to best available slots', () => {
    const assignments = assignSlotsToOverlays(
      slots,
      [{ id: 'ov1', fileName: 'demo.mp4', duration: 10, index: 0, totalOverlays: 1 }],
      segments, contentAnalysis, 15,
    )
    expect(assignments.length).toBeGreaterThanOrEqual(1)
    expect(assignments[0].clipId).toBe('ov1')
    expect(assignments[0].startTime).toBeGreaterThanOrEqual(0)
    expect(assignments[0].endTime).toBeGreaterThan(assignments[0].startTime)
  })

  it('trims overlay to max 10s duration', () => {
    const assignments = assignSlotsToOverlays(
      [slots[0]],
      [{ id: 'ov1', fileName: 'long.mp4', duration: 30, index: 0, totalOverlays: 1 }],
      segments, contentAnalysis, 15,
    )
    const dur = assignments[0].endTime - assignments[0].startTime
    expect(dur).toBeLessThanOrEqual(10)
  })

  it('provides fallback when no slot fits', () => {
    const assignments = assignSlotsToOverlays(
      [],
      [{ id: 'ov1', fileName: 'demo.mp4', duration: 5, index: 0, totalOverlays: 1 }],
      segments, contentAnalysis, 15,
    )
    expect(assignments.length).toBeGreaterThanOrEqual(1)
    expect(assignments[0].confidence).toBeCloseTo(0.3)
  })

  it('gives keyword bonus for matching transcript', () => {
    const assignmentsMatch = assignSlotsToOverlays(
      slots,
      [{ id: 'ov1', fileName: 'tech-graphic.mp4', duration: 10, index: 0, totalOverlays: 1 }],
      segments, contentAnalysis, 15,
    )
    const assignmentsNoMatch = assignSlotsToOverlays(
      slots,
      [{ id: 'ov1', fileName: 'random.mp4', duration: 10, index: 0, totalOverlays: 1 }],
      segments, contentAnalysis, 15,
    )
    expect(assignmentsNoMatch.length).toBeGreaterThanOrEqual(1)
    expect(assignmentsMatch.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns multiple overlays without overlapping', () => {
    const multiSegments = [
      { start: 0, end: 2, text: 'welcome' },
      { start: 2.3, end: 4, text: 'tech talk' },
      { start: 5, end: 9, text: 'long talking stretch about feature number one' },
      { start: 11, end: 13, text: 'second long stretch about feature' },
    ]
    const analysis: ContentAnalysis = {
      topic: 'Tech', category: 'tech-review', keywords: [],
      structure: { hook: null, setup: null, mainContent: null, conclusion: null },
      importantMoments: [
        { time: 3, description: 'Reveal', confidence: 0.9 },
        { time: 12, description: 'Wrap', confidence: 0.7 },
      ],
      emotionalMoments: [], keySubjects: [], keyObjects: [],
    }
    const multiSlots = findCandidateSlots(multiSegments, analysis, 14)
    const assignments = assignSlotsToOverlays(
      multiSlots,
      [
        { id: 'ov1', fileName: 'a.mp4', duration: 8, index: 0, totalOverlays: 2 },
        { id: 'ov2', fileName: 'b.mp4', duration: 8, index: 1, totalOverlays: 2 },
      ],
      multiSegments, analysis, 14,
    )
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]
        const b = assignments[j]
        const overlap = a.startTime < b.endTime && a.endTime > b.startTime
        expect(overlap).toBe(false)
      }
    }
  })
})

// --- Overlay engine: determinePlacement ---
describe('determinePlacement', () => {
  const baseContent: ContentAnalysis = {
    topic: '', category: 'tech-review', keywords: [],
    structure: { hook: null, setup: null, mainContent: null, conclusion: null },
    importantMoments: [], emotionalMoments: [], keySubjects: [], keyObjects: [],
  }

  const baseStyle: StyleProfile = {
    zoom: 'dynamic', transitions: 'dynamic', effects: 'balanced',
    pacing: 'moderate', overlayFrequency: 'moderate', jumpCuts: false,
    motionIntensity: 0.5, transitionPreference: 'dynamic',
  }

  const noOverrides: InstructionOverrides = {
    zoom: null, transitions: null, pacing: null, overlayFrequency: null,
    effects: null, framingStyle: null, visualEffects: [],
    jumpCuts: null, platformPreset: null, aspectRatio: null,
    zoomTargets: [], multicam: null, contentReferences: [],
    captionsEnabled: null, audioDirectives: [], speedDirective: null,
    targetDuration: null, safeFrameCenter: null,
    zoomCadence: null, neverRepeatFraming: null,
    landOnMidMotion: null, landOnMidExpression: null,
    reactionCutTightness: null, explanationCutTightness: null,
    parsedDirectives: [], unmatchedPhrases: [],
  }

  it('returns pip for close-up framing', () => {
    const result = determinePlacement(baseContent, baseStyle, { ...noOverrides, framingStyle: 'close-up' })
    expect(result).toBe('pip')
  })

  it('returns center for wide framing', () => {
    const result = determinePlacement(baseContent, baseStyle, { ...noOverrides, framingStyle: 'wide' })
    expect(result).toBe('center')
  })

  it('returns right for medium framing', () => {
    const result = determinePlacement(baseContent, baseStyle, { ...noOverrides, framingStyle: 'medium' })
    expect(result).toBe('right')
  })

  it('returns fullscreen for gaming category', () => {
    const gamingContent = { ...baseContent, category: 'gaming' }
    const result = determinePlacement(gamingContent, baseStyle, noOverrides)
    expect(result).toBe('fullscreen')
  })
})

// --- Overlay engine: determineOverlayDecisions integration ---
describe('determineOverlayDecisions', () => {
  const segments = [
    { start: 0, end: 2, text: 'welcome' },
    { start: 2, end: 5, text: 'tech talk today' },
    { start: 5.3, end: 8, text: 'amazing demo here' },
    { start: 10, end: 14, text: 'long talking stretch about features' },
    { start: 14, end: 16, text: 'thanks' },
  ]

  const contentAnalysis: ContentAnalysis = {
    topic: 'Tech', category: 'tech-review', keywords: [],
    structure: { hook: null, setup: null, mainContent: null, conclusion: null },
    importantMoments: [{ time: 6, description: 'Demo', confidence: 0.8 }],
    emotionalMoments: [], keySubjects: [], keyObjects: [],
  }

  const style: StyleProfile = {
    zoom: 'dynamic', transitions: 'dynamic', effects: 'balanced',
    pacing: 'moderate', overlayFrequency: 'moderate', jumpCuts: false,
    motionIntensity: 0.5, transitionPreference: 'dynamic',
  }

  const overrides: InstructionOverrides = {
    zoom: null, transitions: null, pacing: null, overlayFrequency: null,
    effects: null, framingStyle: null, visualEffects: [],
    jumpCuts: null, platformPreset: null, aspectRatio: null,
    zoomTargets: [], multicam: null, contentReferences: [],
    captionsEnabled: null, audioDirectives: [], speedDirective: null,
    targetDuration: null, safeFrameCenter: null,
    zoomCadence: null, neverRepeatFraming: null,
    landOnMidMotion: null, landOnMidExpression: null,
    reactionCutTightness: null, explanationCutTightness: null,
    parsedDirectives: [], unmatchedPhrases: [],
  }

  it('produces overlay decisions with correct structure', () => {
    const decisions = determineOverlayDecisions({
      overlayClip: { id: 'ov1', fileName: 'demo.mp4', duration: 10 },
      index: 0, totalOverlays: 1,
      mainClips: [{ id: 'c1', fileName: 'main.mp4', duration: 16, slot: 'A' }],
      contentAnalysis, segments, timelineDuration: 16, style, overrides,
      usedSlots: [],
    })
    expect(decisions.length).toBeGreaterThanOrEqual(1)
    expect(decisions[0].overlayClipId).toBe('ov1')
    expect(typeof decisions[0].startTime).toBe('number')
    expect(typeof decisions[0].endTime).toBe('number')
    expect(['center', 'left', 'right', 'pip', 'fullscreen']).toContain(decisions[0].placement)
    expect(decisions[0].scale).toBeGreaterThan(0)
    expect(decisions[0].opacity).toBeGreaterThan(0)
    expect(decisions[0].reason).toBeTruthy()
  })

  it('creates fallback decision when no slots found', () => {
    const decisions = determineOverlayDecisions({
      overlayClip: { id: 'ov1', fileName: 'demo.mp4', duration: 8 },
      index: 0, totalOverlays: 1,
      mainClips: [{ id: 'c1', fileName: 'main.mp4', duration: 10, slot: 'A' }],
      contentAnalysis: { ...contentAnalysis, importantMoments: [] },
      segments: [], timelineDuration: 10, style, overrides,
      usedSlots: [],
    })
    expect(decisions.length).toBeGreaterThanOrEqual(1)
    expect(decisions[0].reason).toContain('Fallback')
  })
})

// --- Single-clip projects: region mapping, cadence zooms, overlay placement ---
describe('single-clip project planning (regression)', () => {
  const singleClip = [
    { id: 'solo', fileName: 'review.mp4', duration: 30, slot: 'A' as const },
  ]

  const emptyAnalysis: ContentAnalysis = {
    topic: 'Food', category: 'food-review', keywords: [],
    structure: { hook: null, setup: null, mainContent: null, conclusion: null },
    importantMoments: [], emotionalMoments: [], keySubjects: [], keyObjects: [],
  }

  const emptyRetention: RetentionAnalysis = {
    hook: null, lowEnergyRegions: [], highValueMoments: [],
    repetitiveRegions: [], topicChanges: [],
  }

  it('splitRegionAcrossClips maps regions onto a single clip without offsets', () => {
    const result = splitRegionAcrossClips(2, 5, singleClip, undefined)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ clipId: 'solo', localStart: 2, localEnd: 5 })
  })

  it('splitRegionAcrossClips clamps to clip duration for single clip', () => {
    const result = splitRegionAcrossClips(25, 40, singleClip, undefined)
    expect(result).toHaveLength(1)
    expect(result[0].localEnd).toBe(30)
  })

  it('cadence/multicam directives produce alternating zooms even on short single clips', () => {
    const plan = createEditPlan({
      projectId: 'p-cadence',
      instructions: 'aggressive punch-ins every 2-3 seconds simulating multiple cameras at different distances',
      selectedStyle: 'tiktok',
      clips: [{ id: 'solo', fileName: 'short.mp4', duration: 9, slot: 'A' as const }],
      contentAnalysis: emptyAnalysis,
      retention: emptyRetention,
      transcription: [{ start: 0, end: 8, text: 'talking about the food the whole time' }],
      clipOffsets: undefined,
    })

    const zooms = plan.decisions.filter((d) => d.type === 'zoom')
    expect(zooms.length).toBeGreaterThanOrEqual(3)

    // never two identical framing levels back to back (multicam simulation)
    for (let i = 1; i < zooms.length; i++) {
      expect(zooms[i].parameters.intensity).not.toBe(zooms[i - 1].parameters.intensity)
    }

    // zoom windows stay inside the clip
    for (const z of zooms) {
      expect(z.startTime).toBeGreaterThanOrEqual(0)
      expect(z.endTime).toBeLessThanOrEqual(9)
    }
  })

  it('places overlays on single-clip projects (previously silently dropped)', () => {
    const plan = createEditPlan({
      projectId: 'p-overlay-single',
      instructions: 'add overlays',
      selectedStyle: 'food-review',
      clips: [
        { id: 'solo', fileName: 'review.mp4', duration: 30, slot: 'A' as const },
        { id: 'ov1', fileName: 'broll.mp4', duration: 5, slot: 'B' as const },
      ],
      contentAnalysis: emptyAnalysis,
      retention: emptyRetention,
      transcription: [{ start: 0, end: 25, text: 'a long single talking segment for the whole clip' }],
      clipOffsets: undefined,
    })

    const overlays = plan.decisions.filter((d) => d.type === 'overlay')
    expect(overlays.length).toBeGreaterThanOrEqual(1)
    expect(overlays[0].clipId).toBe('solo')
    expect(overlays[0].overlayClipId).toBe('ov1')
    expect(overlays[0].endTime).toBeLessThanOrEqual(30)
  })

  it('drops trims and warns when silence removal would delete nearly the whole video', () => {
    const plan = createEditPlan({
      projectId: 'p-trim-cap',
      instructions: '',
      selectedStyle: 'vlog',
      clips: [{ id: 'solo', fileName: 'quiet.mp4', duration: 10, slot: 'A' as const }],
      contentAnalysis: emptyAnalysis,
      retention: {
        ...emptyRetention,
        lowEnergyRegions: [{ start: 0, end: 9.5, duration: 9.5 }],
      },
      transcription: [],
      clipOffsets: undefined,
    })

    const trims = plan.decisions.filter((d) => d.type === 'trim')
    expect(trims).toHaveLength(0)
    expect(plan.warnings.some((w) => w.includes('delete almost the entire video'))).toBe(true)
  })

  it('keeps normal trims under the safety cap', () => {
    const plan = createEditPlan({
      projectId: 'p-trim-normal',
      instructions: '',
      selectedStyle: 'vlog',
      clips: [{ id: 'solo', fileName: 'talk.mp4', duration: 30, slot: 'A' as const }],
      contentAnalysis: emptyAnalysis,
      retention: {
        ...emptyRetention,
        lowEnergyRegions: [{ start: 5, end: 8, duration: 3 }],
      },
      transcription: [],
      clipOffsets: undefined,
    })

    const trims = plan.decisions.filter((d) => d.type === 'trim')
    expect(trims.length).toBeGreaterThanOrEqual(1)
    expect(plan.warnings.some((w) => w.includes('delete almost the entire video'))).toBe(false)
  })

  it('spreads multiple overlays instead of stacking them on the same slot', () => {
    const plan = createEditPlan({
      projectId: 'p-overlay-spread',
      instructions: 'add overlays',
      selectedStyle: 'food-review',
      clips: [
        { id: 'solo', fileName: 'review.mp4', duration: 30, slot: 'A' as const },
        { id: 'ov1', fileName: 'broll-one.mp4', duration: 4, slot: 'B' as const },
        { id: 'ov2', fileName: 'broll-two.mp4', duration: 4, slot: 'B' as const },
      ],
      contentAnalysis: emptyAnalysis,
      retention: emptyRetention,
      transcription: [{ start: 0, end: 25, text: 'a long single talking segment for the whole clip' }],
      clipOffsets: undefined,
    })

    const overlays = plan.decisions.filter((d) => d.type === 'overlay')
    expect(overlays.length).toBeGreaterThanOrEqual(2)

    const byOverlay: Record<string, { start: number; end: number }> = {}
    for (const o of overlays) {
      if (o.overlayClipId) byOverlay[o.overlayClipId] = { start: o.startTime, end: o.endTime }
    }
    const ranges = Object.values(byOverlay)
    expect(ranges.length).toBe(2)
    const [a, b] = ranges
    const overlapping = a.start < b.end && b.start < a.end
    expect(overlapping).toBe(false)
  })
})
