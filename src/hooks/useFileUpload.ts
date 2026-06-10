import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useClipStore } from '../lib/state'
import { ProjectStorage } from '../lib/opfs/project-storage'
import { AudioOrchestrator } from '../lib/audio/AudioOrchestrator'
import { SUPPORTED_MIME_TYPES } from '../types'

interface UploadOptions {
  projectId: string
  slot: 'A' | 'B'
  files: FileList
  onFileStart?: (name: string) => void
  onFileComplete?: (name: string) => void
  onAllComplete?: () => void
}

export function useFileUpload() {
  const initUpload = useClipStore((s) => s.initUpload)
  const setUploadProgress = useClipStore((s) => s.setUploadProgress)
  const addClip = useClipStore((s) => s.addClip)

  const uploadFiles = useCallback(async (options: UploadOptions) => {
    const { projectId, slot, files, onFileStart, onFileComplete, onAllComplete } = options
    const audioMatrix = AudioOrchestrator.getInstance()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const clipId = uuidv4()

      if (!SUPPORTED_MIME_TYPES.has(file.type) && !file.type.startsWith('video/')) {
        setUploadProgress(clipId, 0, 'error', `Unsupported type: ${file.type}`)
        continue
      }

      initUpload({
        clipId,
        fileName: file.name,
        progress: 0,
        status: 'uploading'
      })

      onFileStart?.(file.name)

      try {
        const safeName = `${clipId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const opfsPath = await ProjectStorage.saveFile(projectId, safeName, file)

        audioMatrix.registerClipChannel(clipId)

        setUploadProgress(clipId, 100, 'done')

        addClip(projectId, slot, {
          id: clipId,
          fileName: file.name,
          fileSize: file.size,
          filePath: opfsPath,
          opfsFilename: safeName,
          duration: 0,
          muted: false
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
