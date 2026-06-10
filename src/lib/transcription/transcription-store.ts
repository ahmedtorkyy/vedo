import { create } from 'zustand'
import type { TranscriptionResult, TranscriptionSegment } from '../../types'

interface TranscriptionStore {
  results: Record<string, TranscriptionResult>
  setStatus: (clipId: string, status: TranscriptionResult['status']) => void
  setSegments: (clipId: string, segments: TranscriptionSegment[], language: string) => void
  setError: (clipId: string, error: string) => void
  clearResult: (clipId: string) => void
  clearAll: () => void
}

export const useTranscriptionStore = create<TranscriptionStore>((set) => ({
  results: {},

  setStatus: (clipId, status) =>
    set((state) => ({
      results: {
        ...state.results,
        [clipId]: { ...(state.results[clipId] ?? { clipId, status: 'idle', segments: [] }), status },
      },
    })),

  setSegments: (clipId, segments, language) =>
    set((state) => ({
      results: {
        ...state.results,
        [clipId]: {
          ...(state.results[clipId] ?? { clipId, status: 'idle', segments: [] }),
          status: 'done',
          segments,
          language,
        },
      },
    })),

  setError: (clipId, error) =>
    set((state) => ({
      results: {
        ...state.results,
        [clipId]: {
          ...(state.results[clipId] ?? { clipId, status: 'idle', segments: [] }),
          status: 'error',
          error,
        },
      },
    })),

  clearResult: (clipId) =>
    set((state) => {
      const next = { ...state.results }
      delete next[clipId]
      return { results: next }
    }),

  clearAll: () => set({ results: {} }),
}))
