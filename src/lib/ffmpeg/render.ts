import type { EditDecision } from '../director/types'
import { useDirectorStore } from '../director/director-store'
import { useClipStore } from '../state/clip-store'
import { smartCutVideo } from './concat'

let worker: Worker | null = null
let pendingRender: { resolve: (name: string) => void; reject: (err: Error) => void } | null = null
let pendingConcat: { resolve: (name: string) => void; reject: (err: Error) => void } | null = null

export type RenderStatus = 'idle' | 'preparing' | 'processing' | 'concatenating' | 'done' | 'error'
export interface RenderProgress {
  status: RenderStatus
  progress: number
  message: string
  outputFilename?: string
  error?: string
}

let progressCallback: ((p: RenderProgress) => void) | null = null

export function onRenderProgress(cb: (p: RenderProgress) => void): void {
  progressCallback = cb
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = handleWorkerMessage
    worker.onerror = () => {
      pendingRender?.reject(new Error('Render worker error'))
      pendingRender = null
      pendingConcat?.reject(new Error('Render worker error'))
      pendingConcat = null
    }
  }
  return worker
}

function handleWorkerMessage(e: MessageEvent): void {
  const { type } = e.data

  if (type === 'render-clip-done') {
    pendingRender?.resolve(e.data.outputFilename)
    pendingRender = null
    return
  }

  if (type === 'render-clip-error') {
    pendingRender?.reject(new Error(e.data.error ?? 'Clip render failed'))
    pendingRender = null
    return
  }

  if (type === 'render-concat-done') {
    pendingConcat?.resolve(e.data.outputFilename)
    pendingConcat = null
    return
  }

  if (type === 'render-concat-error') {
    pendingConcat?.reject(new Error(e.data.error ?? 'Concat failed'))
    pendingConcat = null
    return
  }
}

function sendProgress(status: RenderStatus, progress: number, message: string, outputFilename?: string): void {
  progressCallback?.({ status, progress, message, outputFilename })
}

const MAX_ZOOM: Record<string, number> = { soft: 1.02, medium: 1.05, dynamic: 1.1, aggressive: 1.2 }

function buildFilterComplex(
  zoomDecisions: EditDecision[],
  overlayDecisions: EditDecision[],
): { filterComplex: string | null; needsOverlayInput: boolean } {
  const hasZoom = zoomDecisions.length > 0
  const hasOverlay = overlayDecisions.length > 0

  if (!hasZoom && !hasOverlay) return { filterComplex: null, needsOverlayInput: false }

  const videoFilters: string[] = []

  if (hasZoom) {
    for (const zd of zoomDecisions) {
      const intensity = (zd.parameters.intensity as string) ?? 'medium'
      const factor = MAX_ZOOM[intensity] ?? 1.05
      const len = Math.max(1, Math.round((zd.endTime - zd.startTime) * 30))
      const rate = (factor - 1) / len
      const enable = `between(t,${zd.startTime},${zd.endTime})`
      videoFilters.push(
        `zoompan=z='if(eq(0,0),1,min(zoom+${rate.toFixed(6)},${factor}))':d=${len}:s=1920x1080:fps=30:y='ih/2-(ih/zoom/2)':x='iw/2-(iw/zoom/2)':enable='${enable}'`,
      )
    }
  }

  videoFilters.push('fps=30')

  if (hasOverlay) {
    let fc = `[0:v]${videoFilters.join(',')}[v0];`

    const overlayParts: string[] = []
    for (const od of overlayDecisions) {
      const placement = (od.parameters.placement as string) ?? 'center'
      const scaleFactor = (od.parameters.scale as number) ?? 0.3
      const opacity = (od.parameters.opacity as number) ?? 1

      overlayParts.push(`scale=w=iw*${scaleFactor}:h=ih*${scaleFactor}`)
      if (opacity < 1) {
        overlayParts.push(`format=rgba,colorchannelmixer=aa=${opacity}`)
      }

      let x: string
      let y: string
      switch (placement) {
        case 'center':
          x = '(W-w)/2'
          y = '(H-h)/2'
          break
        case 'left':
          x = '0'
          y = '(H-h)/2'
          break
        case 'right':
          x = 'W-w'
          y = '(H-h)/2'
          break
        case 'pip':
          x = 'W-w-10'
          y = 'H-h-10'
          break
        case 'fullscreen':
          x = '0'
          y = '0'
          break
        default:
          x = '(W-w)/2'
          y = '(H-h)/2'
      }

      overlayParts.push(`overlay=x=${x}:y=${y}:enable='between(t,${od.startTime},${od.endTime})'`)
    }

    fc += `[1:v]${overlayParts.join(',')}[v1];[v0][v1]overlay=format=auto[v];[0:a]anull[a]`
    return { filterComplex: fc, needsOverlayInput: true }
  }

  return { filterComplex: `[0:v]${videoFilters.join(',')}[v];[0:a]anull[a]`, needsOverlayInput: false }
}

