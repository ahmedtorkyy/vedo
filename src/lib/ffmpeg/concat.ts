import { useClipStore } from '../state/clip-store'
import type { Clip, AudioCleansingOptions } from '../../types'

let worker: Worker | null = null
let isRunning = false

type PendingOp = {
  resolve: (outputFilename: string) => void
  reject: (err: Error) => void
}

let pendingConcat: PendingOp | null = null
let pendingAudio: PendingOp | null = null
let pendingSmartCut: PendingOp | null = null

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
  pendingAudio?.reject(new Error(err.message ?? 'Unknown worker error'))
  pendingAudio = null
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

  if (type === 'audio-extracted' || type === 'audio-cleaned') {
    pendingAudio?.resolve(e.data.outputName)
    pendingAudio = null
    return
  }

  if (type === 'extract-error' || type === 'clean-error') {
    pendingAudio?.reject(new Error(e.data.error ?? 'Audio operation failed'))
    pendingAudio = null
    return
  }

  if (type === 'smartcut-done') {
    pendingSmartCut?.resolve(e.data.outputFilename)
    pendingSmartCut = null
    return
  }

  if (type === 'smartcut-error') {
    pendingSmartCut?.reject(new Error(e.data.error ?? 'Smart cut failed'))
    pendingSmartCut = null
    return
  }
}

export async function extractAudio(projectId: string, inputName: string): Promise<string> {
  const outputName = `_audio_${Date.now()}.wav`
  getWorker().postMessage({
    type: 'extract-audio',
    payload: { projectId, inputName, outputName },
  })
  return new Promise<string>((resolve, reject) => {
    pendingAudio = { resolve, reject }
  })
}

export async function cleanAudio(
  projectId: string,
  inputName: string,
  options: AudioCleansingOptions,
): Promise<string> {
  const outputName = `_cleaned_${Date.now()}.wav`
  getWorker().postMessage({
    type: 'clean-audio',
    payload: { projectId, inputName, outputName, options },
  })
  return new Promise<string>((resolve, reject) => {
    pendingAudio = { resolve, reject }
  })
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

export async function smartCutVideo(
  projectId: string,
  inputName: string,
  segments: { start: number; end: number }[],
  totalDuration: number,
): Promise<string> {
  const outputName = `_smartcut_${Date.now()}.mp4`
  getWorker().postMessage({
    type: 'smart-cut',
    payload: { projectId, inputName, outputName, segments, totalDuration },
  })
  return new Promise<string>((resolve, reject) => {
    pendingSmartCut = { resolve, reject }
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
