import { useCallback } from 'react'
import { useClipStore } from '../../lib/state'
import { useDirectorStore } from '../../lib/director/director-store'
import { useRender } from '../../hooks/useRender'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'

interface ExportPanelProps {
  projectId: string
}

export function ExportPanel({ projectId }: ExportPanelProps) {
  const { renderState, isBusy, startExport, download, reset } = useRender(projectId)
  const { announce } = useAriaAnnouncer()

  const clipsA = useClipStore((s) => s.clips[projectId]?.A ?? [])
  const hasPlan = !!useDirectorStore((s) => s.state[projectId]?.plan)
  const canExport = clipsA.length > 0 && hasPlan && !isBusy

  const handleExport = useCallback(() => {
    startExport()
    announce('Starting video export')
  }, [startExport, announce])

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
