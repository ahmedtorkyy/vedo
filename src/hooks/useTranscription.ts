import { useCallback, useRef } from 'react'
import { useClipStore } from '../lib/state'
import { extractAudio, cleanAudio } from '../lib/ffmpeg'
import { transcribeFromOpfs } from '../lib/transcription'
import { useTranscriptionStore } from '../lib/transcription'
import { backgroundLoadModel, isModelReady, stepDownModel, isInferenceFailure } from '../lib/transcription/model-loader'
import type { AudioCleansingOptions } from '../types'

export function useTranscription() {
  const transcribingRef = useRef(false)

  // Loads through the quality ladder (large-v3 → medium → small) and reuses
  // whatever the background loader already brought up — never reloads.
  const ensureModel = useCallback(async () => {
    await backgroundLoadModel()
    if (!isModelReady()) {
      throw new Error('AI model could not be loaded — check your connection and retry.')
    }
  }, [])

  // Runs transcription, stepping down the model ladder when the loaded
  // model fails at inference time (e.g. wasm memory ceiling on large-v3).
  const transcribeWithFallback = useCallback(async (projectId: string, audioFile: string) => {
    for (;;) {
      try {
        return await transcribeFromOpfs(projectId, audioFile)
      } catch (err) {
        if (isInferenceFailure(err) && await stepDownModel()) {
          continue
        }
        throw err
      }
    }
  }, [])

  const transcribeClip = useCallback(async (projectId: string, clipId: string) => {
    if (transcribingRef.current) return
    transcribingRef.current = true

    const store = useTranscriptionStore.getState()
    const clipStore = useClipStore.getState()
    const clipsA = clipStore.getSlotClips(projectId, 'A')
    const clipsB = clipStore.getSlotClips(projectId, 'B')
    const clip = [...clipsA, ...clipsB].find((c) => c.id === clipId)
    if (!clip) {
      store.setError(clipId, 'Clip not found')
      transcribingRef.current = false
      return
    }

    store.setStatus(clipId, 'extracting')

    try {
      const audioFile = await extractAudio(projectId, clip.opfsFilename)

      store.setStatus(clipId, 'transcribing')

      await ensureModel()

      const result = await transcribeWithFallback(projectId, audioFile)

      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      transcribingRef.current = false
    }
  }, [ensureModel, transcribeWithFallback])

  const cleanseClipAudio = useCallback(async (
    projectId: string,
    clipId: string,
    options: AudioCleansingOptions,
  ) => {
    const store = useTranscriptionStore.getState()
    const clipStore = useClipStore.getState()
    const clipsA = clipStore.getSlotClips(projectId, 'A')
    const clipsB = clipStore.getSlotClips(projectId, 'B')
    const clip = [...clipsA, ...clipsB].find((c) => c.id === clipId)
    if (!clip) {
      store.setError(clipId, 'Clip not found')
      return
    }

    store.setStatus(clipId, 'extracting')

    try {
      const audioFile = await extractAudio(projectId, clip.opfsFilename)
      const cleaned = await cleanAudio(projectId, audioFile, options)
      store.setStatus(clipId, 'transcribing')

      await ensureModel()

      const result = await transcribeWithFallback(projectId, cleaned)
      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Audio cleansing failed')
    }
  }, [ensureModel, transcribeWithFallback])

  return { transcribeClip, cleanseClipAudio }
}
