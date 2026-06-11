import type { VisualEvent, FaceDetectionEvent, ObjectDetectionEvent, MotionEvent } from './vision-types'

export function buildVisualEvents(
  faceTrack: FaceDetectionEvent[],
  objectDetections: ObjectDetectionEvent[],
  motionEvents: MotionEvent[],
): VisualEvent[] {
  const events: VisualEvent[] = []

  for (const f of faceTrack) {
    events.push({
      type: 'face',
      time: f.time,
      endTime: f.time + 0.3,
      confidence: f.confidence,
      description: `face at ${f.time.toFixed(1)}s`,
      detail: f,
    })
  }

  for (const obj of objectDetections) {
    const label = obj.label
    events.push({
      type: 'object',
      time: obj.time,
      endTime: obj.time + 1.0,
      confidence: obj.confidence,
      description: `${label} enters frame at ${obj.time.toFixed(1)}s, confidence ${obj.confidence.toFixed(2)}`,
      detail: obj,
    })
  }

  for (const m of motionEvents) {
    if (m.score > 0.15) {
      events.push({
        type: 'motion',
        time: m.time,
        endTime: m.time + 0.5,
        confidence: Math.min(m.score * 2, 1),
        description: `motion spike at ${m.time.toFixed(1)}s`,
        detail: m,
      })
    }
  }

  return events.sort((a, b) => a.time - b.time)
}

export function mergeEventsWithTranscript(
  visualEvents: VisualEvent[],
  transcriptMoments: { time: number; description: string; confidence: number }[],
): { time: number; description: string; confidence: number; source: 'visual' | 'transcript' }[] {
  const merged: { time: number; description: string; confidence: number; source: 'visual' | 'transcript' }[] = []

  for (const ve of visualEvents) {
    merged.push({
      time: ve.time,
      description: ve.description,
      confidence: ve.confidence,
      source: 'visual',
    })
  }

  for (const tm of transcriptMoments) {
    const dupe = merged.some((m) => m.source === 'visual' && Math.abs(m.time - tm.time) < 1.5)
    if (!dupe) {
      merged.push({
        time: tm.time,
        description: tm.description,
        confidence: tm.confidence,
        source: 'transcript',
      })
    }
  }

  return merged.sort((a, b) => a.time - b.time)
}

export function findMidMotionMoments(
  motionEvents: MotionEvent[],
  threshold = 0.2,
): { time: number; score: number }[] {
  const peaks: { time: number; score: number }[] = []
  for (let i = 1; i < motionEvents.length - 1; i++) {
    const prev = motionEvents[i - 1].score
    const curr = motionEvents[i].score
    const next = motionEvents[i + 1].score
    if (curr > prev && curr > next && curr > threshold) {
      peaks.push({ time: motionEvents[i].time, score: curr })
    }
  }
  return peaks
}

export function generateFaceTrackMoments(
  faceTrack: { time: number; centerX: number; centerY: number; width: number; height: number }[],
): { time: number; description: string; confidence: number }[] {
  return faceTrack.map((ft) => ({
    time: ft.time,
    description: `face centered at ${ft.time.toFixed(1)}s`,
    confidence: 0.7,
  }))
}
