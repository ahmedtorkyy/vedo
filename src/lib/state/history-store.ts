import { create } from 'zustand'
import type { UndoEntry } from '../../types'

const MAX_HISTORY = 50

interface HistoryStore {
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  pushSnapshot: (state: unknown) => void
  undo: () => string | null
  redo: () => string | null
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: (state: unknown) => {
    const serialized = JSON.stringify(state)
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_HISTORY - 1)), { timestamp: Date.now(), state: serialized }],
      redoStack: [],
    }))
  },

  undo: () => {
    const { undoStack, redoStack } = get()
    if (undoStack.length === 0) return null
    const entry = undoStack[undoStack.length - 1]
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    })
    return entry.state
  },

  redo: () => {
    const { undoStack, redoStack } = get()
    if (redoStack.length === 0) return null
    const entry = redoStack[redoStack.length - 1]
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, entry],
    })
    return entry.state
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] })
  },
}))
