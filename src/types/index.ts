export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type SlotType = 'A' | 'B'

export interface Clip {
  id: string
  fileName: string
  fileSize: number
  filePath: string
  opfsFilename: string
  duration: number
  muted: boolean
}

export interface UndoEntry {
  timestamp: number
  state: string
}

export interface StorageStats {
  usage: number
  quota: number
}

export interface UploadProgressEntry {
  clipId: string
  fileName: string
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  slot?: 'A' | 'B'
  error?: string
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptionResult {
  clipId: string
  status: 'idle' | 'extracting' | 'transcribing' | 'done' | 'error'
  segments: TranscriptionSegment[]
  language?: string
  error?: string
}

export interface SilenceSegment {
  start: number
  end: number
  duration: number
  confidence: number
  rms: number
}

export interface SmartCutOptions {
  enabled: boolean
  aggressiveness: 'low' | 'medium' | 'high'
  customThreshold?: number
  customMinDuration?: number
}

export interface FillerWordOccurrence {
  word: string
  start: number
  end: number
  duration: number
}

export interface TimelineMarker {
  id: string
  clipId: string
  time: number
  type: 'silence-start' | 'silence-end' | 'filler-word' | 'low-energy' | 'manual'
  label: string
}

export interface AnalysisResult {
  clipId: string
  status: 'idle' | 'analyzing' | 'done' | 'error'
  silenceSegments: SilenceSegment[]
  fillerWords: FillerWordOccurrence[]
  repeatedPhrases: string[]
  lowEnergySections: SilenceSegment[]
  error?: string
}

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface AudioCleansingOptions {
  noiseReduction: boolean
  silenceTrim: boolean
  threshold?: number
}

export const SUPPORTED_MIME_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'image/png', 'image/jpeg', 'image/webp',
])

export const UPLOAD_LIMITS = {
  maxFileSize: 2 * 1024 * 1024 * 1024,
  maxFileCount: 50,
  maxTotalBytesPerProject: 10 * 1024 * 1024 * 1024,
} as const
