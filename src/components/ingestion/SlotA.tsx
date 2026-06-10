import { useCallback, useMemo } from 'react'
import { useClipStore } from '../../lib/state'
import { useFileUpload } from '../../hooks/useFileUpload'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { ProjectStorage } from '../../lib/opfs'
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
  const toggleMute = useClipStore((s) => s.toggleMute)
  const { uploadFiles } = useFileUpload()
  const { announce } = useAriaAnnouncer()

  const uploadsList = useMemo(() => Object.values(uploads), [uploads])

  const handleFiles = useCallback((files: FileList) => {
    const count = files.length
    let completed = 0
    uploadFiles({
      projectId,
      slot: 'A',
      files,
      onFileStart: (name) => announce(`Uploading ${name}`, true),
      onFileComplete: (name) => {
        completed++
        announce(`${name} uploaded. ${completed} of ${count} complete.`)
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
  }, [projectId, clips, toggleMute, announce])

  const handleDelete = useCallback(async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId)
    removeClip(projectId, 'A', clipId)
    if (clip) {
      try {
        await ProjectStorage.deleteFile(projectId, clip.opfsFilename)
      } catch {
        // file may not exist
      }
    }
    announce(`Deleted ${clip?.fileName ?? 'clip'}`)
    onConcatNeeded?.()
  }, [projectId, clips, removeClip, announce, onConcatNeeded])

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
