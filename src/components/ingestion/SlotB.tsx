import { useCallback, useMemo } from 'react'
import { useClipStore } from '../../lib/state'
import { useFileUpload } from '../../hooks/useFileUpload'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { ProjectStorage } from '../../lib/opfs'
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
  const toggleMute = useClipStore((s) => s.toggleMute)
  const { uploadFiles } = useFileUpload()
  const { announce } = useAriaAnnouncer()

  const uploadsList = useMemo(() => Object.values(uploads), [uploads])

  const handleFiles = useCallback((files: FileList) => {
    const count = files.length
    uploadFiles({
      projectId,
      slot: 'B',
      files,
      onFileStart: (name) => announce(`Uploading overlay ${name}`, true),
      onFileComplete: (name) => announce(`${name} overlay uploaded`),
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
    removeClip(projectId, 'B', clipId)
    if (clip) {
      try {
        await ProjectStorage.deleteFile(projectId, clip.opfsFilename)
      } catch {
        // file may not exist
      }
    }
    announce(`Deleted overlay ${clip?.fileName ?? 'clip'}`)
  }, [projectId, clips, removeClip, announce])

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
