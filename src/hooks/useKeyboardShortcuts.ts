import { useEffect } from 'react'
import { useHistoryStore } from '../lib/state'

interface ShortcutMap {
  [key: string]: () => void
}

export function useKeyboardShortcuts(projectId?: string | null, extraShortcuts?: ShortcutMap) {
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        if (projectId) redo(projectId)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (projectId) undo(projectId)
        return
      }

      if (e.key === 'Escape') {
        extraShortcuts?.['Escape']?.()
        return
      }

      extraShortcuts?.[e.key]?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, projectId, extraShortcuts])
}
