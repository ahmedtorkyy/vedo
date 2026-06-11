import { useState, useCallback, useEffect } from 'react'
import { exportVideo, downloadFromOpfs, onRenderProgress } from '../lib/ffmpeg/render'
import type { RenderStatus, RenderProgress } from '../lib/ffmpeg/render'
import type { ExportOptions } from '../lib/export'
import { buildSrt, buildVtt, mapSegmentsThroughOffset } from '../lib/export'
import { useClipStore } from '../lib/state'
import { useTranscriptionStore } from '../lib/transcription'
import type { SegmentWithTiming } from '../lib/export/ass-generator'

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

  const startExport = useCallback(async (options: ExportOptions) => {
    setRenderState({ status: 'preparing', progress: 0, message: 'Starting...', outputFilename: null, error: null })

    try {
      const filename = await exportVideo(projectId, options)
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

  const allStitchedSegments = useCallback((): SegmentWithTiming[] => {
    const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
    let clipOffset = 0
    const allSegments: SegmentWithTiming[] = []
    for (const clip of clipsA) {
      const transcriptResult = useTranscriptionStore.getState().results[clip.id]
      if (transcriptResult?.status === 'done') {
        const mapped = mapSegmentsThroughOffset(transcriptResult.segments, clipOffset)
        allSegments.push(...mapped)
      }
      clipOffset += clip.duration
    }
    return allSegments
  }, [projectId])

  const downloadSrt = useCallback(() => {
    const segments = allStitchedSegments()
    if (segments.length === 0) return
    const srt = buildSrt(segments)
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vedo_captions_${Date.now()}.srt`
    a.click()
    URL.revokeObjectURL(url)
  }, [allStitchedSegments])

  const downloadVtt = useCallback(() => {
    const segments = allStitchedSegments()
    if (segments.length === 0) return
    const vtt = buildVtt(segments)
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vedo_captions_${Date.now()}.vtt`
    a.click()
    URL.revokeObjectURL(url)
  }, [allStitchedSegments])

  return { renderState, isBusy, startExport, download, reset, downloadSrt, downloadVtt }
}
