import { useCallback } from 'react'
import { useTranscriptionStore } from '../../lib/transcription'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { useClipStore } from '../../lib/state'

interface CaptionEditorProps {
  clipId: string
  projectId: string
}

function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor(((t % 1) * 100))
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function parseTime(str: string): number {
  const parts = str.split(':')
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0
    const sec = parseFloat(parts[1]) || 0
    return m * 60 + sec
  }
  return parseFloat(str) || 0
}

export function CaptionEditor({ clipId, projectId }: CaptionEditorProps) {
  const result = useTranscriptionStore((s) => s.results[clipId])
  const updateSegment = useTranscriptionStore((s) => s.updateSegment)
  const deleteSegment = useTranscriptionStore((s) => s.deleteSegment)
  const deleteAllSegments = useTranscriptionStore((s) => s.deleteAllSegments)
  const restoreSegments = useTranscriptionStore((s) => s.restoreSegments)
  const autoFitTimings = useTranscriptionStore((s) => s.autoFitTimings)
  const { announce } = useAriaAnnouncer()

  const segments = result?.status === 'done' ? result.segments : []

  const handleTextChange = useCallback((index: number, text: string) => {
    updateSegment(clipId, index, { text })
  }, [clipId, updateSegment])

  const handleStartChange = useCallback((index: number, value: string) => {
    const start = parseTime(value)
    if (!isNaN(start)) {
      updateSegment(clipId, index, { start })
    }
  }, [clipId, updateSegment])

  const handleEndChange = useCallback((index: number, value: string) => {
    const end = parseTime(value)
    if (!isNaN(end)) {
      updateSegment(clipId, index, { end })
    }
  }, [clipId, updateSegment])

  const handleDelete = useCallback((index: number) => {
    deleteSegment(clipId, index)
    announce(`Caption ${index + 1} deleted`)
  }, [clipId, deleteSegment, announce])

  const handleDeleteAll = useCallback(() => {
    deleteAllSegments(clipId)
    announce('All captions deleted')
  }, [clipId, deleteAllSegments, announce])

  const handleRestore = useCallback(() => {
    restoreSegments(clipId)
    announce('Captions restored to original')
  }, [clipId, restoreSegments, announce])

  const handleAutoFit = useCallback(() => {
    autoFitTimings(clipId)
    announce('Caption timings auto-fitted')
  }, [clipId, autoFitTimings, announce])

  const handleSkip = useCallback((time: number) => {
    const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
    const clipIndex = clipsA.findIndex((c) => c.id === clipId)
    let offset = 0
    for (let i = 0; i < clipIndex; i++) {
      offset += clipsA[i].duration
    }
    useClipStore.getState().setPendingSeek(offset + time)
    announce(`Seeking to ${fmt(time)}`)
  }, [projectId, clipId, announce])

  if (segments.length === 0) return null

  return (
    <div role="region" aria-label="Caption editor" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300">Edit Captions</h3>
        <span className="text-[10px] text-gray-500">{segments.length} segment{segments.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDeleteAll}
          className="rounded-md bg-rose-800/50 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-700/50 focus:outline-none focus:ring-2 focus:ring-rose-500"
          aria-label="Delete all captions"
        >
          Delete All
        </button>
        <button
          type="button"
          onClick={handleRestore}
          className="rounded-md bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          aria-label="Keep all original captions"
        >
          Keep All
        </button>
        <button
          type="button"
          onClick={handleAutoFit}
          className="rounded-md bg-sky-800/50 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-700/50 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Auto-fit all caption timings"
        >
          Auto-Fit All
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto space-y-1 rounded-md bg-gray-900 p-1" role="list" aria-label="Editable caption segments">
        {segments.map((seg, i) => (
          <div key={i} role="listitem" aria-label={`Caption ${i + 1} of ${segments.length}`} className="rounded bg-gray-800 p-2 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-gray-500 shrink-0">#{i + 1}</span>
              <input
                type="text"
                defaultValue={fmt(seg.start)}
                onBlur={(e) => handleStartChange(i, e.target.value)}
                aria-label={`Caption ${i + 1} start time`}
                className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-[10px] text-gray-500">–</span>
              <input
                type="text"
                defaultValue={fmt(seg.end)}
                onBlur={(e) => handleEndChange(i, e.target.value)}
                aria-label={`Caption ${i + 1} end time`}
                className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={() => handleSkip(seg.start)}
                aria-label={`Preview caption ${i + 1}`}
                className="ml-1 rounded p-0.5 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(i)}
                aria-label={`Delete caption ${i + 1}`}
                className="ml-auto rounded p-0.5 text-gray-500 hover:text-red-400 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <textarea
              defaultValue={seg.text}
              onBlur={(e) => handleTextChange(i, e.target.value)}
              rows={1}
              aria-label={`Caption ${i + 1} text`}
              className="w-full resize-none rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        ))}
      </div>
    </div>
  )
}