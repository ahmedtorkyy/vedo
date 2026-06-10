import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DirectorState, StyleKey, EditPlan } from './types'

interface DirectorStore {
  state: Record<string, DirectorState>
  setInstructions: (projectId: string, instructions: string) => void
  setStyle: (projectId: string, style: StyleKey) => void
  setStatus: (projectId: string, status: DirectorState['status']) => void
  setPlan: (projectId: string, plan: EditPlan) => void
  setError: (projectId: string, error: string) => void
  clearProject: (projectId: string) => void
  clearAll: () => void
}

function emptyState(projectId: string): DirectorState {
  return {
    status: 'idle',
    instructions: '',
    selectedStyle: 'professional',
    plan: null,
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

      setError: (projectId, error) =>
        set((s) => ({
          state: {
            ...s.state,
            [projectId]: { ...(s.state[projectId] ?? emptyState(projectId)), status: 'error', error },
          },
        })),

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
