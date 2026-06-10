import { useCallback } from 'react'
import { createProjectDirectory, getProjectDirectory, deleteProjectDirectory } from '../lib/opfs'

export function useOPFS() {
  const ensureProjectDir = useCallback(async (projectId: string) => {
    return createProjectDirectory(projectId)
  }, [])

  const getDir = useCallback(async (projectId: string) => {
    return getProjectDirectory(projectId)
  }, [])

  const deleteDir = useCallback(async (projectId: string) => {
    await deleteProjectDirectory(projectId)
  }, [])

  return { ensureProjectDir, getDir, deleteDir }
}
