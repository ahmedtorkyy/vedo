import { useCallback, useRef, useState } from 'react'
import { useClipStore } from '../lib/state'
import { extractAudio, cleanAudio } from '../lib/ffmpeg'
import { loadTranscriptionModel, transcribeFromOpfs, transcribeAudio, decodeWavToF32 } from '../lib/transcription'
import { useTranscriptionStore } from '../lib/transcription'
import { ProjectStorage } from '../lib/opfs'
import { recommendModel } from '../lib/editing/device-capability'
import type { AudioCleansingOptions } from '../types'

type ModelKey = 'whisper-tiny' | 'whisper-base' | 'whisper-small'

export function useTranscription() {
  const transcribingRef = useRef(false)
  const [modelKey, setModelKey] = useState<ModelKey>(recommendModel())

  const ensureModel = useCallback(async () => {
    await loadTranscriptionModel(modelKey)
  }, [modelKey])

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

      const result = await transcribeFromOpfs(projectId, audioFile)

      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      transcribingRef.current = false
    }
  }, [ensureModel])

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

      const result = await transcribeFromOpfs(projectId, cleaned)
      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Audio cleansing failed')
    }
  }, [ensureModel])

  return { transcribeClip, cleanseClipAudio, modelKey, setModelKey }
}
