import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DirectorState, StyleKey, EditPlan, Suggestion } from './types'

interface DirectorStore {
  state: Record<string, DirectorState>
  setInstructions: (projectId: string, instructions: string) => void
  setStyle: (projectId: string, style: StyleKey) => void
  setStatus: (projectId: string, status: DirectorState['status']) => void
  setPlan: (projectId: string, plan: EditPlan) => void
  setSuggestions: (projectId: string, suggestions: Suggestion[]) => void
  setFeedbackText: (projectId: string, text: string) => void
  toggleSuggestion: (projectId: string, suggestionId: string) => void
  setError: (projectId: string, error: string) => void
  updateOverlayDecision: (projectId: string, decisionIndex: number, startTime: number, endTime: number) => void
  clearProject: (projectId: string) => void
  clearAll: () => void
}

function emptyState(_projectId: string): DirectorState {
  return {
    status: 'idle',
    instructions: '',
    selectedStyle: 'professional',
    plan: null,
    suggestions: [],
    feedbackText: '',
  }
}

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set) => ({
      state: {},

      setInstructions: (projectId, instructions) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), instructions },
          },
        })),

      setStyle: (projectId, style) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), selectedStyle: style },
          },
        })),

      setStatus: (projectId, status) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), status },
          },
        })),

      setPlan: (projectId, plan) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), plan, status: 'ready' },
          },
        })),

      setSuggestions: (projectId, suggestions) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), suggestions },
          },
        })),

      setFeedbackText: (projectId, feedbackText) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), feedbackText },
          },
        })),

      toggleSuggestion: (projectId, suggestionId) =>
        set((s) => {
          const existing = s.state[projectId]
          if (!existing) return {}
          return {
            state: {
              ...s.state,
              [projectId]: {
                ...existing,
                suggestions: existing.suggestions.map((sg) =>
                  sg.id === suggestionId ? { ...sg, selected: !sg.selected } : sg
                ),
              },
            },
          }
        }),

      setError: (projectId, error) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), status: 'error', error },
          },
        })),

      updateOverlayDecision: (projectId, decisionIndex, startTime, endTime) =>
        set((s) => {
          const existing = s.state[projectId]
          if (!existing?.plan) return {}
          const overlayIndices = existing.plan.decisions
            .map((d, i) => (d.type === 'overlay' ? i : -1))
            .filter((i) => i !== -1)
          const idx = overlayIndices[decisionIndex]
          if (idx === undefined) return {}
          return {
            state: {
              ...s.state,
              [projectId]: {
                ...existing,
                plan: {
                  ...existing.plan,
                  decisions: existing.plan.decisions.map((d, i) =>
                    i === idx ? { ...d, startTime, endTime } : d
                  ),
                },
              },
            },
          }
        }),

      clearProject: (projectId) =>
        set((s) => {
          const next = { ...s.state }
          delete next[projectId]
          return { state: next }
        }),

      clearAll: () => set({ state: {} }),
    }),
    { name: 'vedo-director' },
  ),
)
