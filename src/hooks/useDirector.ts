import { useCallback } from 'react'
import { useClipStore, useProjectStore } from '../lib/state'
import { useTranscriptionStore } from '../lib/transcription'
import { useEditingStore } from '../lib/editing'
import { useDirectorStore, analyzeContent, detectHooks, analyzeRetention, createEditPlan, inferStyle } from '../lib/director'
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

      const firstClipId = clipsA[0]?.id
      const segments = transcription[firstClipId ?? '']?.segments ?? []
      const silenceSegments = editing[firstClipId ?? '']?.silenceSegments ?? []

      const currentInstructions = useDirectorStore.getState().state[projectId]?.instructions ?? ''
      const currentStyle = useDirectorStore.getState().state[projectId]?.selectedStyle ?? 'professional'

      directorStore.setStatus(projectId, 'planning')

      const contentAnalysis = analyzeContent(
        segments,
        clipsA.reduce((sum, c) => sum + c.duration, 0),
        clipsA[0]?.fileName,
      )

      const hooks = detectHooks(segments)

      const retention = analyzeRetention(
        segments,
        contentAnalysis,
        hooks,
        silenceSegments,
        clipsA.reduce((sum, c) => sum + c.duration, 0),
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
        transcription: segments,
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
      // Future: connect to FFmpeg worker for execution
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
