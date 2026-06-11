import { useClipStore } from './clip-store'
import type { Clip } from '../../types'

const PROBE_TIMEOUT_MS = 5000

/**
 * Clips whose metadata could not be read at upload time (e.g. the upload
 * happened in a hidden tab where Chrome defers media loading, so the
 * 5s timeout fell back to duration 0). Zero-duration clips silently
 * disable all planner decisions, so they must be re-measured.
 */
export function clipsNeedingBackfill(clips: Clip[]): Clip[] {
  return clips.filter(
    (c) => !c.duration || c.duration <= 0 || !c.videoWidth || !c.videoHeight,
  )
}

async function probeOpfsClip(
  projectId: string,
  opfsFilename: string,
): Promise<{ duration: number; width: number; height: number } | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(`project_${projectId}`)
    const fh = await dir.getFileHandle(opfsFilename)
    const file = await fh.getFile()

    return await new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      const url = URL.createObjectURL(file)
      const cleanup = () => {
        URL.revokeObjectURL(url)
        video.remove()
      }
      const timer = setTimeout(() => {
        cleanup()
        resolve(null)
      }, PROBE_TIMEOUT_MS)
      video.onloadedmetadata = () => {
        clearTimeout(timer)
        const result = {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        }
        cleanup()
        resolve(result)
      }
      video.onerror = () => {
        clearTimeout(timer)
        cleanup()
        resolve(null)
      }
      video.src = url
    })
  } catch {
    return null
  }
}

/**
 * Re-measure metadata for any clips that are missing it.
 * Returns the number of clips that were updated.
 */
export async function backfillClipMetadata(projectId: string): Promise<number> {
  const store = useClipStore.getState()
  let updated = 0

  for (const slot of ['A', 'B'] as const) {
    const candidates = clipsNeedingBackfill(store.getSlotClips(projectId, slot))
    for (const clip of candidates) {
      const probed = await probeOpfsClip(projectId, clip.opfsFilename)
      if (probed && probed.duration > 0) {
        useClipStore.getState().updateClip(projectId, slot, clip.id, {
          duration: probed.duration,
          videoWidth: probed.width || undefined,
          videoHeight: probed.height || undefined,
        })
        updated++
      }
    }
  }

  return updated
}
