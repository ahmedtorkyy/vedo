import { create } from 'zustand'
import type { UndoEntry } from '../../types'

const MAX_HISTORY = 50

interface ProjectHistory {
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
}

interface HistoryStore {
  historyByProject: Record<string, ProjectHistory>
  pushSnapshot: (projectId: string, state: unknown) => void
  undo: (projectId: string) => string | null
  redo: (projectId: string) => string | null
  removeProjectHistory: (projectId: string) => void
  clear: () => void
}

function getProjectHistory(state: HistoryStore['historyByProject'], projectId: string): ProjectHistory {
  return state[projectId] ?? { undoStack: [], redoStack: [] }
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  historyByProject: {},

  pushSnapshot: (projectId: string, state: unknown) => {
    const serialized = JSON.stringify(state)
    set((s) => {
      const hist = getProjectHistory(s.historyByProject, projectId)
      return {
        historyByProject: {
          ...s.historyByProject,
          [projectId]: {
            undoStack: [...hist.undoStack.slice(-(MAX_HISTORY - 1)), { timestamp: Date.now(), state: serialized }],
            redoStack: [],
          },
        },
      }
    })
  },

  undo: (projectId: string) => {
    const { historyByProject } = get()
    const hist = getProjectHistory(historyByProject, projectId)
    if (hist.undoStack.length === 0) return null
    const entry = hist.undoStack[hist.undoStack.length - 1]
    set({
      historyByProject: {
        ...historyByProject,
        [projectId]: {
          undoStack: hist.undoStack.slice(0, -1),
          redoStack: [...hist.redoStack, entry],
        },
      },
    })
    return entry.state
  },

  redo: (projectId: string) => {
    const { historyByProject } = get()
    const hist = getProjectHistory(historyByProject, projectId)
    if (hist.redoStack.length === 0) return null
    const entry = hist.redoStack[hist.redoStack.length - 1]
    set({
      historyByProject: {
        ...historyByProject,
        [projectId]: {
          undoStack: [...hist.undoStack, entry],
          redoStack: hist.redoStack.slice(0, -1),
        },
      },
    })
    return entry.state
  },

  removeProjectHistory: (projectId: string) => {
    set((s) => {
      const next = { ...s.historyByProject }
      delete next[projectId]
      return { historyByProject: next }
    })
  },

  clear: () => {
    set({ historyByProject: {} })
  },
}))
