import { useCallback, useMemo, useRef } from 'react'
import { useClipStore } from '../../lib/state'
import { useFileUpload } from '../../hooks/useFileUpload'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { ProjectStorage } from '../../lib/opfs'
import { AudioOrchestrator } from '../../lib/audio'
import { UploadZone } from './UploadZone'
import { ClipCard } from './ClipCard'
import { UploadProgress } from './UploadProgress'

interface SlotAProps {
  projectId: string
  onPlayClip?: (clipId: string) => void
  onConcatNeeded?: () => void
}

export function SlotA({ projectId, onPlayClip, onConcatNeeded }: SlotAProps) {
  const clips = useClipStore((s) => s.getSlotClips(projectId, 'A'))
  const concatJob = useClipStore((s) => s.concatJob)
  const uploads = useClipStore((s) => s.uploads)
  const removeClip = useClipStore((s) => s.removeClip)
  const removeUploadProgress = useClipStore((s) => s.removeUploadProgress)
  const toggleMute = useClipStore((s) => s.toggleMute)
  const { uploadFiles } = useFileUpload()
  const { announce } = useAriaAnnouncer()
  const lastPctRef = useRef<Record<string, number>>({})

  const uploadsList = useMemo(() => Object.values(uploads).filter((u) => u.slot === 'A' || !u.slot), [uploads])

  const handleFiles = useCallback((files: FileList) => {
    const count = files.length
    let completed = 0
    const progressTracker = lastPctRef.current
    uploadFiles({
      projectId,
      slot: 'A',
      files,
      onFileStart: (name) => announce(`Uploading ${name}`, true),
      onProgress: (name, pct) => {
        const last = progressTracker[name] ?? 0
        const milestones = [25, 50, 75, 100]
        const nextMilestone = milestones.find((m) => m > last && pct >= m)
        if (nextMilestone) {
          progressTracker[name] = nextMilestone
          announce(`${name}: ${nextMilestone}%`, nextMilestone === 100)
        }
      },
      onFileComplete: (name) => {
        completed++
        delete progressTracker[name]
        announce(`${name} complete. ${completed} of ${count} uploaded.`)
      },
      onAllComplete: () => {
        announce(`All ${count} files uploaded. Starting timeline stitch.`)
        onConcatNeeded?.()
      },
    })
  }, [projectId, uploadFiles, announce, onConcatNeeded])

  const handlePlay = useCallback((clipId: string) => {
    onPlayClip?.(clipId)
  }, [onPlayClip])

  const handleMute = useCallback((clipId: string) => {
    toggleMute(projectId, 'A', clipId)
    const clip = clips.find((c) => c.id === clipId)
    announce(clip?.muted ? 'Clip unmuted' : 'Clip muted')
    onConcatNeeded?.()
  }, [projectId, clips, toggleMute, announce, onConcatNeeded])

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
    removeClip(projectId, 'A', clipId)
    announce(`Deleted ${clip?.fileName ?? 'clip'}`)
    onConcatNeeded?.()
  }, [projectId, clips, removeClip, removeUploadProgress, announce, onConcatNeeded])

  return (
    <section role="region" aria-label="Main video clips" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Slot A — Main Videos</h2>
        {clips.length > 0 && (
          <span className="text-xs text-gray-500" aria-label={`${clips.length} clip${clips.length !== 1 ? 's' : ''}`}>
            {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <UploadZone slotLabel="Slot A — Main Videos" onFiles={handleFiles} />

      <UploadProgress uploads={uploadsList} concatStatus={concatJob.status} />

      {clips.length > 0 && (
        <ul role="list" aria-label="Uploaded main video clips" className="space-y-2">
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
