import { useClipStore } from '../state/clip-store'

let worker: Worker | null = null
let isRunning = false

const KNOWN_WORKER_ERRORS = new Set([
  'SharedArrayBuffer is not defined',
  'Cannot use SharedArrayBuffer',
  'wasm streaming compile failed',
])

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
  const msg = err.message ?? 'Unknown worker error'
  useClipStore.getState().setConcatJob({ status: 'error', error: msg })
  pendingConcat?.reject(new Error(msg))
  pendingConcat = null
  isRunning = false
}

function handleWorkerMessage(e: MessageEvent) {
  const { type, progress, data, error, detail } = e.data

  if (type === 'ffmpeg-loaded') {
    useClipStore.getState().setConcatJob({ status: 'idle', progress: 0 })
    return
  }

  if (type === 'memfs-warning') {
    useClipStore.getState().setConcatJob({ status: 'concatenating', progress: 0 })
    return
  }

  if (type === 'oom-error') {
    useClipStore.getState().setConcatJob({ status: 'error', error: 'FFmpeg ran out of memory. Try with smaller files.' })
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
    isRunning = false
    return
  }

  if (type === 'concat-error') {
    useClipStore.getState().setConcatJob({ status: 'error', error })
    pendingConcat?.reject(new Error(error))
    pendingConcat = null
    isRunning = false
    return
  }

  if (type === 'load-error') {
    const friendly = KNOWN_WORKER_ERRORS.has(error ?? '')
      ? 'Cross-origin isolation not enabled. The app needs COOP/COEP headers for the processing engine.'
      : error
    useClipStore.getState().setConcatJob({ status: 'error', error: friendly })
    isRunning = false
    return
  }
}

export async function loadFFmpeg(): Promise<void> {
  useClipStore.getState().setConcatJob({ status: 'loading-ffmpeg', progress: 0 })
  getWorker().postMessage({ type: 'load' })
}

export async function concatClips(
  clips: { name: string; data: ArrayBuffer }[]
): Promise<Uint8Array> {
  if (isRunning) {
    throw new Error('A concat operation is already in progress')
  }
  isRunning = true

  useClipStore.getState().setConcatJob({ status: 'concatenating', progress: 0 })

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
