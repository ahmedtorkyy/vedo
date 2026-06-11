import { FaceDetector, ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import type { VideoFrame, VisualAnalysis, VisionWorkerMessage, VisionWorkerResponse } from '../vision/vision-types'
import { extractMotionScore } from '../vision/frame-sampler'

const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

let faceDetector: FaceDetector | null = null
let objectDetector: ObjectDetector | null = null

self.onmessage = async (e: MessageEvent<VisionWorkerMessage>) => {
  const msg = e.data

  switch (msg.type) {
    case 'load':
      await handleLoad()
      break
    case 'analyze':
      await handleAnalyze(msg.payload)
      break
    case 'unload':
      handleUnload()
      break
  }
}

async function handleLoad() {
  try {
    const vision = await FilesetResolver.forVisionTasks(MODEL_CDN)

    faceDetector = await FaceDetector.createFromOptions(vision, {
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    })

    objectDetector = await ObjectDetector.createFromOptions(vision, {
      runningMode: 'IMAGE',
    })

    postMessage({ type: 'model-loaded', payload: { models: ['face', 'object'] } } satisfies VisionWorkerResponse)
  } catch (err) {
    postMessage({ type: 'load-error', payload: { error: String(err) } } satisfies VisionWorkerResponse)
  }
}

function handleUnload() {
  faceDetector?.close()
  objectDetector?.close()
  faceDetector = null
  objectDetector = null
  postMessage({ type: 'unloaded' } satisfies VisionWorkerResponse)
}

async function handleAnalyze(payload: { frames: VideoFrame[]; duration: number; fps: number }) {
  const { frames, duration } = payload
  const faceTrack: { time: number; centerX: number; centerY: number; width: number; height: number }[] = []
  const objectDetections: { time: number; label: string; confidence: number }[] = []
  const motionScores: { time: number; score: number }[] = []

  const total = frames.length
  let prevData: Uint8ClampedArray | null = null

  for (let i = 0; i < total; i++) {
    const frame = frames[i]

    if (i % 5 === 0 || i === total - 1) {
      postMessage({
        type: 'progress',
        payload: { progress: Math.round((i / total) * 100), message: `Analyzing frame ${i + 1}/${total}` },
      } satisfies VisionWorkerResponse)
    }

    if (faceDetector) {
      try {
        const imageData = new ImageData(
          new Uint8ClampedArray(frame.data),
          frame.width,
          frame.height,
        )
        const result = faceDetector.detect(imageData)
        if (result.detections && result.detections.length > 0) {
          const d = result.detections[0]
          const bb = d.boundingBox
          const cx = (bb?.originX ?? 0) + (bb?.width ?? 0) / 2
          const cy = (bb?.originY ?? 0) + (bb?.height ?? 0) / 2
          faceTrack.push({
            time: frame.timestamp,
            centerX: cx,
            centerY: cy,
            width: bb?.width ?? 0,
            height: bb?.height ?? 0,
          })
        }
      } catch { }
    }

    if (objectDetector) {
      try {
        const imageData = new ImageData(
          new Uint8ClampedArray(frame.data),
          frame.width,
          frame.height,
        )
        const result = objectDetector.detect(imageData)
        if (result.detections) {
          for (const d of result.detections) {
            const label = d.categories?.[0]?.categoryName ?? 'unknown'
            const score = d.categories?.[0]?.score ?? 0
            if (score > 0.5) {
              objectDetections.push({ time: frame.timestamp, label, confidence: score })
            }
          }
        }
      } catch { }
    }

    if (prevData) {
      const score = extractMotionScore(prevData, frame.data)
      motionScores.push({ time: frame.timestamp, score })
    }
    prevData = new Uint8ClampedArray(frame.data)
  }

  const analysis: VisualAnalysis = {
    events: [],
    faceTrack,
    objectDetections,
    motionScores,
    capability: { webgl: true, faceDetection: !!faceDetector, objectDetection: !!objectDetector, selfieSegmentation: false },
    frameCount: total,
    duration,
  }

  postMessage({ type: 'result', payload: analysis } satisfies VisionWorkerResponse)
}
