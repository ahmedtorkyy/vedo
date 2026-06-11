import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TimelineEdit {
  entryId: string
  start: number
  end: number
}

interface TimelineStore {
  edits: Record<string, Record<string, TimelineEdit>>
  setEdit: (projectId: string, entryId: string, start: number, end: number) => void
  removeEdit: (projectId: string, entryId: string) => void
  clearProjectEdits: (projectId: string) => void
  hasDirty: (projectId: string) => boolean
}

export const useTimelineStore = create<TimelineStore>()(
  persist(
    (set, get) => ({
      edits: {},

      setEdit: (projectId, entryId, start, end) =>
        set((s) => ({
          edits: {
            ...s.edits,
            [projectId]: {
              ...(s.edits[projectId] ?? {}),
              [entryId]: { entryId, start, end },
            },
          },
        })),

      removeEdit: (projectId, entryId) =>
        set((s) => {
          const projectEdits = s.edits[projectId]
          if (!projectEdits) return {}
          const next = { ...projectEdits }
          delete next[entryId]
          return { edits: { ...s.edits, [projectId]: next } }
        }),

      clearProjectEdits: (projectId) =>
        set((s) => {
          const next = { ...s.edits }
          delete next[projectId]
          return { edits: next }
        }),

      hasDirty: (projectId) => {
        const projectEdits = get().edits[projectId]
        return projectEdits ? Object.keys(projectEdits).length > 0 : false
      },
    }),
    { name: 'vedo-timeline' },
  ),
)