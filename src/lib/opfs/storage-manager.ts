import type { StorageStats } from '../../types'
import { listAllProjects, deleteProjectDirectory } from './project-storage'

export async function getStorageStats(): Promise<StorageStats> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0 }
  }
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function getUsagePercent(stats: StorageStats): number {
  if (stats.quota === 0) return 0
  return Math.round((stats.usage / stats.quota) * 100)
}

export async function evictInactiveProjects(activeProjectIds: Set<string>): Promise<number> {
  const allIds = await listAllProjects()
  let evicted = 0
  for (const id of allIds) {
    if (!activeProjectIds.has(id)) {
      await deleteProjectDirectory(id)
      evicted++
    }
  }
  return evicted
}
