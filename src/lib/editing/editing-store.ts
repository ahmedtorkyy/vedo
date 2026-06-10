import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SilenceSegment, SmartCutOptions, TimelineMarker, FillerWordOccurrence, AnalysisResult } from '../../types'
import { useClipStore } from '../state/clip-store'

interface EditingStore {
  analysis: Record<string, AnalysisResult>
  markers: Record<string, TimelineMarker[]>
  smartCutOptions: Record<string, SmartCutOptions>

  setAnalysisStatus: (clipId: string, status: AnalysisResult['status']) => void
  setSilenceSegments: (clipId: string, segments: SilenceSegment[]) => void
  setFillerWords: (clipId: string, words: FillerWordOccurrence[]) => void
  setRepeatedPhrases: (clipId: string, phrases: string[]) => void
  setLowEnergySections: (clipId: string, sections: SilenceSegment[]) => void
  setAnalysisDone: (clipId: string) => void
  setAnalysisError: (clipId: string, error: string) => void

  setMarkers: (clipId: string, markers: TimelineMarker[]) => void
  addMarker: (clipId: string, marker: TimelineMarker) => void
  removeMarker: (clipId: string, markerId: string) => void

  setSmartCutOptions: (clipId: string, options: SmartCutOptions) => void

  clearClipData: (clipId: string) => void
  removeProjectData: (projectId: string) => void
  clearAll: () => void
}

function emptyAnalysis(clipId: string): AnalysisResult {
  return {
    clipId,
    status: 'idle',
    silenceSegments: [],
    fillerWords: [],
    repeatedPhrases: [],
    lowEnergySections: [],
  }
}

export const useEditingStore = create<EditingStore>()(
  persist(
    (set) => ({
      analysis: {},
      markers: {},
      smartCutOptions: {},

      setAnalysisStatus: (clipId, status) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), status },
          },
        })),

      setSilenceSegments: (clipId, segments) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), silenceSegments: segments },
          },
        })),

      setFillerWords: (clipId, words) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), fillerWords: words },
          },
        })),

      setRepeatedPhrases: (clipId, phrases) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), repeatedPhrases: phrases },
          },
        })),

      setLowEnergySections: (clipId, sections) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), lowEnergySections: sections },
          },
        })),

      setAnalysisDone: (clipId) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), status: 'done' },
          },
        })),

      setAnalysisError: (clipId, error) =>
        set((s) => ({
          analysis: {
            ...s.analysis,
            [clipId]: { ...(s.analysis[clipId] ?? emptyAnalysis(clipId)), status: 'error', error },
          },
        })),

      setMarkers: (clipId, markers) =>
        set((s) => ({
          markers: { ...s.markers, [clipId]: markers },
        })),

      addMarker: (clipId, marker) =>
        set((s) => ({
          markers: {
            ...s.markers,
            [clipId]: [...(s.markers[clipId] ?? []), marker],
          },
        })),

      removeMarker: (clipId, markerId) =>
        set((s) => ({
          markers: {
            ...s.markers,
            [clipId]: (s.markers[clipId] ?? []).filter((m) => m.id !== markerId),
          },
        })),

      setSmartCutOptions: (clipId, options) =>
        set((s) => ({
          smartCutOptions: { ...s.smartCutOptions, [clipId]: options },
        })),

      clearClipData: (clipId) =>
        set((s) => {
          const nextAnalysis = { ...s.analysis }
          delete nextAnalysis[clipId]
          const nextMarkers = { ...s.markers }
          delete nextMarkers[clipId]
          const nextOptions = { ...s.smartCutOptions }
          delete nextOptions[clipId]
          return { analysis: nextAnalysis, markers: nextMarkers, smartCutOptions: nextOptions }
        }),

      removeProjectData: (projectId) =>
        set((s) => {
          const { getSlotClips } = useClipStore.getState()
          const clipsA = getSlotClips(projectId, 'A')
          const clipsB = getSlotClips(projectId, 'B')
          const allClipIds = [...clipsA, ...clipsB].map((c) => c.id)
          const nextAnalysis = { ...s.analysis }
          const nextMarkers = { ...s.markers }
          const nextOptions = { ...s.smartCutOptions }
          for (const clipId of allClipIds) {
            delete nextAnalysis[clipId]
            delete nextMarkers[clipId]
            delete nextOptions[clipId]
          }
          return { analysis: nextAnalysis, markers: nextMarkers, smartCutOptions: nextOptions }
        }),

      clearAll: () => set({ analysis: {}, markers: {}, smartCutOptions: {} }),
    }),
    { name: 'vedo-editing' },
  ),
)
