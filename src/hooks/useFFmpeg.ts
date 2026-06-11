import { useCallback } from 'react'
import { loadFFmpeg, concatClips } from '../lib/ffmpeg'
import { useClipStore } from '../lib/state'

export function useFFmpeg() {
  const concatJob = useClipStore((s) => s.concatJob)

  const runConcat = useCallback(async (projectId: string) => {
    const store = useClipStore.getState()
    const clips = store.getSlotClips(projectId, 'A')
    if (clips.length < 2) {
      store.setConcatStatus(clips.length === 1 ? 'done' : 'idle')
      return
    }

    try {
      await loadFFmpeg()
      await concatClips(projectId, clips)
      store.setConcatStatus('done')
    } catch {
      store.setConcatStatus('error')
    }
  }, [])

  return { concatJob, runConcat }
}
