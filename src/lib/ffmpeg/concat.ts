import type { Clip, ConcatJob } from '../../types'
import { useClipStore } from '../state/clip-store'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = handleWorkerMessage
  }
  return worker
}

type ResolveReject = {
  resolve: (data: Uint8Array) => void
  reject: (err: Error) => void
}

let pendingConcat: ResolveReject | null = null

function handleWorkerMessage(e: MessageEvent) {
  const { type, progress, data, error } = e.data

  if (type === 'ffmpeg-loaded') {
    useClipStore.getState().setConcatJob({ status: 'idle', progress: 0 })
    return
  }

  if (type === 'concat-progress') {
    useClipStore.getState().setConcatJob({
      status: 'concatenating',
      progress: Math.round(progress * 100),
    })
    return
  }

  if (type === 'concat-done') {
    useClipStore.getState().setConcatJob({ status: 'done', progress: 100 })
    pendingConcat?.resolve(new Uint8Array(data))
    pendingConcat = null
    return
  }

  if (type === 'concat-error') {
    useClipStore.getState().setConcatJob({ status: 'error', error })
    pendingConcat?.reject(new Error(error))
    pendingConcat = null
    return
  }

  if (type === 'load-error') {
    useClipStore.getState().setConcatJob({ status: 'error', error })
    return
  }
}

export async function loadFFmpeg(): Promise<void> {
  const store = useClipStore.getState()
  store.setConcatJob({ status: 'loading-ffmpeg', progress: 0 })
  getWorker().postMessage({ type: 'load' })
}

export async function concatClips(
  clips: { name: string; data: Uint8Array }[]
): Promise<Uint8Array> {
  const store = useClipStore.getState()
  store.setConcatJob({ status: 'concatenating', progress: 0 })

  return new Promise<Uint8Array>((resolve, reject) => {
    pendingConcat = { resolve, reject }
    getWorker().postMessage({ type: 'concat', payload: { clips } })
  })
}

export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

export function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
