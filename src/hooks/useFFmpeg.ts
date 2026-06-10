import { useEffect, useCallback } from 'react'
import { loadFFmpeg, concatClips, readFileAsUint8Array, terminateWorker } from '../lib/ffmpeg'
import { useClipStore } from '../lib/state'
import { getProjectDirectory, getFileHandle, deleteFile } from '../lib/opfs'

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
      store.setConcatJob({ status: clips.length === 1 ? 'done' : 'idle', progress: 100 })
      return
    }

    const dir = await getProjectDirectory(projectId)
    if (!dir) {
      store.setConcatJob({ status: 'error', error: 'Project directory not found' })
      return
    }

    const clipData: { name: string; data: Uint8Array }[] = []
    for (const clip of clips) {
      const handle = await getFileHandle(dir, clip.fileName)
      if (!handle) continue
      const file = await handle.getFile()
      const data = await readFileAsUint8Array(file)
      clipData.push({ name: clip.fileName, data })
    }

    if (clipData.length < 2) {
      store.setConcatJob({ status: clipData.length === 1 ? 'done' : 'idle', progress: 100 })
      return
    }

    try {
      const result = await concatClips(clipData)
      await dir.getFileHandle('_concat_output.mp4', { create: true })
      const existing = await getFileHandle(dir, '_concat_output.mp4')
      if (existing) {
        await deleteFile(dir, '_concat_output.mp4')
      }
      const writable = await (await dir.getFileHandle('_concat_output.mp4', { create: true })).createWritable()
      await writable.write(result)
      await writable.close()
    } catch (err) {
      store.setConcatJob({ status: 'error', error: String(err) })
    }
  }, [])

  return { concatJob, runConcat }
}
