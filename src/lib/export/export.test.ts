import { describe, it, expect } from 'vitest'
import { buildKeptIntervals, mapSegmentsThroughOffset, mapSegmentsThroughTrims, wrapCaptionText, buildDrawtextFilters } from './ass-generator'
import { buildSrt, buildVtt } from './subtitle-formats'
import { buildScaleParams, buildCodecParams, getQualityDims } from './build-export-params'
import type { TranscriptionSegment } from '../../types'

function seg(start: number, end: number, text = 'hello'): TranscriptionSegment {
  return { start, end, text }
}

describe('buildKeptIntervals', () => {
  it('returns full duration when no trims', () => {
    expect(buildKeptIntervals([], 60)).toEqual([{ start: 0, end: 60 }])
  })

  it('splits around a single trim', () => {
    const result = buildKeptIntervals([{ start: 10, end: 20 }], 60)
    expect(result).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 60 },
    ])
  })

  it('handles multiple trims', () => {
    const result = buildKeptIntervals([
      { start: 5, end: 10 },
      { start: 20, end: 30 },
    ], 40)
    expect(result).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ])
  })

  it('sorts unsorted trim segments', () => {
    const result = buildKeptIntervals([
      { start: 20, end: 30 },
      { start: 5, end: 10 },
    ], 40)
    expect(result).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ])
  })

  it('handles back-to-back trims', () => {
    const result = buildKeptIntervals([
      { start: 10, end: 20 },
      { start: 20, end: 30 },
    ], 40)
    expect(result).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 40 },
    ])
  })

  it('handles trim at start', () => {
    const result = buildKeptIntervals([{ start: 0, end: 15 }], 60)
    expect(result).toEqual([{ start: 15, end: 60 }])
  })

  it('handles trim at end', () => {
    const result = buildKeptIntervals([{ start: 45, end: 60 }], 60)
    expect(result).toEqual([{ start: 0, end: 45 }])
  })
})

describe('mapSegmentsThroughOffset', () => {
  it('adds offset to start and end', () => {
    const result = mapSegmentsThroughOffset([seg(5, 10)], 30)
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBe(35)
    expect(result[0].stitchedEnd).toBe(40)
  })

  it('handles multiple segments', () => {
    const result = mapSegmentsThroughOffset([seg(0, 5), seg(10, 15)], 20)
    expect(result).toHaveLength(2)
    expect(result[0].stitchedStart).toBe(20)
    expect(result[1].stitchedStart).toBe(30)
  })

  it('handles zero offset', () => {
    const result = mapSegmentsThroughOffset([seg(5, 10)], 0)
    expect(result[0].stitchedStart).toBe(5)
    expect(result[0].stitchedEnd).toBe(10)
  })
})

describe('mapSegmentsThroughTrims', () => {
  it('returns offset-only when no trims', () => {
    const result = mapSegmentsThroughTrims([seg(5, 10)], 30, [], 60)
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBe(35)
  })

  it('shifts segment after a trim', () => {
    // Trim 0-10, keep 10-60. Segment at 20-25 → 10-15 in trimmed + offset
    const result = mapSegmentsThroughTrims([seg(20, 25)], 0, [{ start: 0, end: 10 }], 60)
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBeCloseTo(10)
    expect(result[0].stitchedEnd).toBeCloseTo(15)
  })

  it('excludes segment inside a trimmed region', () => {
    // Trim 10-20. Segment at 12-15 is inside the trim → excluded
    const result = mapSegmentsThroughTrims([seg(12, 15)], 0, [{ start: 10, end: 20 }], 60)
    expect(result).toHaveLength(0)
  })

  it('excludes segment spanning into trimmed region (midpoint in trim)', () => {
    // Trim 10-20. Segment at 8-15 has midpoint 11.5 which is inside trim → excluded
    const result = mapSegmentsThroughTrims([seg(8, 15)], 0, [{ start: 10, end: 20 }], 60)
    expect(result).toHaveLength(0)
  })

  it('includes segment with midpoint exactly at boundary', () => {
    // Trim 10-20. Segment at 9-10 (entirely in kept[0-10]), midpoint 9.5 → kept
    const result = mapSegmentsThroughTrims([seg(9, 10)], 0, [{ start: 10, end: 20 }], 60)
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBeCloseTo(9)
  })

  it('applies both trim offset and clip offset', () => {
    // Trim 0-10. Clip offset 30. Segment at 20-25 → 10-15 trimmed + 30 offset → 40-45
    const result = mapSegmentsThroughTrims([seg(20, 25)], 30, [{ start: 0, end: 10 }], 60)
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBeCloseTo(40)
    expect(result[0].stitchedEnd).toBeCloseTo(45)
  })

  it('handles multiple trims correctly', () => {
    // Trim 5-10 and 20-30. Segment at 12-18 → middle of kept[10-20]
    // Before it: kept[0-5] = 5s. Position in trimmed = (12-10)+5 = 7
    const result = mapSegmentsThroughTrims(
      [seg(12, 18)], 0,
      [{ start: 5, end: 10 }, { start: 20, end: 30 }],
      40,
    )
    expect(result).toHaveLength(1)
    expect(result[0].stitchedStart).toBeCloseTo(7)
    expect(result[0].stitchedEnd).toBeCloseTo(13)
  })
})

