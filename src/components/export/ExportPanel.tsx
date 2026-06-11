import { useCallback, useEffect, useRef, useState } from 'react'
import { useClipStore } from '../../lib/state'
import { useDirectorStore } from '../../lib/director/director-store'
import { useRender } from '../../hooks/useRender'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import type { ExportOptions, ExportQuality, ExportFormat, PlatformPreset } from '../../lib/export'

interface ExportPanelProps {
  projectId: string
}

const QUALITY_OPTIONS: { value: ExportQuality; label: string }[] = [
  { value: '480p', label: '480p (SD)' },
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '4K', label: '4K (UHD)' },
]

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'mp4', label: 'MP4 (H.264 + AAC)' },
  { value: 'webm', label: 'WebM (VP9 + Opus)' },
  { value: 'mkv', label: 'MKV (H.264 + AAC)' },
]

const PLATFORM_OPTIONS: { value: PlatformPreset; label: string }[] = [
  { value: 'none', label: 'None (original aspect)' },
  { value: 'tiktok', label: 'TikTok (9:16)' },
  { value: 'reels', label: 'Instagram Reels (9:16)' },
  { value: 'shorts', label: 'YouTube Shorts (9:16)' },
  { value: 'youtube', label: 'YouTube (16:9)' },
]

export function ExportPanel({ projectId }: ExportPanelProps) {
  const hr = useRender(projectId)
  const { renderState, isBusy, startExport, download, reset } = hr
  const { announce } = useAriaAnnouncer()
  const prevDoneRef = useRef(false)

  const [quality, setQuality] = useState<ExportQuality>('1080p')
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [platform, setPlatform] = useState<PlatformPreset>('none')
  const [burnCaptions, setBurnCaptions] = useState(false)

  const clipsA = useClipStore((s) => s.clips[projectId]?.A ?? [])
  const hasPlan = !!useDirectorStore((s) => s.state[projectId]?.plan)
  const canExport = clipsA.length > 0 && hasPlan && !isBusy

  useEffect(() => {
    if (renderState.status === 'done' && !prevDoneRef.current) {
      prevDoneRef.current = true
      announce('Video export complete')
    }
    if (renderState.status !== 'done') {
      prevDoneRef.current = false
    }
  }, [renderState.status, announce])

  const handleExport = useCallback(() => {
    const options: ExportOptions = { quality, format, platform, burnCaptions, captionBackend: 'drawtext' }
    startExport(options)
    announce(`Starting export: ${quality}, ${format}${platform !== 'none' ? `, ${platform}` : ''}${burnCaptions ? ', with captions' : ''}`)
  }, [quality, format, platform, burnCaptions, startExport, announce])

  const handleDownload = useCallback(() => {
    download()
    announce('Downloading exported video')
  }, [download, announce])

  return (
    <section role="region" aria-label="Export" className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">Export Video</h2>

      {!hasPlan && (
        <p className="text-xs text-gray-500">
          Generate an edit plan in the Director tab first.
        </p>
      )}

      {hasPlan && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Render the edited video with all applied effects (zooms, overlays, trims).
          </p>

          <div className="space-y-2">
            <label htmlFor="export-quality" className="text-xs text-gray-500">Quality</label>
            <select
              id="export-quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as ExportQuality)}
              disabled={isBusy}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40"
              aria-label="Export quality"
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="export-format" className="text-xs text-gray-500">Format</label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              disabled={isBusy}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40"
              aria-label="Export format"
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="export-platform" className="text-xs text-gray-500">Platform preset</label>
            <select
              id="export-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformPreset)}
              disabled={isBusy}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40"
              aria-label="Platform preset"
            >
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="burn-captions"
              type="checkbox"
              checked={burnCaptions}
              onChange={(e) => setBurnCaptions(e.target.checked)}
              disabled={isBusy}
              className="rounded border-gray-600 bg-gray-800 text-sky-500 focus:ring-sky-500 disabled:opacity-40"
            />
            <label htmlFor="burn-captions" className="text-xs text-gray-400">
              Burn captions into video
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={hr.downloadSrt}
              disabled={isBusy || renderState.status !== 'done'}
              className="rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Download SRT subtitle file"
            >
              Download SRT
            </button>
            <button
              type="button"
              onClick={hr.downloadVtt}
              disabled={isBusy || renderState.status !== 'done'}
              className="rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Download VTT subtitle file"
            >
              Download VTT
            </button>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label={isBusy ? 'Rendering video...' : 'Start export'}
          >
            {renderState.status === 'preparing' && 'Preparing...'}
            {renderState.status === 'processing' && 'Applying effects...'}
            {renderState.status === 'concatenating' && 'Concatenating...'}
            {renderState.status === 'idle' && 'Export Edited Video'}
            {renderState.status === 'done' && 'Re-export'}
          </button>

          {isBusy && (
            <div className="space-y-1" role="progressbar" aria-valuenow={renderState.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${renderState.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500" aria-live="polite">{renderState.message}</p>
            </div>
          )}

          {renderState.status === 'done' && renderState.outputFilename && (
            <div className="space-y-2 rounded-md border border-emerald-700 bg-emerald-900/20 p-3">
              <p className="text-xs text-emerald-300">Export complete!</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  aria-label="Download exported video"
                >
                  Download Video
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md bg-gray-700 px-4 py-2 text-xs text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  aria-label="Reset export state"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {renderState.status === 'error' && renderState.error && (
            <div role="alert" className="rounded-md bg-red-900/30 px-3 py-2 text-xs text-red-300">
              {renderState.error}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
