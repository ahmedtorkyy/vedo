import { useClipStore } from '../state/clip-store'

let worker: Worker | null = null
let isRunning = false

type ResolveReject = {
  resolve: (data: Uint8Array) => void
  reject: (err: Error) => void
}

let pendingConcat: ResolveReject | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = handleWorkerMessage
    worker.onerror = handleWorkerError
  }
  return worker
}

function handleWorkerError(err: ErrorEvent): void {
  useClipStore.getState().setConcatStatus('error')
  pendingConcat?.reject(new Error(err.message ?? 'Unknown worker error'))
  pendingConcat = null
  isRunning = false
}

function handleWorkerMessage(e: MessageEvent) {
  const { type } = e.data

  if (type === 'ffmpeg-loaded') {
    useClipStore.getState().setConcatStatus('idle')
    return
  }

  if (type === 'concat-progress') {
    useClipStore.getState().setConcatStatus('concatenating')
    return
  }

  if (type === 'concat-done') {
    const { data } = e.data
    useClipStore.getState().setConcatStatus('done')
    pendingConcat?.resolve(new Uint8Array(data))
    pendingConcat = null
    isRunning = false
    return
  }

  if (type === 'concat-error') {
    useClipStore.getState().setConcatStatus('error')
    pendingConcat?.reject(new Error(e.data.error ?? 'Concat failed'))
    pendingConcat = null
    isRunning = false
    return
  }

  if (type === 'load-error') {
    useClipStore.getState().setConcatStatus('error')
    isRunning = false
    return
  }
}

export async function loadFFmpeg(): Promise<void> {
  useClipStore.getState().setConcatStatus('loading-ffmpeg')
  getWorker().postMessage({ type: 'load' })
}

export async function concatClips(
  clips: { name: string; data: ArrayBuffer }[]
): Promise<Uint8Array> {
  if (isRunning) {
    throw new Error('A concat operation is already in progress')
  }
  isRunning = true

  useClipStore.getState().setConcatStatus('concatenating')

  return new Promise<Uint8Array>((resolve, reject) => {
    pendingConcat = { resolve, reject }
    const transferables = clips.map((c) => c.data)
    getWorker().postMessage({ type: 'concat', payload: { clips } }, transferables)
  })
}

export function purgeWorkerMemfs(): void {
  getWorker().postMessage({ type: 'purge-memfs' })
}

export function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    isRunning = false
  }
}
