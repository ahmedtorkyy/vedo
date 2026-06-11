export interface VisionCapability {
  webgl: boolean
  faceDetection: boolean
  objectDetection: boolean
  selfieSegmentation: boolean
}

export interface VideoFrame {
  data: Uint8ClampedArray
  width: number
  height: number
  timestamp: number
}

export interface FaceDetectionEvent {
  time: number
  boundingBox: { x: number; y: number; width: number; height: number }
  confidence: number
  landmarks?: { x: number; y: number }[]
}

export interface ObjectDetectionEvent {
  time: number
  label: string
  category: 'food' | 'plate' | 'cup' | 'utensil' | 'product' | 'other'
  boundingBox: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface MotionEvent {
  time: number
  score: number
}

export interface VisualEvent {
  type: 'face' | 'object' | 'motion' | 'expression'
  time: number
  endTime: number
  confidence: number
  description: string
  detail?: FaceDetectionEvent | ObjectDetectionEvent | MotionEvent
}

export interface VisualAnalysis {
  events: VisualEvent[]
  faceTrack: { time: number; centerX: number; centerY: number; width: number; height: number }[]
  objectDetections: { time: number; label: string; confidence: number }[]
  motionScores: { time: number; score: number }[]
  capability: VisionCapability
  frameCount: number
  duration: number
}

export type VisionWorkerMessage =
  | { type: 'load'; payload: { modelTypes?: string[] } }
  | { type: 'analyze'; payload: { frames: VideoFrame[]; duration: number; fps: number } }
  | { type: 'unload' }

export type VisionWorkerResponse =
  | { type: 'model-loaded'; payload: { models: string[] } }
  | { type: 'load-error'; payload: { error: string } }
  | { type: 'capability'; payload: VisionCapability }
  | { type: 'progress'; payload: { progress: number; message: string } }
  | { type: 'result'; payload: VisualAnalysis }
  | { type: 'error'; payload: { error: string } }
  | { type: 'unloaded' }
