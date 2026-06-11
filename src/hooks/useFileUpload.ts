import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useClipStore } from '../lib/state'
import { ProjectStorage } from '../lib/opfs/project-storage'
import { AudioOrchestrator } from '../lib/audio/AudioOrchestrator'
import { SUPPORTED_MIME_TYPES } from '../types'

import { UPLOAD_LIMITS } from '../types'

interface UploadOptions {
  projectId: string
  slot: 'A' | 'B'
  files: FileList
  onFileStart?: (name: string) => void
  onProgress?: (name: string, pct: number) => void
  onFileComplete?: (name: string) => void
  onAllComplete?: () => void
}

export function useFileUpload() {
  const initUpload = useClipStore((s) => s.initUpload)
  const setUploadProgress = useClipStore((s) => s.setUploadProgress)
  const addClip = useClipStore((s) => s.addClip)

  function getVideoDimensions(file: File): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth || 1920,
          height: video.videoHeight || 1080,
          duration: video.duration || 0,
        })
        URL.revokeObjectURL(video.src)
        video.remove()
      }
      video.onerror = () => {
        resolve({ width: 1920, height: 1080, duration: 0 })
        URL.revokeObjectURL(video.src)
        video.remove()
      }
      video.src = URL.createObjectURL(file)
    })
  }

  const uploadFiles = useCallback(async (options: UploadOptions) => {
    const { projectId, slot, files, onFileStart, onProgress, onFileComplete, onAllComplete } = options
    const audioMatrix = AudioOrchestrator.getInstance()

    if (files.length > UPLOAD_LIMITS.maxFileCount) {
      initUpload({ clipId: 'batch-limit', fileName: '', progress: 0, status: 'error', error: `Maximum ${UPLOAD_LIMITS.maxFileCount} files per batch.` })
      return
    }

    let projectTotal = 0
    const stores = useClipStore.getState()
    if (stores.clips[projectId]) {
      for (const slotKey of ['A', 'B'] as const) {
        for (const c of stores.clips[projectId][slotKey] || []) {
          projectTotal += c.fileSize
        }
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const clipId = uuidv4()

      if (!SUPPORTED_MIME_TYPES.has(file.type) && !file.type.startsWith('video/')) {
        setUploadProgress(clipId, 0, 'error', `Unsupported type: ${file.type}`)
        continue
      }

      if (file.size > UPLOAD_LIMITS.maxFileSize) {
        setUploadProgress(clipId, 0, 'error', `File exceeds ${(UPLOAD_LIMITS.maxFileSize / 1e9).toFixed(1)}GB limit.`)
        continue
      }

      if (projectTotal + file.size > UPLOAD_LIMITS.maxTotalBytesPerProject) {
        setUploadProgress(clipId, 0, 'error', `Project would exceed ${(UPLOAD_LIMITS.maxTotalBytesPerProject / 1e9).toFixed(1)}GB total limit.`)
        continue
      }

      initUpload({
        clipId,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
        slot,
      })

      onFileStart?.(file.name)

      try {
        const safeName = `${clipId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const opfsPath = await ProjectStorage.saveFileWithProgress(
          projectId,
          safeName,
          file,
          (pct) => {
            setUploadProgress(clipId, pct, pct < 100 ? 'uploading' : 'done')
            onProgress?.(file.name, pct)
          },
        )

        audioMatrix.registerClipChannel(clipId)
        projectTotal += file.size

        const dims = await getVideoDimensions(file)
        addClip(projectId, slot, {
          id: clipId,
          fileName: file.name,
          fileSize: file.size,
          filePath: opfsPath,
          opfsFilename: safeName,
          duration: dims.duration,
          muted: false,
          videoWidth: dims.width,
          videoHeight: dims.height,
        })

        onFileComplete?.(file.name)
      } catch (err) {
        setUploadProgress(clipId, 0, 'error', err instanceof Error ? err.message : 'OPFS write failed.')
      }
    }
    onAllComplete?.()
  }, [initUpload, setUploadProgress, addClip])

  return { uploadFiles }
}
