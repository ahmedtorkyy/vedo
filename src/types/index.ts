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
  error?: string
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
