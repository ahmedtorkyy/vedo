import { useCallback, useRef } from 'react'
import { useClipStore } from '../lib/state'
import { useEditingStore, detectSilence, detectFillerWords, detectRepeatedPhrases, detectLowEnergySections, filterSilenceSegments } from '../lib/editing'
import { useTranscriptionStore } from '../lib/transcription'
import { extractAudio, smartCutVideo } from '../lib/ffmpeg'
import { ProjectStorage } from '../lib/opfs'
import { decodeWavToF32 } from '../lib/transcription'

export function useEditing() {
  const analyzingRef = useRef(false)

  const detectSilenceForClip = useCallback(async (projectId: string, clipId: string) => {
    if (analyzingRef.current) return
    analyzingRef.current = true

    const store = useEditingStore.getState()
    const clipStore = useClipStore.getState()
    const clipsA = clipStore.getSlotClips(projectId, 'A')
    const clipsB = clipStore.getSlotClips(projectId, 'B')
    const clip = [...clipsA, ...clipsB].find((c) => c.id === clipId)
    if (!clip) {
      store.setAnalysisError(clipId, 'Clip not found')
      analyzingRef.current = false
      return
    }

    store.setAnalysisStatus(clipId, 'analyzing')

    try {
      const audioFile = await extractAudio(projectId, clip.opfsFilename)

      const file = await ProjectStorage.getFile(projectId, audioFile)
      const buffer = await file.arrayBuffer()
      const decoded = decodeWavToF32(buffer)

      if (!decoded) {
        store.setAnalysisError(clipId, 'Failed to decode audio')
        analyzingRef.current = false
        return
      }

      const silenceSegments = detectSilence(decoded.audio, decoded.sampleRate)
      store.setSilenceSegments(clipId, silenceSegments)

      const lowEnergy = detectLowEnergySections(decoded.audio, decoded.sampleRate)
      store.setLowEnergySections(clipId, lowEnergy)

      const transResult = useTranscriptionStore.getState().results[clipId]
      if (transResult?.status === 'done' && transResult.segments.length > 0) {
        const fillerWords = detectFillerWords(transResult.segments)
        store.setFillerWords(clipId, fillerWords)

        const repeatedPhrases = detectRepeatedPhrases(transResult.segments)
        store.setRepeatedPhrases(clipId, repeatedPhrases)
      }

      store.setAnalysisDone(clipId)
    } catch (err) {
      store.setAnalysisError(clipId, err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      analyzingRef.current = false
    }
  }, [])

  const applySmartCut = useCallback(async (projectId: string, clipId: string) => {
    const clipStore = useClipStore.getState()
    const clipsA = clipStore.getSlotClips(projectId, 'A')
    const clipsB = clipStore.getSlotClips(projectId, 'B')
    const clip = [...clipsA, ...clipsB].find((c) => c.id === clipId)
    if (!clip) throw new Error('Clip not found')

    const state = useEditingStore.getState()
    const analysis = state.analysis[clipId]
    if (!analysis || analysis.status !== 'done') {
      throw new Error('Run silence detection first')
    }

    const options = state.smartCutOptions[clipId] ?? {
      enabled: true,
      aggressiveness: 'medium' as const,
    }

    const segments = filterSilenceSegments(analysis.silenceSegments, options)
    if (segments.length === 0) {
      throw new Error('No silence segments to remove at current aggressiveness')
    }

    const outputFilename = await smartCutVideo(
      projectId,
      clip.opfsFilename,
      segments.map((s) => ({ start: s.start, end: s.end })),
      clip.duration,
    )

    return outputFilename
  }, [])

  return { detectSilenceForClip, applySmartCut }
}
