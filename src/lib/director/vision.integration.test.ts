import { describe, it, expect } from 'vitest'
import { extractMotionScore } from '../vision/frame-sampler'
import { buildVisualEvents, mergeEventsWithTranscript, findMidMotionMoments, generateFaceTrackMoments } from '../vision/visual-events'
import { mergeImportantMoments } from './content-analyzer'
import type { FaceDetectionEvent, ObjectDetectionEvent, MotionEvent } from '../vision/vision-types'

describe('extractMotionScore', () => {
  it('returns 0 for identical frames', () => {
    const data = new Uint8ClampedArray(16)
    expect(extractMotionScore(data, data)).toBe(0)
  })

  it('returns positive score for different frames', () => {
    const a = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
    const b = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
    const score = extractMotionScore(a, b)
    expect(score).toBeGreaterThan(0)
  })

  it('returns 0 for mismatched lengths', () => {
    const a = new Uint8ClampedArray(4)
    const b = new Uint8ClampedArray(8)
    expect(extractMotionScore(a, b)).toBe(0)
  })
})

describe('buildVisualEvents', () => {
  it('builds face events from face track', () => {
    const faceTrack: FaceDetectionEvent[] = [
      { time: 1, boundingBox: { x: 10, y: 20, width: 30, height: 40 }, confidence: 0.9 },
      { time: 2, boundingBox: { x: 15, y: 25, width: 30, height: 40 }, confidence: 0.85 },
    ]
    const events = buildVisualEvents(faceTrack, [], [])
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('face')
    expect(events[0].time).toBe(1)
    expect(events[0].confidence).toBe(0.9)
  })

  it('builds object events', () => {
    const objects: ObjectDetectionEvent[] = [
      { time: 3, label: 'plate', category: 'plate', boundingBox: { x: 0, y: 0, width: 50, height: 50 }, confidence: 0.8 },
    ]
    const events = buildVisualEvents([], objects, [])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('object')
    expect(events[0].description).toContain('plate')
    expect(events[0].description).toContain('0.80')
  })

  it('includes motion spikes above threshold', () => {
    const motion: MotionEvent[] = [
      { time: 5, score: 0.1 },
      { time: 6, score: 0.3 },
    ]
    const events = buildVisualEvents([], [], motion)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('motion')
    expect(events[0].time).toBe(6)
  })

  it('sorts events by time', () => {
    const faceTrack: FaceDetectionEvent[] = [
      { time: 3, boundingBox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.8 },
    ]
    const objects: ObjectDetectionEvent[] = [
      { time: 1, label: 'cup', category: 'cup', boundingBox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9 },
    ]
    const events = buildVisualEvents(faceTrack, objects, [])
    expect(events[0].time).toBe(1)
    expect(events[1].time).toBe(3)
  })
})

describe('mergeEventsWithTranscript', () => {
  it('prefers visual events over transcript when they overlap', () => {
    const visual = [
      { type: 'object' as const, time: 10, endTime: 11, description: 'plate enters frame', confidence: 0.8 },
    ]
    const transcript: { time: number; description: string; confidence: number }[] = [
      { time: 10.5, description: 'now the plate', confidence: 0.5 },
    ]
    const merged = mergeEventsWithTranscript(visual, transcript)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('visual')
    expect(merged[0].description).toBe('plate enters frame')
  })

  it('includes transcript moments when no visual overlap', () => {
    const visual = [
      { type: 'face' as const, time: 5, endTime: 5.3, description: 'face at 5s', confidence: 0.9 },
    ]
    const transcript: { time: number; description: string; confidence: number }[] = [
      { time: 20, description: 'important tip', confidence: 0.7 },
    ]
    const merged = mergeEventsWithTranscript(visual, transcript)
    expect(merged).toHaveLength(2)
    expect(merged.some((m) => m.source === 'visual')).toBe(true)
    expect(merged.some((m) => m.source === 'transcript')).toBe(true)
  })

  it('sorts merged events by time', () => {
    const merged = mergeEventsWithTranscript(
      [{ type: 'object' as const, time: 15, endTime: 16, description: 'object', confidence: 0.8 }],
      [{ time: 5, description: 'transcript', confidence: 0.6 }],
    )
    expect(merged[0].time).toBe(5)
    expect(merged[1].time).toBe(15)
  })
})

describe('findMidMotionMoments', () => {
  it('finds peaks in motion data', () => {
    const motion: MotionEvent[] = [
      { time: 1, score: 0.1 },
      { time: 2, score: 0.5 },
      { time: 3, score: 0.2 },
    ]
    const peaks = findMidMotionMoments(motion)
    expect(peaks).toHaveLength(1)
    expect(peaks[0].time).toBe(2)
  })

  it('returns empty for flat motion', () => {
    const motion: MotionEvent[] = [
      { time: 1, score: 0.05 },
      { time: 2, score: 0.06 },
      { time: 3, score: 0.04 },
    ]
    expect(findMidMotionMoments(motion)).toHaveLength(0)
  })

  it('respects custom threshold', () => {
    const motion: MotionEvent[] = [
      { time: 1, score: 0.1 },
      { time: 2, score: 0.3 },
      { time: 3, score: 0.1 },
    ]
    expect(findMidMotionMoments(motion, 0.5)).toHaveLength(0)
    expect(findMidMotionMoments(motion, 0.2)).toHaveLength(1)
  })
})

describe('generateFaceTrackMoments', () => {
  it('generates moments from face track data', () => {
    const faceTrack = [
      { time: 1, centerX: 50, centerY: 60, width: 30, height: 40 },
      { time: 2, centerX: 55, centerY: 65, width: 30, height: 40 },
    ]
    const moments = generateFaceTrackMoments(faceTrack)
    expect(moments).toHaveLength(2)
    expect(moments[0].time).toBe(1)
    expect(moments[0].confidence).toBe(0.7)
    expect(moments[0].description).toContain('face centered')
  })
})

describe('mergeImportantMoments', () => {
  it('merges visual events with transcript, deduplicating by time', () => {
    const transcript: { time: number; description: string; confidence: number }[] = [
      { time: 10, description: 'transcript moment', confidence: 0.5 },
    ]
    const visual: { time: number; description: string; confidence: number; source?: 'visual' | 'transcript' }[] = [
      { time: 10, description: 'visual moment at 10s', confidence: 0.8 },
    ]
    const merged = mergeImportantMoments(transcript, visual)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('visual')
    expect(merged[0].description).toBe('visual moment at 10s')
  })

  it('includes non-overlapping transcript moments', () => {
    const transcript: { time: number; description: string; confidence: number }[] = [
      { time: 5, description: 'intro', confidence: 0.5 },
      { time: 20, description: 'outro', confidence: 0.4 },
    ]
    const visual: { time: number; description: string; confidence: number; source?: 'visual' | 'transcript' }[] = [
      { time: 10, description: 'object detected', confidence: 0.8 },
    ]
    const merged = mergeImportantMoments(transcript, visual)
    expect(merged).toHaveLength(3)
  })

  it('returns sorted results', () => {
    const merged = mergeImportantMoments(
      [{ time: 20, description: 'b', confidence: 0.3 }],
      [{ time: 5, description: 'a', confidence: 0.9 }],
    )
    expect(merged[0].time).toBe(5)
    expect(merged[1].time).toBe(20)
  })
})
