import { useState, useCallback, useMemo } from 'react'
import { useClipStore } from '../../lib/state'
import { useTranscriptionStore } from '../../lib/transcription'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'

interface TimelineEditorProps {
  projectId: string
}

interface EditEntry {
  id: string
  label: string
  type: 'clip' | 'caption' | 'overlay'
  originalStart: number
  originalEnd: number
  originalDuration: number
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

export function TimelineEditor({ projectId }: TimelineEditorProps) {
  const clipsA = useClipStore((s) => s.getSlotClips(projectId, 'A'))
  const clipsB = useClipStore((s) => s.getSlotClips(projectId, 'B'))
  const transcriptResults = useTranscriptionStore((s) => s.results)
  const { announce } = useAriaAnnouncer()

  const [edits, setEdits] = useState<Record<string, { start: number; end: number }>>({})
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set())

  const entries = useMemo(() => {
    const result: EditEntry[] = []
    for (const clip of clipsA) {
      result.push({
        id: clip.id,
        label: `Clip: ${clip.fileName}`,
        type: 'clip',
        originalStart: 0,
        originalEnd: clip.duration,
        originalDuration: clip.duration,
      })
    }
    for (const clip of clipsB) {
      result.push({
        id: `overlay-${clip.id}`,
        label: `Overlay: ${clip.fileName}`,
        type: 'overlay',
        originalStart: 0,
        originalEnd: clip.duration,
        originalDuration: clip.duration,
      })
    }
    for (const [clipId, result_] of Object.entries(transcriptResults)) {
      if (result_.status !== 'done') continue
      for (let i = 0; i < result_.segments.length; i++) {
        const seg = result_.segments[i]
        result.push({
          id: `caption-${clipId}-${i}`,
          label: `Caption: "${seg.text.slice(0, 40)}"`,
          type: 'caption',
          originalStart: seg.start,
          originalEnd: seg.end,
          originalDuration: seg.end - seg.start,
        })
      }
    }
    return result
  }, [clipsA, clipsB, transcriptResults])

  const getCurrent = useCallback((entry: EditEntry) => {
    const e = edits[entry.id]
    return e ? { start: e.start, end: e.end } : { start: entry.originalStart, end: entry.originalEnd }
  }, [edits])

  const handleStartChange = useCallback((entryId: string, value: string) => {
    const start = parseTime(value)
    if (isNaN(start)) return
    setEdits((prev) => ({
      ...prev,
      [entryId]: { ...(prev[entryId] ?? { start: 0, end: 0 }), start },
    }))
    setDirtyItems((prev) => new Set(prev).add(entryId))
  }, [])

  const handleEndChange = useCallback((entryId: string, value: string) => {
    const end = parseTime(value)
    if (isNaN(end)) return
    setEdits((prev) => ({
      ...prev,
      [entryId]: { ...(prev[entryId] ?? { start: 0, end: 0 }), end },
    }))
    setDirtyItems((prev) => new Set(prev).add(entryId))
  }, [])

  const handleDurationChange = useCallback((entryId: string, entry: EditEntry, value: string) => {
    const dur = parseTime(value)
    if (isNaN(dur) || dur <= 0) return
    const current = getCurrent(entry)
    setEdits((prev) => ({
      ...prev,
      [entryId]: { start: current.start, end: current.start + dur },
    }))
    setDirtyItems((prev) => new Set(prev).add(entryId))
  }, [getCurrent])

  const handlePreview = useCallback((time: number) => {
    useClipStore.getState().setPendingSeek(time)
    announce(`Preview at ${fmt(time)}`)
  }, [announce])

  const handleReset = useCallback((entryId: string, entry: EditEntry) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[entryId]
      return next
    })
    setDirtyItems((prev) => {
      const next = new Set(prev)
      next.delete(entryId)
      return next
    })
    announce(`${entry.label} reset to original`)
  }, [announce])

  const handleResetAll = useCallback(() => {
    setEdits({})
    setDirtyItems(new Set())
    announce('All timeline edits reset')
  }, [announce])

  const dirtyCount = dirtyItems.size

  if (entries.length === 0) {
    return (
      <section role="region" aria-label="Timeline editor">
        <p className="text-sm text-gray-500">No clips, captions, or overlays to edit.</p>
      </section>
    )
  }

  return (
    <section role="region" aria-label="Timeline editor" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Timeline Editor</h2>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-[10px] text-amber-400">{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          )}
          <button
            type="button"
            onClick={handleResetAll}
            className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label="Reset all timeline edits"
          >
            Reset All
          </button>
        </div>
      </div>

      <div className="space-y-1" role="list" aria-label="Timeline entries">
        {entries.map((entry) => {
          const current = getCurrent(entry)
          const isDirty = dirtyItems.has(entry.id)
          const duration = current.end - current.start
          return (
            <div
              key={entry.id}
              role="listitem"
              aria-label={`${entry.label}, ${fmt(current.start)} to ${fmt(current.end)}`}
              className={`rounded border px-3 py-2 ${isDirty ? 'border-amber-700 bg-amber-900/10' : 'border-gray-700 bg-gray-800'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-200 truncate min-w-0 flex-1">
                  {entry.label}
                </span>
                <span className={`text-[9px] ml-2 ${entry.type === 'clip' ? 'text-sky-400' : entry.type === 'overlay' ? 'text-emerald-400' : 'text-violet-400'}`}>
                  {entry.type}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <label className="text-[9px] text-gray-500">Start</label>
                <input
                  type="text"
                  defaultValue={fmt(current.start)}
                  onBlur={(e) => handleStartChange(entry.id, e.target.value)}
                  aria-label={`${entry.label} start time`}
                  className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <label className="text-[9px] text-gray-500">End</label>
                <input
                  type="text"
                  defaultValue={fmt(current.end)}
                  onBlur={(e) => handleEndChange(entry.id, e.target.value)}
                  aria-label={`${entry.label} end time`}
                  className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <label className="text-[9px] text-gray-500">Dur</label>
                <input
                  type="text"
                  defaultValue={duration.toFixed(1)}
                  onBlur={(e) => handleDurationChange(entry.id, entry, e.target.value)}
                  aria-label={`${entry.label} duration in seconds`}
                  className="w-14 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />

                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => handlePreview(current.start)}
                    aria-label={`Preview ${entry.label}`}
                    className="rounded p-0.5 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </button>
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => handleReset(entry.id, entry)}
                      aria-label={`Reset ${entry.label}`}
                      className="rounded p-0.5 text-gray-500 hover:text-amber-400 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}