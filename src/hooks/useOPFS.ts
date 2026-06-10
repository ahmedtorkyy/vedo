import { useCallback } from 'react'
import { ProjectStorage } from '../lib/opfs'

export function useOPFS() {
  const getDir = useCallback(async (projectId: string) => {
    return ProjectStorage.getProjectFolder(projectId)
  }, [])

  const deleteDir = useCallback(async (projectId: string) => {
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry(`project_${projectId}`, { recursive: true })
    } catch {
      // no-op
    }
  }, [])

  return { getDir, deleteDir }
}
