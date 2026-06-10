import { useState, useCallback, useMemo } from 'react'
import { useClipStore } from '../../lib/state'
import { useEditingStore } from '../../lib/editing'
import { useEditing } from '../../hooks/useEditing'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { useTranscriptionStore } from '../../lib/transcription'
import { SilenceTimeline } from './SilenceTimeline'
import { SmartCutPanel } from './SmartCutPanel'
import type { SmartCutOptions, SilenceSegment } from '../../types'

interface EditingPanelProps {
  projectId: string
}

function defaultOptions(clipId: string): SmartCutOptions {
  return { enabled: true, aggressiveness: 'medium' }
}

export function EditingPanel({ projectId }: EditingPanelProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [cutStatus, setCutStatus] = useState<'idle' | 'applying' | 'done' | 'error'>('idle')
  const [cutError, setCutError] = useState<string | undefined>()

  const clipsA = useClipStore((s) => s.getSlotClips(projectId, 'A'))
  const clipsB = useClipStore((s) => s.getSlotClips(projectId, 'B'))
  const allClips = [...clipsA, ...clipsB]

  const analysis = useEditingStore((s) => s.analysis)
  const options = useEditingStore((s) => s.smartCutOptions)
  const setSmartCutOptions = useEditingStore((s) => s.setSmartCutOptions)

  const transcriptResults = useTranscriptionStore((s) => s.results)

  const { detectSilenceForClip, applySmartCut } = useEditing()
  const { announce } = useAriaAnnouncer()

  const selectedClip = allClips.find((c) => c.id === selectedClipId)
  const selectedAnalysis = selectedClipId ? analysis[selectedClipId] : undefined
  const selectedOptions = selectedClipId ? (options[selectedClipId] ?? defaultOptions(selectedClipId)) : defaultOptions('')
  const selectedTranscript = selectedClipId ? transcriptResults[selectedClipId] : undefined

  const isAnalyzing = selectedAnalysis?.status === 'analyzing'

  const silenceSegments = useMemo(() => {
    if (!selectedAnalysis || selectedAnalysis.status !== 'done') return []
    return selectedAnalysis.silenceSegments
  }, [selectedAnalysis])

  const fillerWords = useMemo(() => {
    if (!selectedAnalysis || selectedAnalysis.status !== 'done') return []
    return selectedAnalysis.fillerWords.map((f) => ({ start: f.start, word: f.word }))
  }, [selectedAnalysis])

  const lowEnergySections = useMemo(() => {
    if (!selectedAnalysis || selectedAnalysis.status !== 'done') return []
    return selectedAnalysis.lowEnergySections
  }, [selectedAnalysis])

  const handleDetect = useCallback(() => {
    if (!selectedClipId) return
    setCutStatus('idle')
    setCutError(undefined)
    detectSilenceForClip(projectId, selectedClipId)
    announce('Starting silence detection')
  }, [projectId, selectedClipId, detectSilenceForClip, announce])

  const handleOptionsChange = useCallback((_clipId: string, newOptions: SmartCutOptions) => {
    if (!selectedClipId) return
    setSmartCutOptions(selectedClipId, newOptions)
  }, [selectedClipId, setSmartCutOptions])

  const handleApply = useCallback(async () => {
    if (!selectedClipId) return
    setCutStatus('applying')
    setCutError(undefined)
    try {
      const outputFilename = await applySmartCut(projectId, selectedClipId)
      if (outputFilename) {
        setCutStatus('done')
        announce('Smart cut complete. New clip created with silence removed.')
      }
    } catch (err) {
      setCutStatus('error')
      setCutError(err instanceof Error ? err.message : 'Smart cut failed')
      announce('Smart cut failed', true)
    }
  }, [projectId, selectedClipId, applySmartCut, announce])

  const totalSilenceDuration = silenceSegments.reduce((sum, s) => sum + s.duration, 0)
  const clipDuration = selectedClip?.duration ?? 0

  return (
    <section role="region" aria-label="Editing panel" className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">Editing Intelligence</h2>

      <div className="space-y-1">
        <label htmlFor="edit-clip" className="text-xs text-gray-500">Select a clip to analyze</label>
        <select
          id="edit-clip"
          value={selectedClipId ?? ''}
          onChange={(e) => {
            setSelectedClipId(e.target.value || null)
            setCutStatus('idle')
            setCutError(undefined)
          }}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Select clip for editing"
        >
          <option value="">— Choose a clip —</option>
          {allClips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.fileName} {analysis[clip.id]?.status === 'done' ? '(analyzed)' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedClipId && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDetect}
            disabled={isAnalyzing}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-xs text-white hover:bg-violet-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label={isAnalyzing ? 'Analyzing audio...' : 'Detect silence and analyze'}
          >
            {isAnalyzing ? 'Analyzing...' : (selectedAnalysis?.status === 'done' ? 'Re-analyze' : 'Detect Silence')}
          </button>
        </div>
      )}

      {selectedAnalysis?.error && (
        <div role="alert" className="rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {selectedAnalysis.error}
        </div>
      )}

      {selectedAnalysis?.status === 'done' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2" role="list" aria-label="Analysis summary">
            <div role="listitem" className="rounded bg-gray-800 p-2 text-center">
              <div className="text-lg font-bold text-rose-400">{silenceSegments.length}</div>
              <div className="text-[10px] text-gray-500">Silent regions</div>
            </div>
            <div role="listitem" className="rounded bg-gray-800 p-2 text-center">
              <div className="text-lg font-bold text-amber-400">{totalSilenceDuration.toFixed(1)}s</div>
              <div className="text-[10px] text-gray-500">Total silence</div>
            </div>
            <div role="listitem" className="rounded bg-gray-800 p-2 text-center">
              <div className="text-lg font-bold text-emerald-400">
                {clipDuration > 0 ? `${((1 - totalSilenceDuration / clipDuration) * 100).toFixed(0)}%` : '-'}
              </div>
              <div className="text-[10px] text-gray-500">Speech content</div>
            </div>
          </div>

          {selectedAnalysis.fillerWords.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Filler words ({selectedAnalysis.fillerWords.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedAnalysis.fillerWords.slice(0, 20).map((fw, i) => (
                  <span key={i} className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-300">
                    &ldquo;{fw.word}&rdquo;
                  </span>
                ))}
                {selectedAnalysis.fillerWords.length > 20 && (
                  <span className="text-[10px] text-gray-500">+{selectedAnalysis.fillerWords.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          {selectedAnalysis.repeatedPhrases.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500">Repeated phrases ({selectedAnalysis.repeatedPhrases.length})</span>
              <div className="flex flex-wrap gap-1">
                {selectedAnalysis.repeatedPhrases.slice(0, 10).map((phrase, i) => (
                  <span key={i} className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-300">
                    &ldquo;{phrase}&rdquo;
                  </span>
                ))}
                {selectedAnalysis.repeatedPhrases.length > 10 && (
                  <span className="text-[10px] text-gray-500">+{selectedAnalysis.repeatedPhrases.length - 10} more</span>
                )}
              </div>
            </div>
          )}

          <SilenceTimeline
            duration={clipDuration}
            segments={silenceSegments}
            fillerWords={fillerWords}
            lowEnergySections={lowEnergySections}
          />

          <SmartCutPanel
            clipId={selectedClipId}
            options={selectedOptions}
            silenceCount={silenceSegments.length}
            onOptionsChange={handleOptionsChange}
            onApply={handleApply}
            disabled={cutStatus === 'applying'}
            status={cutStatus}
            error={cutError}
          />

          {cutStatus === 'done' && (
            <div role="status" className="rounded bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300">
              Smart cut complete. The new video has been saved to your project files.
            </div>
          )}
        </div>
      )}

      {selectedTranscript && selectedTranscript.status === 'done' && (
        <details className="rounded-md border border-gray-700 bg-gray-800/30">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200" role="button" aria-label="View transcript reference">
            Transcript Reference ({selectedTranscript.segments.length} segments)
          </summary>
          <div className="max-h-40 overflow-y-auto px-3 pb-2">
            {selectedTranscript.segments.map((seg, i) => (
              <div key={i} className="flex gap-2 py-0.5 text-[10px] text-gray-400">
                <span className="shrink-0 font-mono text-gray-500">
                  {Math.floor(seg.start / 60)}:{Math.floor(seg.start % 60).toString().padStart(2, '0')}
                </span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {allClips.length === 0 && (
        <p className="text-sm text-gray-500">Upload clips to start editing.</p>
      )}
    </section>
  )
}
