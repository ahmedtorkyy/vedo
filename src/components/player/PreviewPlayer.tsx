import { useRef, useEffect, useCallback, useState } from 'react'

interface PreviewPlayerProps {
  projectId: string | null
  concatReady: boolean
}

export function PreviewPlayer({ projectId, concatReady }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function onPlay() { setPlaying(true) }
    function onPause() { setPlaying(false) }
    function onTimeUpdate() { setCurrentTime(video.currentTime) }
    function onLoadedMetadata() { setDuration(video.duration) }
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

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function getVideoSrc(): string | undefined {
    if (!projectId) return undefined
    return undefined
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
        <div className="mt-2 flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause video' : 'Play video'}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span aria-label={`Current time: ${formatTime(currentTime)}`}>
              {formatTime(currentTime)}
            </span>
            <span>/</span>
            <span aria-label={`Duration: ${formatTime(duration)}`}>
              {formatTime(duration)}
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
