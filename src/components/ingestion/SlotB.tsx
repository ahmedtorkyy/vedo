import { useCallback, useMemo, useRef } from 'react'
import { useClipStore } from '../../lib/state'
import { useFileUpload } from '../../hooks/useFileUpload'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { ProjectStorage } from '../../lib/opfs'
import { AudioOrchestrator } from '../../lib/audio'
import { UploadZone } from './UploadZone'
import { ClipCard } from './ClipCard'
import { UploadProgress } from './UploadProgress'

interface SlotBProps {
  projectId: string
  onPlayClip?: (clipId: string) => void
}

export function SlotB({ projectId, onPlayClip }: SlotBProps) {
  const clips = useClipStore((s) => s.getSlotClips(projectId, 'B'))
  const uploads = useClipStore((s) => s.uploads)
  const removeClip = useClipStore((s) => s.removeClip)
  const removeUploadProgress = useClipStore((s) => s.removeUploadProgress)
  const toggleMute = useClipStore((s) => s.toggleMute)
  const { uploadFiles } = useFileUpload()
  const { announce } = useAriaAnnouncer()
  const lastPctRef = useRef<Record<string, number>>({})

  const uploadsList = useMemo(() => Object.values(uploads).filter((u) => u.slot === 'B' || !u.slot), [uploads])

  const handleFiles = useCallback((files: FileList) => {
    const count = files.length
    const progressTracker = lastPctRef.current
    uploadFiles({
      projectId,
      slot: 'B',
      files,
      onFileStart: (name) => announce(`Uploading overlay ${name}`, true),
      onProgress: (name, pct) => {
        const last = progressTracker[name] ?? 0
        const milestones = [25, 50, 75, 100]
        const nextMilestone = milestones.find((m) => m > last && pct >= m)
        if (nextMilestone) {
          progressTracker[name] = nextMilestone
          announce(`Overlay ${name}: ${nextMilestone}%`, nextMilestone === 100)
        }
      },
      onFileComplete: (name) => {
        delete progressTracker[name]
        announce(`${name} overlay uploaded`)
      },
      onAllComplete: () => announce(`All ${count} overlay files uploaded`),
    })
  }, [projectId, uploadFiles, announce])

  const handlePlay = useCallback((clipId: string) => {
    onPlayClip?.(clipId)
  }, [onPlayClip])

  const handleMute = useCallback((clipId: string) => {
    toggleMute(projectId, 'B', clipId)
    const clip = clips.find((c) => c.id === clipId)
    announce(clip?.muted ? 'Overlay unmuted' : 'Overlay muted')
  }, [projectId, clips, toggleMute, announce])

  const handleDelete = useCallback(async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId)
    if (clip) {
      try {
        await ProjectStorage.deleteFile(projectId, clip.opfsFilename)
      } catch {
        // file may not exist
      }
    }
    AudioOrchestrator.getInstance().unregisterClipChannel(clipId)
    removeUploadProgress(clipId)
    removeClip(projectId, 'B', clipId)
    announce(`Deleted overlay ${clip?.fileName ?? 'clip'}`)
  }, [projectId, clips, removeClip, removeUploadProgress, announce])

  return (
    <section role="region" aria-label="Floating overlays" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Slot B — Floating Overlays</h2>
        {clips.length > 0 && (
          <span className="text-xs text-gray-500" aria-label={`${clips.length} overlay${clips.length !== 1 ? 's' : ''}`}>
            {clips.length} overlay{clips.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <UploadZone slotLabel="Slot B — Floating Overlays" onFiles={handleFiles} />

      <UploadProgress uploads={uploadsList} concatStatus="idle" />

      {clips.length > 0 && (
        <ul role="list" aria-label="Uploaded overlay clips" className="space-y-2">
          {clips.map((clip, i) => (
            <li key={clip.id}>
              <ClipCard
                clip={clip}
                index={i}
                total={clips.length}
                onPlay={handlePlay}
                onMute={handleMute}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
