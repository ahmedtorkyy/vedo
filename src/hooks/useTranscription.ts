import { useCallback, useRef } from 'react'
import { useClipStore } from '../lib/state'
import { ProjectStorage } from '../lib/opfs'
import { extractAudio, cleanAudio } from '../lib/ffmpeg'
import { loadTranscriptionModel, transcribeAudio, decodeWavToF32, isModelLoaded } from '../lib/transcription'
import { useTranscriptionStore } from '../lib/transcription'
import type { AudioCleansingOptions } from '../types'

export function useTranscription() {
  const transcribingRef = useRef(false)

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

      if (!isModelLoaded()) {
        await loadTranscriptionModel()
      }

      const file = await ProjectStorage.getFile(projectId, audioFile)
      const buffer = await file.arrayBuffer()
      const decoded = decodeWavToF32(buffer)
      if (!decoded) {
        store.setError(clipId, 'Failed to decode audio')
        transcribingRef.current = false
        return
      }

      const result = await transcribeAudio(decoded.audio)
      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      transcribingRef.current = false
    }
  }, [])

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

      if (!isModelLoaded()) {
        await loadTranscriptionModel()
      }

      const file = await ProjectStorage.getFile(projectId, cleaned)
      const buffer = await file.arrayBuffer()
      const decoded = decodeWavToF32(buffer)
      if (!decoded) {
        store.setError(clipId, 'Failed to decode cleaned audio')
        return
      }

      const result = await transcribeAudio(decoded.audio)
      store.setSegments(clipId, result.segments, result.language)
    } catch (err) {
      store.setError(clipId, err instanceof Error ? err.message : 'Audio cleansing failed')
    }
  }, [])

  return { transcribeClip, cleanseClipAudio }
}
