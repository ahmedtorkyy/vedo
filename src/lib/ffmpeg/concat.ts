import { useClipStore } from '../state/clip-store'
import type { Clip } from '../../types'

let worker: Worker | null = null
let isRunning = false

type ResolveReject = {
  resolve: (outputFilename: string) => void
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
    useClipStore.getState().setConcatStatus('done')
    pendingConcat?.resolve(e.data.outputFilename ?? '_concat_output.mp4')
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
  projectId: string,
  clips: Pick<Clip, 'opfsFilename'>[],
): Promise<string> {
  if (isRunning) {
    throw new Error('A concat operation is already in progress')
  }
  isRunning = true

  useClipStore.getState().setConcatStatus('concatenating')

  return new Promise<string>((resolve, reject) => {
    pendingConcat = { resolve, reject }
    getWorker().postMessage({
      type: 'concat',
      payload: {
        projectId,
        clips: clips.map((c) => ({ name: c.opfsFilename })),
      },
    })
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