function groupDecisionsByClip(decisions: EditDecision[]): Record<string, EditDecision[]> {
  const grouped: Record<string, EditDecision[]> = {}
  for (const d of decisions) {
    if (d.type === 'keep') continue
    if (!grouped[d.clipId]) grouped[d.clipId] = []
    grouped[d.clipId].push(d)
  }
  return grouped
}

async function readOpfsFile(projectId: string, filename: string): Promise<Uint8Array> {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(`project_${projectId}`)
  const handle = await folder.getFileHandle(filename)
  const file = await handle.getFile()
  const reader = file.stream().getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const copy = new Uint8Array(value.byteLength)
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    chunks.push(copy)
    total += value.byteLength
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function deleteOpfsFile(projectId: string, filename: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle(`project_${projectId}`)
    await folder.removeEntry(filename)
  } catch {
    // file may not exist
  }
}

export async function exportVideo(projectId: string): Promise<string> {
  const directorState = useDirectorStore.getState().state[projectId]
  if (!directorState?.plan) throw new Error('No edit plan available.')

  const plan = directorState.plan
  const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
  const clipsB = useClipStore.getState().getSlotClips(projectId, 'B')
  if (clipsA.length === 0) throw new Error('No clips to render.')

  sendProgress('preparing', 0, 'Preparing render pipeline')

  const grouped = groupDecisionsByClip(plan.decisions)
  const processedNames: string[] = []
  const tempFiles: string[] = []

  for (let i = 0; i < clipsA.length; i++) {
    const clip = clipsA[i]
    const decisions = grouped[clip.id] ?? []
    const zoomDecisions = decisions.filter((d) => d.type === 'zoom')
    const trimDecisions = decisions.filter((d) => d.type === 'trim')
    const overlayDecisions = decisions.filter((d) => d.type === 'overlay')

    let currentName = clip.opfsFilename

    if (trimDecisions.length > 0) {
      sendProgress('processing', ((i + 0.15) / clipsA.length) * 60, `Trimming silence in clip ${i + 1}`)
      const trimSegments = trimDecisions.map((d) => ({ start: d.startTime, end: d.endTime }))
      currentName = await smartCutVideo(projectId, currentName, trimSegments, clip.duration)
      tempFiles.push(currentName)
    }

    if (zoomDecisions.length > 0 || overlayDecisions.length > 0) {
      sendProgress('processing', ((i + 0.55) / clipsA.length) * 60, `Applying effects to clip ${i + 1}`)
      const { filterComplex, needsOverlayInput } = buildFilterComplex(zoomDecisions, overlayDecisions)

      if (filterComplex) {
        const outName = `_rendered_${clip.id}_${Date.now()}.mp4`

        const overlayClip = needsOverlayInput && overlayDecisions[0]?.overlayClipId
          ? clipsB.find((b) => b.id === overlayDecisions[0].overlayClipId)
          : undefined

        getWorker().postMessage({
          type: 'render-clip',
          payload: {
            projectId,
            inputName: currentName,
            outputName: outName,
            filterComplex,
            overlayInputName: overlayClip?.opfsFilename,
          },
        })

        currentName = await new Promise<string>((resolve, reject) => {
          pendingRender = { resolve, reject }
        })
        tempFiles.push(currentName)
      }
    }

    processedNames.push(currentName)
  }

  let finalName: string

  if (processedNames.length > 1) {
    sendProgress('concatenating', 85, 'Concatenating clips')

    const outName = `_final_${Date.now()}.mp4`
    const clips = processedNames.map((name) => ({ name }))

    getWorker().postMessage({
      type: 'render-concat',
      payload: { projectId, clips, outputName: outName },
    })

    finalName = await new Promise<string>((resolve, reject) => {
      pendingConcat = { resolve, reject }
    })
    tempFiles.push(finalName)
  } else {
    finalName = processedNames[0]
  }

  cleanupRenderFiles(projectId, tempFiles.filter((f) => f !== finalName))

  sendProgress('done', 100, 'Export complete', finalName)
  return finalName
}

export async function downloadFromOpfs(filename: string, projectId: string, downloadName: string): Promise<void> {
  const data = await readOpfsFile(projectId, filename)
  const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  a.click()
  URL.revokeObjectURL(url)
}

export async function cleanupRenderFiles(projectId: string, filenames: string[]): Promise<void> {
  for (const f of filenames) {
    await deleteOpfsFile(projectId, f)
  }
}

export function terminateRenderWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
