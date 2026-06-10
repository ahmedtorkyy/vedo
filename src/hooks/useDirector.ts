import { useCallback } from 'react'
import { useClipStore } from '../lib/state'
import { useTranscriptionStore } from '../lib/transcription'
import { useEditingStore } from '../lib/editing'
import { useDirectorStore, analyzeContent, detectHooks, analyzeRetention, createEditPlan } from '../lib/director'
import type { StyleKey, PlannerInput } from '../lib/director'

export function useDirector(projectId: string) {
  const directorStore = useDirectorStore()
  const projectState = directorStore.state[projectId]
  const instructions = projectState?.instructions ?? ''
  const selectedStyle = projectState?.selectedStyle ?? 'professional'
  const status = projectState?.status ?? 'idle'
  const plan = projectState?.plan ?? null
  const error = projectState?.error

  const generatePlan = useCallback(async () => {
    directorStore.setStatus(projectId, 'analyzing')

    try {
      const clipStore = useClipStore.getState()
      const clipsA = clipStore.getSlotClips(projectId, 'A')
      const clipsB = clipStore.getSlotClips(projectId, 'B')

      const allClips = [
        ...clipsA.map((c) => ({ ...c, slot: 'A' as const })),
        ...clipsB.map((c) => ({ ...c, slot: 'B' as const })),
      ]

      if (clipsA.length === 0) {
        directorStore.setError(projectId, 'No clips in Slot A. Upload videos first.')
        return
      }

      const transcription = useTranscriptionStore.getState().results
      const editing = useEditingStore.getState().analysis

      const clipOffsets: { clipId: string; offsetStart: number; offsetEnd: number }[] = []
      const combinedSegments: { start: number; end: number; text: string }[] = []
      const combinedSilence: { start: number; end: number; duration: number; confidence: number }[] = []
      let cumulativeOffset = 0

      for (const clip of clipsA) {
        const clipTranscription = transcription[clip.id]
        const clipAnalysis = editing[clip.id]

        const offsetStart = cumulativeOffset
        const offsetEnd = cumulativeOffset + clip.duration
        clipOffsets.push({ clipId: clip.id, offsetStart, offsetEnd })

        if (clipTranscription?.segments) {
          for (const seg of clipTranscription.segments) {
            combinedSegments.push({
              start: seg.start + cumulativeOffset,
              end: seg.end + cumulativeOffset,
              text: seg.text,
            })
          }
        }

        if (clipAnalysis?.silenceSegments) {
          for (const sil of clipAnalysis.silenceSegments) {
            combinedSilence.push({
              start: sil.start + cumulativeOffset,
              end: sil.end + cumulativeOffset,
              duration: sil.duration,
              confidence: sil.confidence,
            })
          }
        }

        cumulativeOffset += clip.duration
      }

      const totalDuration = clipsA.reduce((sum, c) => sum + c.duration, 0)

      const currentInstructions = useDirectorStore.getState().state[projectId]?.instructions ?? ''
      const currentStyle = useDirectorStore.getState().state[projectId]?.selectedStyle ?? 'professional'

      directorStore.setStatus(projectId, 'planning')

      const contentAnalysis = analyzeContent(
        combinedSegments,
        totalDuration,
        clipsA.length === 1 ? clipsA[0]?.fileName : undefined,
      )

      const hooks = detectHooks(combinedSegments, totalDuration * 0.2)

      const retention = analyzeRetention(
        combinedSegments,
        contentAnalysis,
        hooks,
        combinedSilence,
        totalDuration,
      )

      const input: PlannerInput = {
        projectId,
        instructions: currentInstructions,
        selectedStyle: currentStyle,
        clips: allClips.map((c) => ({
          id: c.id,
          fileName: c.fileName,
          duration: c.duration,
          slot: c.slot,
        })),
        contentAnalysis,
        retention,
        transcription: combinedSegments,
        clipOffsets,
      }

      const editPlan = createEditPlan(input)
      directorStore.setPlan(projectId, editPlan)
    } catch (err) {
      directorStore.setError(projectId, err instanceof Error ? err.message : 'Planning failed')
    }
  }, [projectId, directorStore])

  const executePlan = useCallback(async () => {
    directorStore.setStatus(projectId, 'executing')
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
      directorStore.setStatus(projectId, 'done')
    } catch (err) {
      directorStore.setError(projectId, err instanceof Error ? err.message : 'Execution failed')
    }
  }, [projectId, directorStore])

  return {
    instructions,
    selectedStyle,
    status,
    plan,
    error,
    setInstructions: (text: string) => directorStore.setInstructions(projectId, text),
    setStyle: (style: StyleKey) => directorStore.setStyle(projectId, style),
    generatePlan,
    executePlan,
  }
}
