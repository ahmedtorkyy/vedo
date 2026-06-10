import { useEffect, useCallback } from 'react'
import { loadFFmpeg, concatClips, terminateWorker } from '../lib/ffmpeg'
import { useClipStore } from '../lib/state'
import { ProjectStorage } from '../lib/opfs'

export function useFFmpeg() {
  const concatJob = useClipStore((s) => s.concatJob)

  useEffect(() => {
    loadFFmpeg()
    return () => { terminateWorker() }
  }, [])

  const runConcat = useCallback(async (projectId: string) => {
    const store = useClipStore.getState()
    const clips = store.getSlotClips(projectId, 'A')
    if (clips.length < 2) {
      store.setConcatStatus(clips.length === 1 ? 'done' : 'idle')
      return
    }

    const clipData: { name: string; data: ArrayBuffer }[] = []
    try {
      for (const clip of clips) {
        const file = await ProjectStorage.getFile(projectId, clip.fileName)
        const buffer = await file.arrayBuffer()
        clipData.push({ name: clip.fileName, data: buffer })
      }
    } catch (err) {
      store.setConcatStatus('error')
      return
    }

    if (clipData.length < 2) {
      store.setConcatStatus(clipData.length === 1 ? 'done' : 'idle')
      return
    }

    try {
      const result = await concatClips(clipData)
      await ProjectStorage.saveFile(projectId, '_concat_output.mp4', new Blob([result]))
    } catch (err) {
      store.setConcatStatus('error')
    }
  }, [])

  return { concatJob, runConcat }
}
