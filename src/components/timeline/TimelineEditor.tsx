import { useState, useCallback, useMemo } from 'react'
import { useClipStore } from '../../lib/state'
import { useTranscriptionStore } from '../../lib/transcription'
import { useTimelineStore } from '../../lib/timeline/timeline-store'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { computeStitchedOffset } from '../../lib/timeline/compute-offset'
import type { Clip } from '../../types'

interface TimelineEditorProps {
  projectId: string
  onConcatNeeded?: () => void
}

interface EntryMeta {
  id: string
  label: string
  type: 'clip' | 'caption' | 'overlay'
  originalStart: number
  originalEnd: number
  clipId?: string
  captionIndex?: number
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

export function TimelineEditor({ projectId, onConcatNeeded }: TimelineEditorProps) {
  const clipsA = useClipStore((s) => s.getSlotClips(projectId, 'A'))
  const clipsB = useClipStore((s) => s.getSlotClips(projectId, 'B'))
  const transcriptResults = useTranscriptionStore((s) => s.results)
  const timelineEdits = useTimelineStore((s) => s.edits[projectId] ?? {})
  const setEdit = useTimelineStore((s) => s.setEdit)
  const removeEdit = useTimelineStore((s) => s.removeEdit)
  const clearProjectEdits = useTimelineStore((s) => s.clearProjectEdits)
  const updateSegment = useTranscriptionStore((s) => s.updateSegment)
  const { announce } = useAriaAnnouncer()
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [draftStart, setDraftStart] = useState<Record<string, string>>({})
  const [draftEnd, setDraftEnd] = useState<Record<string, string>>({})
  const [draftDur, setDraftDur] = useState<Record<string, string>>({})

  const entries = useMemo(() => {
    const result: EntryMeta[] = []
    for (const clip of clipsA) {
      result.push({
        id: clip.id,
        label: `Clip: ${clip.fileName}`,
        type: 'clip',
        originalStart: 0,
        originalEnd: clip.duration,
        clipId: clip.id,
      })
    }
    for (const clip of clipsB) {
      result.push({
        id: `overlay-${clip.id}`,
        label: `Overlay: ${clip.fileName}`,
        type: 'overlay',
        originalStart: 0,
        originalEnd: clip.duration,
        clipId: clip.id,
      })
    }
    for (const [clipId, r] of Object.entries(transcriptResults)) {
      if (r.status !== 'done') continue
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i]
        result.push({
          id: `caption-${clipId}-${i}`,
          label: `Caption: "${seg.text.slice(0, 40)}"`,
          type: 'caption',
          originalStart: seg.start,
          originalEnd: seg.end,
          clipId,
          captionIndex: i,
        })
      }
    }
    return result
  }, [clipsA, clipsB, transcriptResults])

  const getValue = useCallback((entry: EntryMeta) => {
    const edit = timelineEdits[entry.id]
    if (edit) return { start: edit.start, end: edit.end }
    return { start: entry.originalStart, end: entry.originalEnd }
  }, [timelineEdits])

  const handleStartDraft = useCallback((entryId: string, value: string) => {
    setDraftStart((prev) => ({ ...prev, [entryId]: value }))
  }, [])

  const handleEndDraft = useCallback((entryId: string, value: string) => {
    setDraftEnd((prev) => ({ ...prev, [entryId]: value }))
  }, [])

  const handleDurDraft = useCallback((entryId: string, value: string) => {
    setDraftDur((prev) => ({ ...prev, [entryId]: value }))
  }, [])

  const commitStart = useCallback((entryId: string) => {
    const draft = draftStart[entryId]
    if (draft === undefined) return
    const start = parseTime(draft)
    if (isNaN(start)) {
      setDraftStart((prev) => { const n = { ...prev }; delete n[entryId]; return n })
      return
    }
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) return
    const current = getValue(entry)
    setEdit(projectId, entryId, start, current.end)
    setDraftStart((prev) => { const n = { ...prev }; delete n[entryId]; return n })
    announce(`${entry.label} start set to ${fmt(start)}`)
  }, [draftStart, entries, getValue, projectId, setEdit, announce])

  const commitEnd = useCallback((entryId: string) => {
    const draft = draftEnd[entryId]
    if (draft === undefined) return
    const end = parseTime(draft)
    if (isNaN(end)) {
      setDraftEnd((prev) => { const n = { ...prev }; delete n[entryId]; return n })
      return
    }
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) return
    const current = getValue(entry)
    setEdit(projectId, entryId, current.start, end)
    setDraftEnd((prev) => { const n = { ...prev }; delete n[entryId]; return n })
    announce(`${entry.label} end set to ${fmt(end)}`)
  }, [draftEnd, entries, getValue, projectId, setEdit, announce])

  const commitDur = useCallback((entryId: string) => {
    const draft = draftDur[entryId]
    if (draft === undefined) return
    const dur = parseTime(draft)
    if (isNaN(dur) || dur <= 0) {
      setDraftDur((prev) => { const n = { ...prev }; delete n[entryId]; return n })
      return
    }
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) return
    const current = getValue(entry)
    setEdit(projectId, entryId, current.start, current.start + dur)
    setDraftDur((prev) => { const n = { ...prev }; delete n[entryId]; return n })
    announce(`${entry.label} duration set to ${dur.toFixed(1)}s`)
  }, [draftDur, entries, getValue, projectId, setEdit, announce])

  const handleInputKeyDown = useCallback((entryId: string, commit: () => void, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commit()
    }
  }, [])

  const handlePreview = useCallback((entry: EntryMeta, time: number) => {
    const offset = entry.type === 'clip' && entry.clipId
      ? computeStitchedOffset(projectId, entry.clipId)
      : 0
    useClipStore.getState().setPendingSeek(offset + time)
    announce(`Preview at ${fmt(offset + time)}`)
  }, [projectId, announce])

  const handleReset = useCallback((entryId: string, entry: EntryMeta) => {
    removeEdit(projectId, entryId)
    announce(`${entry.label} reset`)
  }, [projectId, removeEdit, announce])

  const handleApplyItem = useCallback(async (entry: EntryMeta) => {
    const edit = timelineEdits[entry.id]
    if (!edit) return
    setApplyingId(entry.id)
    try {
      if (entry.type === 'clip' && entry.clipId) {
        const changed = edit.start !== entry.originalStart || edit.end !== entry.originalEnd
        if (changed) {
          const { smartCutVideo } = await import('../../lib/ffmpeg')
          const clip = clipsA.find((c) => c.id === entry.clipId)
          if (clip) {
            const segments: { start: number; end: number }[] = []
            if (edit.start > entry.originalStart) {
              segments.push({ start: entry.originalStart, end: edit.start })
            }
            if (edit.end < entry.originalEnd) {
              segments.push({ start: edit.end, end: entry.originalEnd })
            }
            const outName = await smartCutVideo(projectId, clip.opfsFilename, segments, clip.duration)
            const newClip: Clip = {
              id: `trim-${clip.id}-${Date.now()}`,
              fileName: `Trimmed: ${clip.fileName}`,
              fileSize: clip.fileSize,
              filePath: clip.filePath,
              opfsFilename: outName,
              duration: Math.max(0.1, edit.end - edit.start),
              muted: clip.muted,
            }
            const store = useClipStore.getState()
            const currentClipsA = store.getSlotClips(projectId, 'A')
            const idx = currentClipsA.findIndex((c) => c.id === entry.clipId)
            store.removeClip(projectId, 'A', entry.clipId)
            store.insertClipAt(projectId, 'A', idx, newClip)
          }
        }
      }
      if (entry.type === 'caption' && entry.clipId && entry.captionIndex !== undefined) {
        updateSegment(entry.clipId, entry.captionIndex, { start: edit.start, end: edit.end })
      }
      if (entry.type === 'overlay' && entry.clipId) {
        const overlayClip = clipsB.find((c) => c.id === entry.clipId)
        if (overlayClip) {
          const store = useClipStore.getState()
          const currentClipsB = store.getSlotClips(projectId, 'B')
          const idx = currentClipsB.findIndex((c) => c.id === entry.clipId)
          store.removeClip(projectId, 'B', entry.clipId)
          const updated: Clip = {
            ...overlayClip,
            duration: Math.max(0.1, edit.end - edit.start),
          }
          store.insertClipAt(projectId, 'B', idx, updated)
        }
        const { useDirectorStore } = await import('../../lib/director')
        useDirectorStore.getState().updateOverlayDecision(projectId, entry.clipId, edit.start, edit.end)
      }
      removeEdit(projectId, entry.id)
      onConcatNeeded?.()
      announce(`${entry.label} applied`)
    } catch {
      announce(`Apply failed for ${entry.label}`, true)
    } finally {
      setApplyingId(null)
    }
  }, [projectId, timelineEdits, clipsA, clipsB, updateSegment, removeEdit, onConcatNeeded, announce])

  const handleApplyAll = useCallback(async () => {
    const dirty = entries.filter((e) => timelineEdits[e.id])
    for (const entry of dirty) {
      await handleApplyItem(entry)
    }
    announce(`${dirty.length} change${dirty.length !== 1 ? 's' : ''} applied`)
  }, [entries, timelineEdits, handleApplyItem, announce])

  const handleResetAll = useCallback(() => {
    clearProjectEdits(projectId)
    announce('All timeline edits reset')
  }, [projectId, clearProjectEdits, announce])

  const dirtyEntries = entries.filter((e) => timelineEdits[e.id])
  const dirtyCount = dirtyEntries.length

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
            <>
              <span className="text-[10px] text-amber-400">{dirtyCount} unsaved</span>
              <button
                type="button"
                onClick={handleApplyAll}
                className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label={`Apply all ${dirtyCount} changes`}
              >
                Apply All
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleResetAll}
            disabled={dirtyCount === 0}
            className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label="Reset all timeline edits"
          >
            Reset All
          </button>
        </div>
      </div>

      <div className="space-y-1" role="list" aria-label="Timeline entries">
        {entries.map((entry) => {
          const current = getValue(entry)
          const isDirty = entry.id in timelineEdits
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
                  value={draftStart[entry.id] ?? fmt(current.start)}
                  onChange={(e) => handleStartDraft(entry.id, e.target.value)}
                  onBlur={() => commitStart(entry.id)}
                  onKeyDown={(e) => handleInputKeyDown(entry.id, () => commitStart(entry.id), e)}
                  aria-label={`${entry.label} start time`}
                  className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <label className="text-[9px] text-gray-500">End</label>
                <input
                  type="text"
                  value={draftEnd[entry.id] ?? fmt(current.end)}
                  onChange={(e) => handleEndDraft(entry.id, e.target.value)}
                  onBlur={() => commitEnd(entry.id)}
                  onKeyDown={(e) => handleInputKeyDown(entry.id, () => commitEnd(entry.id), e)}
                  aria-label={`${entry.label} end time`}
                  className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <label className="text-[9px] text-gray-500">Dur</label>
                <input
                  type="text"
                  value={draftDur[entry.id] ?? duration.toFixed(1)}
                  onChange={(e) => handleDurDraft(entry.id, e.target.value)}
                  onBlur={() => commitDur(entry.id)}
                  onKeyDown={(e) => handleInputKeyDown(entry.id, () => commitDur(entry.id), e)}
                  aria-label={`${entry.label} duration in seconds`}
                  className="w-14 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-[10px] font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />

                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => handlePreview(entry, current.start)}
                    aria-label={`Preview ${entry.label}`}
                    className="rounded p-0.5 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </button>
                  {isDirty && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyItem(entry)}
                        disabled={applyingId === entry.id}
                        className="rounded px-1 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {applyingId === entry.id ? '...' : 'Apply'}
                      </button>
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
                    </>
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