import type { EditDecision } from '../director/types'
import { useDirectorStore } from '../director/director-store'
import { useClipStore } from '../state/clip-store'
import { useTranscriptionStore } from '../transcription/transcription-store'
import { smartCutVideo } from './concat'
import { buildCodecParams, buildScaleParams, buildDrawtextFilters, mapSegmentsThroughTrims } from '../export'
import type { ExportOptions, ExportScaleParams } from '../export'

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

  if (type === 'render-clip-progress') {
    progressCallback?.({ status: 'processing', progress: e.data.progress, message: e.data.message ?? 'Applying effects' })
    return
  }

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

  if (type === 'render-concat-progress') {
    progressCallback?.({ status: 'concatenating', progress: e.data.progress, message: e.data.message ?? 'Concatenating clips' })
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

function buildZoomFilters(zoomDecisions: EditDecision[]): string[] {
  const filters: string[] = []
  for (const zd of zoomDecisions) {
    const intensity = (zd.parameters.intensity as string) ?? 'medium'
    const factor = MAX_ZOOM[intensity] ?? 1.05
    const duration = Math.max(0.1, zd.endTime - zd.startTime)
    const rate = ((factor - 1) / duration).toFixed(6)
    const start = Math.max(0.1, zd.startTime)
    const end = zd.endTime

    filters.push(
      `scale=w='if(between(t,${start},${end}),min(iw*(1+(t-${start})*${rate}),iw*${factor}),iw)':h='if(between(t,${start},${end}),min(ih*(1+(t-${start})*${rate}),ih*${factor}),ih)':eval=frame`,
      `crop=w=iw:h=ih:x='(in_w-out_w)/2':y='(in_h-out_h)/2'`,
    )
  }
  return filters
}

export function buildFilterComplex(
  zoomDecisions: EditDecision[],
  overlayDecisions: EditDecision[],
  isMuted: boolean,
  captionDrawtextFilters?: string[],
  exportScale?: ExportScaleParams,
): { filterComplex: string | null; overlayClipNames: string[] } {
  const hasZoom = zoomDecisions.length > 0
  const hasOverlay = overlayDecisions.length > 0
  const hasCaptions = captionDrawtextFilters && captionDrawtextFilters.length > 0
  const hasScale = !!exportScale

  if (!hasZoom && !hasOverlay && !isMuted && !hasCaptions && !hasScale) return { filterComplex: null, overlayClipNames: [] }

  const seenClips = new Set<string>()
  const overlayClipNames: string[] = []
  for (const od of overlayDecisions) {
    if (od.overlayClipId && !seenClips.has(od.overlayClipId)) {
      seenClips.add(od.overlayClipId)
      overlayClipNames.push(od.overlayClipId)
    }
  }

  const mainVideoFilters: string[] = []

  if (hasZoom) {
    mainVideoFilters.push(...buildZoomFilters(zoomDecisions))
  }

  mainVideoFilters.push('fps=30', 'scale=trunc(iw/2)*2:trunc(ih/2)*2')

  if (hasScale) {
    mainVideoFilters.push(exportScale.scaleFilter)
    if (exportScale.cropFilter) mainVideoFilters.push(exportScale.cropFilter)
    if (exportScale.padFilter) mainVideoFilters.push(exportScale.padFilter)
  }

  if (hasCaptions) {
    mainVideoFilters.push(...captionDrawtextFilters!)
  }

  if (hasOverlay) {
    let fc = `[0:v]${mainVideoFilters.join(',')}[vbase];`

    const overlayGroups: Map<number, { clipIdx: number; ods: EditDecision[] }> = new Map()
    let clipIdx = 1
    const seen = new Map<string, number>()
    for (const od of overlayDecisions) {
      const cid = od.overlayClipId ?? ''
      if (!seen.has(cid)) seen.set(cid, clipIdx++)
      const ci = seen.get(cid)!
      if (!overlayGroups.has(ci)) overlayGroups.set(ci, { clipIdx: ci, ods: [] })
      overlayGroups.get(ci)!.ods.push(od)
    }

    let labelIdx = 0
    const overlayOps: { od: EditDecision; label: string }[] = []

    for (const [, group] of overlayGroups) {
      const { clipIdx: ci, ods } = group
      const useSplit = ods.length > 1

      if (useSplit) {
        fc += `[${ci}:v]split=${ods.length}${ods.map((_, si) => `[s${labelIdx + si}]`).join('')};`
        for (let si = 0; si < ods.length; si++) {
          const od = ods[si]
          const scaleFactor = (od.parameters.scale as number) ?? 0.3
          const opacity = (od.parameters.opacity as number) ?? 1
          const lbl = `o${labelIdx}`
          overlayOps.push({ od, label: lbl })

          const ofilters: string[] = [
            `scale=w=iw*${scaleFactor}:h=ih*${scaleFactor}`,
          ]
          if (opacity < 1) {
            ofilters.push(`format=rgba,colorchannelmixer=aa=${opacity}`)
          }
          fc += `[s${labelIdx++}]${ofilters.join(',')}[${lbl}];`
        }
      } else {
        const od = ods[0]
        const scaleFactor = (od.parameters.scale as number) ?? 0.3
        const opacity = (od.parameters.opacity as number) ?? 1
        const lbl = `o${labelIdx++}`
        overlayOps.push({ od, label: lbl })

        const ofilters: string[] = [
          `scale=w=iw*${scaleFactor}:h=ih*${scaleFactor}`,
        ]
        if (opacity < 1) {
          ofilters.push(`format=rgba,colorchannelmixer=aa=${opacity}`)
        }

        fc += `[${ci}:v]${ofilters.join(',')}[${lbl}];`
      }
    }

    let prevLabel = 'vbase'
    for (let i = 0; i < overlayOps.length; i++) {
      const nextLabel = i < overlayOps.length - 1 ? `vtmp${i}` : 'v'
      const od = overlayOps[i].od
      const x = overlayPosition(od.parameters.placement as string ?? 'center',
        od.parameters.scale as number ?? 0.3)
      const y = overlayPositionY(od.parameters.placement as string ?? 'center',
        od.parameters.scale as number ?? 0.3)
      fc += `[${prevLabel}][${overlayOps[i].label}]overlay=x=${x}:y=${y}:enable='between(t,${od.startTime},${od.endTime})'[${nextLabel}];`
      prevLabel = nextLabel
    }

    if (isMuted) {
      fc += `[0:a]volume=0[a]`
    } else {
      fc += `[0:a]anull[a]`
    }

    return { filterComplex: fc, overlayClipNames }
  }

  const audioFilter = isMuted ? 'volume=0' : 'anull'
  return { filterComplex: `[0:v]${mainVideoFilters.join(',')}[v];[0:a]${audioFilter}[a]`, overlayClipNames }
}

function overlayPosition(placement: string, _scale: number): string {
  switch (placement) {
    case 'center': return '(W-w)/2'
    case 'left': return '0'
    case 'right': return 'W-w'
    case 'pip': return 'W-w-10'
    case 'fullscreen': return '0'
    default: return '(W-w)/2'
  }
}

function overlayPositionY(placement: string, _scale: number): string {
  switch (placement) {
    case 'center': return '(H-h)/2'
    case 'left': return '(H-h)/2'
    case 'right': return '(H-h)/2'
    case 'pip': return 'H-h-10'
    case 'fullscreen': return '0'
    default: return '(H-h)/2'
  }
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

async function deleteOpfsFile(projectId: string, filename: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    const folder = await root.getDirectoryHandle(`project_${projectId}`)
    await folder.removeEntry(filename)
  } catch {
    // file may not exist
  }
}

export async function exportVideo(projectId: string, options: ExportOptions): Promise<string> {
  const directorState = useDirectorStore.getState().state[projectId]
  if (!directorState?.plan) throw new Error('No edit plan available.')

  const plan = directorState.plan
  const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
  const clipsB = useClipStore.getState().getSlotClips(projectId, 'B')
  if (clipsA.length === 0) throw new Error('No clips to render.')

  const codec = buildCodecParams(options)
  const exportScale = buildScaleParams(options, 1920, 1080)

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
      sendProgress('processing', ((i + 0.1) / clipsA.length) * 60, `Trimming silence in clip ${i + 1}`)
      const trimSegments = trimDecisions.map((d) => ({ start: d.startTime, end: d.endTime }))
      currentName = await smartCutVideo(projectId, currentName, trimSegments, clip.duration)
      tempFiles.push(currentName)
    }

    const needsRender = zoomDecisions.length > 0 || overlayDecisions.length > 0 || clip.muted || options.burnCaptions || options.quality !== '1080p' || options.platform !== 'none'

    if (needsRender) {
      let captionFilters: string[] | undefined
      if (options.burnCaptions) {
        const transcriptResult = useTranscriptionStore.getState().results[clip.id]
        if (transcriptResult?.status === 'done' && transcriptResult.segments.length > 0) {
          const trimSegments = trimDecisions.map((d) => ({ start: d.startTime, end: d.endTime }))
          const mappedSegments = mapSegmentsThroughTrims(
            transcriptResult.segments,
            0,
            trimSegments,
            clip.duration,
          )
          if (mappedSegments.length > 0) {
            captionFilters = buildDrawtextFilters(mappedSegments, exportScale.width, exportScale.height)
          }
        }
      }

      sendProgress('processing', ((i + 0.5) / clipsA.length) * 60, `Applying effects to clip ${i + 1}`)
      const { filterComplex, overlayClipNames } = buildFilterComplex(
        zoomDecisions, overlayDecisions, clip.muted,
        captionFilters, exportScale,
      )

      if (filterComplex) {
        const outName = `_rendered_${clip.id}_${Date.now()}.${codec.extension}`

        const overlayInputNames = overlayClipNames
          .map((cid) => clipsB.find((b) => b.id === cid)?.opfsFilename)
          .filter((n): n is string => !!n)

        getWorker().postMessage({
          type: 'render-clip',
          payload: {
            projectId,
            inputName: currentName,
            outputName: outName,
            filterComplex,
            overlayInputNames,
            codec,
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

    const outName = `_final_${Date.now()}.${codec.extension}`
    const clips = processedNames.map((name) => ({ name, duration: 0 }))

    getWorker().postMessage({
      type: 'render-concat',
      payload: {
        projectId,
        clips,
        outputName: outName,
        codec,
      },
    })

    finalName = await new Promise<string>((resolve, reject) => {
      pendingConcat = { resolve, reject }
    })
  } else {
    if (processedNames[0].endsWith(codec.extension)) {
      finalName = processedNames[0]
    } else {
      // Re-wrap single clip into target format if needed
      const outName = `_final_${Date.now()}.${codec.extension}`
      getWorker().postMessage({
        type: 'render-concat',
        payload: {
          projectId,
          clips: [{ name: processedNames[0], duration: 0 }],
          outputName: outName,
          codec,
        },
      })
      finalName = await new Promise<string>((resolve, reject) => {
        pendingConcat = { resolve, reject }
      })
    }
  }

  cleanupRenderFiles(projectId, tempFiles.filter((f) => f !== finalName))

  sendProgress('done', 100, 'Export complete', finalName)
  return finalName
}

export async function downloadFromOpfs(filename: string, projectId: string, downloadName: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(`project_${projectId}`)
  const handle = await folder.getFileHandle(filename)
  const file = await handle.getFile()
  const url = URL.createObjectURL(file)
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
