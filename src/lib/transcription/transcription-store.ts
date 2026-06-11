import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TranscriptionResult, TranscriptionSegment } from '../../types'
import { useClipStore } from '../state/clip-store'

interface TranscriptionStore {
  results: Record<string, TranscriptionResult>
  backupSegments: Record<string, TranscriptionSegment[]>
  setStatus: (clipId: string, status: TranscriptionResult['status']) => void
  setSegments: (clipId: string, segments: TranscriptionSegment[], language: string) => void
  setError: (clipId: string, error: string) => void
  updateSegment: (clipId: string, index: number, updates: Partial<TranscriptionSegment>) => void
  deleteSegment: (clipId: string, index: number) => void
  deleteAllSegments: (clipId: string) => void
  restoreSegments: (clipId: string) => void
  autoFitTimings: (clipId: string) => void
  clearResult: (clipId: string) => void
  removeProjectData: (projectId: string) => void
  clearAll: () => void
}

export const useTranscriptionStore = create<TranscriptionStore>()(
  persist(
    (set) => ({
      results: {},
      backupSegments: {},

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
          backupSegments: state.backupSegments[clipId]
            ? state.backupSegments
            : { ...state.backupSegments, [clipId]: segments.map((s) => ({ ...s })) },
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

      updateSegment: (clipId, index, updates) =>
        set((state) => {
          const result = state.results[clipId]
          if (!result || result.status !== 'done') return {}
          const segments = [...result.segments]
          if (index < 0 || index >= segments.length) return {}
          segments[index] = { ...segments[index], ...updates }
          return {
            results: { ...state.results, [clipId]: { ...result, segments } },
          }
        }),

      deleteSegment: (clipId, index) =>
        set((state) => {
          const result = state.results[clipId]
          if (!result || result.status !== 'done') return {}
          const segments = result.segments.filter((_, i) => i !== index)
          return {
            results: { ...state.results, [clipId]: { ...result, segments } },
          }
        }),

      deleteAllSegments: (clipId) =>
        set((state) => {
          const result = state.results[clipId]
          if (!result) return {}
          return {
            results: { ...state.results, [clipId]: { ...result, segments: [] } },
          }
        }),

      restoreSegments: (clipId) =>
        set((state) => {
          const backup = state.backupSegments[clipId]
          if (!backup) return {}
          const result = state.results[clipId]
          if (!result) return {}
          return {
            results: { ...state.results, [clipId]: { ...result, segments: backup.map((s) => ({ ...s })) } },
          }
        }),

      autoFitTimings: (clipId) =>
        set((state) => {
          const result = state.results[clipId]
          if (!result || result.segments.length < 2) return {}
          const segments = [...result.segments]
          const totalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0)
          const segDuration = totalDuration / segments.length
          let cursor = segments[0].start
          for (let i = 0; i < segments.length; i++) {
            segments[i] = { ...segments[i], start: cursor, end: cursor + segDuration }
            cursor += segDuration
          }
          return {
            results: { ...state.results, [clipId]: { ...result, segments } },
          }
        }),

      clearResult: (clipId) =>
        set((state) => {
          const next = { ...state.results }
          delete next[clipId]
          return { results: next }
        }),

      removeProjectData: (projectId) =>
        set((state) => {
          const { getSlotClips } = useClipStore.getState()
          const clipsA = getSlotClips(projectId, 'A')
          const clipsB = getSlotClips(projectId, 'B')
          const allClipIds = new Set([...clipsA, ...clipsB].map((c) => c.id))
          let changed = false
          const next = { ...state.results }
          const nextBackup = { ...state.backupSegments }
          for (const clipId of allClipIds) {
            if (next[clipId]) {
              delete next[clipId]
              changed = true
            }
            if (nextBackup[clipId]) {
              delete nextBackup[clipId]
            }
          }
          return changed ? { results: next, backupSegments: nextBackup } : {}
        }),

      clearAll: () => set({ results: {}, backupSegments: {} }),
    }),
    { name: 'vedo-transcriptions' }
  )
)