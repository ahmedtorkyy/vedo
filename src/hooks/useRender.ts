import { useState, useCallback, useEffect } from 'react'
import { exportVideo, downloadFromOpfs, onRenderProgress } from '../lib/ffmpeg/render'
import type { RenderStatus, RenderProgress } from '../lib/ffmpeg/render'

interface RenderState {
  status: RenderStatus
  progress: number
  message: string
  outputFilename: string | null
  error: string | null
}

export function useRender(projectId: string) {
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'idle',
    progress: 0,
    message: '',
    outputFilename: null,
    error: null,
  })

  const isBusy = renderState.status === 'preparing' || renderState.status === 'processing' || renderState.status === 'concatenating'

  useEffect(() => {
    onRenderProgress((p: RenderProgress) => {
      setRenderState({
        status: p.status,
        progress: p.progress,
        message: p.message,
        outputFilename: p.outputFilename ?? null,
        error: p.error ?? null,
      })
    })
  }, [])

  const startExport = useCallback(async () => {
    setRenderState({ status: 'preparing', progress: 0, message: 'Starting...', outputFilename: null, error: null })

    try {
      const filename = await exportVideo(projectId)
      setRenderState((prev) => ({ ...prev, status: 'done', outputFilename: filename }))
    } catch (err) {
      setRenderState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Export failed',
      }))
    }
  }, [projectId])

  const download = useCallback(async () => {
    if (!renderState.outputFilename) return
    try {
      await downloadFromOpfs(renderState.outputFilename, projectId, `vedo_export_${Date.now()}.mp4`)
    } catch (err) {
      setRenderState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Download failed',
      }))
    }
  }, [projectId, renderState.outputFilename])

  const reset = useCallback(() => {
    setRenderState({ status: 'idle', progress: 0, message: '', outputFilename: null, error: null })
  }, [])

  return { renderState, isBusy, startExport, download, reset }
}
