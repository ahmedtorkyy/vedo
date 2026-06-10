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
