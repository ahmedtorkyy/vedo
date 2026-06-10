import { useState, useCallback } from 'react'
import { useClipStore } from '../../lib/state'
import { useTranscriptionStore, getAvailableModels } from '../../lib/transcription'
import { useTranscription } from '../../hooks/useTranscription'
import { TranscriptionSegmentRow } from './TranscriptionSegment'
import type { AudioCleansingOptions } from '../../types'

const MODELS = getAvailableModels()

interface TranscriptionPanelProps {
  projectId: string
}

export function TranscriptionPanel({ projectId }: TranscriptionPanelProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [cleansing, setCleansing] = useState(false)
  const clipsA = useClipStore((s) => s.getSlotClips(projectId, 'A'))
  const clipsB = useClipStore((s) => s.getSlotClips(projectId, 'B'))
  const allClips = [...clipsA, ...clipsB]
  const results = useTranscriptionStore((s) => s.results)
  const { transcribeClip, cleanseClipAudio, modelKey, setModelKey } = useTranscription()

  const result = selectedClipId ? results[selectedClipId] : undefined
  const selectedClip = allClips.find((c) => c.id === selectedClipId)
  const loadingModel = Object.values(results).some((r) => r.status === 'transcribing')

  const handleTranscribe = useCallback(() => {
    if (selectedClipId) transcribeClip(projectId, selectedClipId)
  }, [projectId, selectedClipId, transcribeClip])

  const handleCleanse = useCallback(async () => {
    if (!selectedClipId) return
    setCleansing(true)
    const opts: AudioCleansingOptions = { noiseReduction: true, silenceTrim: true, threshold: 30 }
    await cleanseClipAudio(projectId, selectedClipId, opts)
    setCleansing(false)
  }, [projectId, selectedClipId, cleanseClipAudio])

  const handleSegmentClick = useCallback((start: number) => {
    console.log('Seek to', start)
  }, [])

  const canTranscribe = selectedClipId && (!result || result.status === 'idle' || result.status === 'error')
  const isBusy = result?.status === 'extracting' || result?.status === 'transcribing' || cleansing || loadingModel

  return (
    <section role="region" aria-label="Transcription panel" className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">AI Transcription</h2>

      <div className="space-y-1">
        <label htmlFor="transcribe-clip" className="text-xs text-gray-500">Select a clip</label>
        <select
          id="transcribe-clip"
          value={selectedClipId ?? ''}
          onChange={(e) => setSelectedClipId(e.target.value || null)}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Select clip to transcribe"
        >
          <option value="">— Choose a clip —</option>
          {allClips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.fileName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="model-select" className="text-xs text-gray-500">Model</label>
        <select
          id="model-select"
          value={modelKey}
          onChange={(e) => setModelKey(e.target.value as typeof modelKey)}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Select transcription model"
        >
          {MODELS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {selectedClipId && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={!canTranscribe || isBusy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label={isBusy ? 'Transcription in progress' : 'Transcribe selected clip'}
          >
            {result?.status === 'extracting' && 'Extracting audio...'}
            {result?.status === 'transcribing' && 'Transcribing...'}
            {loadingModel && 'Loading model...'}
            {!isBusy && (result?.status === 'done' ? 'Re-transcribe' : 'Transcribe')}
          </button>

          {result?.status === 'done' && (
            <button
              type="button"
              onClick={handleCleanse}
              disabled={cleansing}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Clean audio and re-transcribe"
            >
              {cleansing ? 'Cleaning...' : 'Clean Audio'}
            </button>
          )}
        </div>
      )}

      {result?.error && (
        <div role="alert" className="rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {result.error}
        </div>
      )}

      {result?.status === 'done' && result.segments.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {result.segments.length} segments
              {result.language && ` · ${result.language}`}
            </span>
            <span className="text-xs text-gray-500">
              {selectedClip?.fileName}
            </span>
          </div>
          <div
            className="max-h-80 overflow-y-auto space-y-0.5 rounded-md bg-gray-900 p-1"
            role="list"
            aria-label="Transcription segments"
          >
            {result.segments.map((seg, i) => (
              <TranscriptionSegmentRow
                key={i}
                segment={seg}
                index={i}
                onClick={handleSegmentClick}
              />
            ))}
          </div>
        </div>
      )}

      {result?.status === 'done' && result.segments.length === 0 && (
        <p className="text-sm text-gray-500">No speech detected.</p>
      )}

      {allClips.length === 0 && (
        <p className="text-sm text-gray-500">Upload clips to get started.</p>
      )}
    </section>
  )
}
