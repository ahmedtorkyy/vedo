import { useProjectStore } from '../state'

const RECOVERY_KEY = 'vedo-session'

interface SessionSnapshot {
  projectId: string | null
  timestamp: number
}

export function saveSessionSnapshot(): void {
  const { currentProjectId } = useProjectStore.getState()
  const snapshot: SessionSnapshot = {
    projectId: currentProjectId,
    timestamp: Date.now(),
  }
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot))
  } catch {
    // sessionStorage full — silently ignore
  }
}

export function restoreSession(): boolean {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY)
    if (!raw) return false
    const snapshot: SessionSnapshot = JSON.parse(raw)
    if (!snapshot.projectId) return false

    const projectExists = useProjectStore.getState().projects.some(
      (p) => p.id === snapshot.projectId
    )
    if (!projectExists) return false

    useProjectStore.getState().setCurrentProject(snapshot.projectId)
    return true
  } catch {
    return false
  }
}
