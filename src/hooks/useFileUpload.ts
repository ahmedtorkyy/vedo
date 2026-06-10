import { useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { useClipStore } from '../lib/state'
import { createProjectDirectory, streamFileToOPFS } from '../lib/opfs'

function cleanupUploadEntry(clipId: string, delayMs = 4000): void {
  setTimeout(() => {
    useClipStore.getState().removeUploadProgress(clipId)
  }, delayMs)
}

interface UploadOptions {
  projectId: string
  slot: 'A' | 'B'
  files: FileList | File[]
  onFileStart?: (fileName: string) => void
  onFileComplete?: (fileName: string) => void
  onAllComplete?: () => void
}

const SUPPORTED_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'image/png', 'image/jpeg', 'image/webp',
])

function validateFile(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type) && file.type.startsWith('video/') === false) {
    return `Unsupported file type: ${file.type}`
  }
  if (file.size === 0) {
    return 'File is empty'
  }
  if (file.size > 2 * 1024 * 1024 * 1024) {
    return 'File exceeds 2GB limit'
  }
  return null
}

export function useFileUpload() {
  const addClip = useClipStore((s) => s.addClip)
  const setUploadProgress = useClipStore((s) => s.setUploadProgress)
  const removeUploadProgress = useClipStore((s) => s.removeUploadProgress)

  const uploadFiles = useCallback(async (options: UploadOptions) => {
    const { projectId, slot, files, onFileStart, onFileComplete, onAllComplete } = options
    const fileArray = Array.from(files)

    const dir = await createProjectDirectory(projectId)

    for (const file of fileArray) {
      const error = validateFile(file)
      if (error) {
        setUploadProgress(uuid(), { fileName: file.name, status: 'error', error })
        continue
      }

      const clipId = uuid()
      setUploadProgress(clipId, { clipId, fileName: file.name, progress: 0, status: 'queued' })
      onFileStart?.(file.name)

      setUploadProgress(clipId, { status: 'uploading', progress: 0 })

      try {
        await streamFileToOPFS(dir, file, (loaded, total) => {
          const pct = Math.round((loaded / total) * 100)
          setUploadProgress(clipId, { progress: pct })
        })

        setUploadProgress(clipId, { status: 'done', progress: 100 })
        cleanupUploadEntry(clipId)

        addClip(projectId, slot, {
          fileName: file.name,
          fileSize: file.size,
          duration: 0,
          width: 0,
          height: 0,
          muted: false,
        })

        onFileComplete?.(file.name)
      } catch (err) {
        setUploadProgress(clipId, { status: 'error', error: String(err) })
        cleanupUploadEntry(clipId)
      }
    }

    onAllComplete?.()
  }, [addClip, setUploadProgress, removeUploadProgress])

  return { uploadFiles }
}
