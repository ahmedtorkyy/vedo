import {
  FaceDetector,
  ObjectDetector,
  FilesetResolver,
  type Detection,
} from '@mediapipe/tasks-vision'
import type { VideoFrame, VisionCapability, FaceDetectionEvent, ObjectDetectionEvent } from './vision-types'
import { wasmBaseUrl, faceDetectorModelPath, objectDetectorModelPath } from './model-paths'

const FOOD_LABELS = new Set([
  'apple', 'banana', 'orange', 'sandwich', 'pizza', 'donut', 'cake',
  'hot dog', 'broccoli', 'carrot',
])

const DRINK_LABELS = new Set([
  'cup', 'bottle', 'wine glass', 'water glass',
])

export function checkVisionCapability(): VisionCapability {
  if (typeof document === 'undefined') {
    return { webgl: false, faceDetection: false, objectDetection: false, selfieSegmentation: false }
  }
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
  const webgl = !!gl
  if (gl && typeof gl.getExtension === 'function') {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  return {
    webgl,
    faceDetection: webgl,
    objectDetection: webgl,
    selfieSegmentation: webgl,
  }
}

export interface DetectorSet {
  faceDetector?: FaceDetector
  objectDetector?: ObjectDetector
}

export async function createDetectors(): Promise<DetectorSet> {
  const cap = checkVisionCapability()
  if (!cap.webgl) return {}

  const detectors: DetectorSet = {}

  try {
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl())
    detectors.faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: faceDetectorModelPath(), delegate: 'GPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    })
  } catch {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl())
      detectors.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: faceDetectorModelPath(), delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      })
    } catch { /* model load failed — capability fallback handles it */ }
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl())
    detectors.objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: objectDetectorModelPath(), delegate: 'GPU' },
      runningMode: 'IMAGE',
    })
  } catch {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl())
      detectors.objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: objectDetectorModelPath(), delegate: 'CPU' },
        runningMode: 'IMAGE',
      })
    } catch { /* model load failed — capability fallback handles it */ }
  }

  return detectors
}

export function detectFaces(
  detector: FaceDetector,
  frame: VideoFrame,
  timestamp: number,
): FaceDetectionEvent[] {
  const imageData = new ImageData(
    new Uint8ClampedArray(frame.data),
    frame.width,
    frame.height,
  )
  const result = detector.detect(imageData)
  if (!result.detections) return []

  return result.detections.map((d: Detection) => ({
    time: timestamp,
    boundingBox: {
      x: d.boundingBox?.originX ?? 0,
      y: d.boundingBox?.originY ?? 0,
      width: d.boundingBox?.width ?? 0,
      height: d.boundingBox?.height ?? 0,
    },
    confidence: d.categories?.[0]?.score ?? 0,
  }))
}

export function detectObjects(
  detector: ObjectDetector,
  frame: VideoFrame,
  timestamp: number,
): ObjectDetectionEvent[] {
  const imageData = new ImageData(
    new Uint8ClampedArray(frame.data),
    frame.width,
    frame.height,
  )
  const result = detector.detect(imageData)
  if (!result.detections) return []

  return result.detections.map((d: Detection) => {
    const label = d.categories?.[0]?.categoryName ?? 'unknown'
    const cat = categorizeObject(label)
    return {
      time: timestamp,
      label,
      category: cat,
      boundingBox: {
        x: d.boundingBox?.originX ?? 0,
        y: d.boundingBox?.originY ?? 0,
        width: d.boundingBox?.width ?? 0,
        height: d.boundingBox?.height ?? 0,
      },
      confidence: d.categories?.[0]?.score ?? 0,
    }
  }).filter((e) => e.category !== 'other' || e.confidence > 0.7)
}

function categorizeObject(label: string): ObjectDetectionEvent['category'] {
  const lower = label.toLowerCase()
  if (FOOD_LABELS.has(lower)) return 'food'
  if (DRINK_LABELS.has(lower)) return 'cup'
  if (lower === 'plate' || lower === 'bowl') return 'plate'
  if (lower === 'fork' || lower === 'knife' || lower === 'spoon') return 'utensil'
  return 'other'
}