describe('buildSrt', () => {
  it('produces valid SRT for segments', () => {
    const segments = mapSegmentsThroughOffset([seg(1, 3, 'Hello'), seg(5, 8, 'World')], 0)
    const srt = buildSrt(segments)
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:03,000\nHello')
    expect(srt).toContain('2\n00:00:05,000 --> 00:00:08,000\nWorld')
  })

  it('skips empty text segments', () => {
    const segments = mapSegmentsThroughOffset([seg(1, 3, '')], 0)
    const srt = buildSrt(segments)
    expect(srt).toBe('')
  })
})

describe('buildVtt', () => {
  it('produces valid VTT for segments', () => {
    const segments = mapSegmentsThroughOffset([seg(1, 3, 'Hello')], 0)
    const vtt = buildVtt(segments)
    expect(vtt).toContain('WEBVTT')
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.000\nHello')
  })
})

describe('getQualityDims', () => {
  it('returns correct dimensions for each quality', () => {
    expect(getQualityDims('480p').width).toBe(854)
    expect(getQualityDims('720p').height).toBe(720)
    expect(getQualityDims('1080p').width).toBe(1920)
    expect(getQualityDims('4K').height).toBe(2160)
  })

  it('has lower CRF for higher quality', () => {
    expect(getQualityDims('4K').crf).toBeLessThan(getQualityDims('1080p').crf)
    expect(getQualityDims('1080p').crf).toBeLessThan(getQualityDims('720p').crf)
  })
})

describe('buildScaleParams', () => {
  it('returns scale+pad for default (no preset)', () => {
    const params = buildScaleParams(
      { quality: '1080p', format: 'mp4', platform: 'none', burnCaptions: false },
      1920, 1080,
    )
    expect(params.scaleFilter).toContain('scale')
    expect(params.padFilter).toContain('pad')
  })

  it('forces 9:16 for TikTok preset', () => {
    const params = buildScaleParams(
      { quality: '1080p', format: 'mp4', platform: 'tiktok', burnCaptions: false },
      1920, 1080,
    )
    expect(params.width).toBe(1080)
    expect(params.height).toBe(1920)
    expect(params.cropFilter).toContain('crop')
  })

  it('forces 16:9 for YouTube preset', () => {
    const params = buildScaleParams(
      { quality: '720p', format: 'mp4', platform: 'youtube', burnCaptions: false },
      1920, 1080,
    )
    expect(params.width).toBeCloseTo(1280)
    expect(params.height).toBe(720)
  })
})

describe('buildCodecParams', () => {
  it('returns H.264+AAC for mp4', () => {
    const params = buildCodecParams({ quality: '1080p', format: 'mp4', platform: 'none', burnCaptions: false })
    expect(params.videoCodec).toBe('libx264')
    expect(params.audioCodec).toBe('aac')
    expect(params.extension).toBe('mp4')
  })

  it('returns VP9+Opus for webm', () => {
    const params = buildCodecParams({ quality: '1080p', format: 'webm', platform: 'none', burnCaptions: false })
    expect(params.videoCodec).toBe('libvpx-vp9')
    expect(params.audioCodec).toBe('libopus')
    expect(params.extension).toBe('webm')
  })

  it('returns H.264+AAC for mkv', () => {
    const params = buildCodecParams({ quality: '1080p', format: 'mkv', platform: 'none', burnCaptions: false })
    expect(params.videoCodec).toBe('libx264')
    expect(params.extension).toBe('mkv')
  })
})

describe('wrapCaptionText (regression: long lines overflowed frame width)', () => {
  const W = 1080
  const FONT = 64 // 1920 / 30

  it('keeps short captions on one line', () => {
    expect(wrapCaptionText('hello world', W, FONT)).toBe('hello world')
  })

  it('wraps a long Arabic transcript line into multiple lines within the limit', () => {
    const long = 'المكس ده اختراع للناس اللي بتحب المشروبات اللذيذة بس مدلعين شوية وعايزين كل حاجة جاهزة'
    const wrapped = wrapCaptionText(long, W, FONT)
    const lines = wrapped.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    const maxChars = Math.max(8, Math.floor((W * 0.9) / (FONT * 0.55)))
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(maxChars)
    }
  })

  it('never splits inside a word', () => {
    const long = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn'
    const wrapped = wrapCaptionText(long, W, FONT)
    const rejoined = wrapped.replace(/\n/g, ' ')
    expect(rejoined).toBe(long)
  })

  it('drawtext textfiles contain wrapped content', () => {
    const long = 'كلام كثير جدا يحتاج الى التفاف لانه اطول من عرض الشاشة بكثير وفيه كلمات كتيرة اوي'
    const { textFiles } = buildDrawtextFilters(
      [{ start: 0, end: 2, text: long, stitchedStart: 0, stitchedEnd: 2 }],
      1080, 1920,
    )
    expect(textFiles).toHaveLength(1)
    expect(textFiles[0].content).toContain('\n')
  })
})
