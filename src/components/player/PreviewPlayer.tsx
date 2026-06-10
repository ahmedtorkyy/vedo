import { useRef, useEffect, useCallback, useState } from 'react'
import { useClipStore } from '../../lib/state'

interface PreviewPlayerProps {
  projectId: string | null
  concatReady: boolean
}

export function PreviewPlayer({ projectId, concatReady }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMutedState] = useState(false)
  const blobUrlRef = useRef<string | null>(null)
  const concatJob = useClipStore((s) => s.concatJob)
  const pendingSeek = useClipStore((s) => s.pendingSeek)

  const loadSource = useCallback(async (filename: string) => {
    if (!projectId) return
    try {
      const root = await navigator.storage.getDirectory()
      const folder = await root.getDirectoryHandle(`project_${projectId}`)
      const handle = await folder.getFileHandle(filename)
      const file = await handle.getFile()
      const url = URL.createObjectURL(file)

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url

      const video = videoRef.current
      if (video) video.src = url
    } catch {
      // file not available yet
    }
  }, [projectId])

  const loadPreview = useCallback(async () => {
    if (!projectId) return

    const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
    if (clipsA.length === 1) {
      await loadSource(clipsA[0].opfsFilename)
      return
    }

    if (concatJob.outputFilename) {
      await loadSource(concatJob.outputFilename)
    }
  }, [projectId, concatJob.outputFilename, loadSource])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  useEffect(() => {
    if (pendingSeek !== null && videoRef.current) {
      videoRef.current.currentTime = pendingSeek
      useClipStore.getState().clearPendingSeek()
    }
  }, [pendingSeek])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function onPlay() { setPlaying(true) }
    function onPause() { setPlaying(false) }
    function onTimeUpdate() { if (video) setCurrentTime(video.currentTime) }
    function onLoadedMetadata() { if (video) setDuration(video.duration) }
    function onEnded() { setPlaying(false) }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('ended', onEnded)
    }
  }, [projectId, concatReady])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const skipBack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, video.currentTime - 10)
  }, [])

  const skipForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
  }, [])

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const val = parseFloat(e.target.value)
    if (!isNaN(val)) video.currentTime = Math.max(0, Math.min(val, video.duration || 0))
  }, [])

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMutedState(video.muted)
  }, [])

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <section role="region" aria-label="Video preview player" className="flex flex-col">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        {!projectId ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">Select a project to preview</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            controls={false}
            preload="auto"
            aria-label="Video preview"
          >
            <p>Your browser does not support the video element.</p>
          </video>
        )}
      </div>

      {projectId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause video' : 'Play video'}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={skipBack}
            aria-label="Skip back 10 seconds"
            className="rounded-md bg-gray-700 px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            -10s
          </button>
          <button
            type="button"
            onClick={skipForward}
            aria-label="Skip forward 10 seconds"
            className="rounded-md bg-gray-700 px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            +10s
          </button>
          <button
            type="button"
            onClick={handleMuteToggle}
            aria-label={muted ? 'Unmute preview' : 'Mute preview'}
            className="rounded-md bg-gray-700 px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <label htmlFor="preview-seek" className="sr-only">Seek to time in seconds</label>
            <input
              id="preview-seek"
              type="number"
              min={0}
              max={Math.round(duration) || 0}
              step={0.1}
              value={Math.round(currentTime * 10) / 10}
              onChange={handleSeekChange}
              className="w-16 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-center text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              aria-label={`Current time in seconds. Type a value and press Enter to seek.`}
            />
            <span aria-live="polite" aria-atomic="true">
              / {formatTime(duration)}
            </span>
          </div>
          {concatReady && (
            <span className="ml-auto text-xs text-green-400" aria-live="polite">
              Stitched
            </span>
          )}
        </div>
      )}
    </section>
  )
}
