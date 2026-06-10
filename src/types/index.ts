export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type SlotType = 'A' | 'B'

export interface Clip {
  id: string
  projectId: string
  slot: SlotType
  fileName: string
  fileSize: number
  duration: number
  width: number
  height: number
  muted: boolean
  order: number
  createdAt: number
}

export interface ConcatJob {
  status: 'idle' | 'loading-ffmpeg' | 'concatenating' | 'done' | 'error'
  progress: number
  error?: string
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
