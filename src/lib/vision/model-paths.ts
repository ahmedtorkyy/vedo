const DEV_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const DEV_MODELS = 'https://storage.googleapis.com/mediapipe-models'

export const FACE_DETECTOR = 'face_detector/float16/lite/face_detector.tflite'
export const OBJECT_DETECTOR = 'object_detector/efficientdet_lite0/float16/lite/efficientdet_lite0.tflite'
export const FACE_LANDMARKER = 'face_landmarker/float16/lite/face_landmarker.task'

export function wasmBaseUrl(): string {
  return DEV_WASM
}

export function faceDetectorModelPath(): string {
  return `${DEV_MODELS}/${FACE_DETECTOR}`
}

export function objectDetectorModelPath(): string {
  return `${DEV_MODELS}/${OBJECT_DETECTOR}`
}

export function faceLandmarkerModelPath(): string {
  return `${DEV_MODELS}/${FACE_LANDMARKER}`
}

export const MODEL_PATHS = {
  wasm: DEV_WASM,
  faceDetector: `${DEV_MODELS}/${FACE_DETECTOR}`,
  objectDetector: `${DEV_MODELS}/${OBJECT_DETECTOR}`,
  faceLandmarker: `${DEV_MODELS}/${FACE_LANDMARKER}`,
} as const
