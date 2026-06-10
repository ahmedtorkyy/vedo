import type { UploadProgressEntry } from '../../types'

interface UploadProgressProps {
  uploads: UploadProgressEntry[]
  concatStatus: string
}

export function UploadProgress({ uploads, concatStatus }: UploadProgressProps) {
  if (uploads.length === 0 && concatStatus === 'idle') return null

  const isConcatActive = concatStatus === 'loading-ffmpeg' || concatStatus === 'concatenating'

  return (
    <div className="space-y-2" role="region" aria-label="Upload and processing progress">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {uploads.some((u) => u.status === 'uploading') && 'Files are being uploaded'}
        {isConcatActive && 'Timeline is being re-stitched'}
      </div>

      {uploads.map((entry) => (
        <div
          key={entry.clipId}
          className="rounded-md bg-gray-800 px-3 py-2"
          role="status"
          aria-label={`${entry.fileName}: ${entry.status}`}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="truncate text-gray-300">{entry.fileName}</span>
            <span className="ml-2 shrink-0 text-xs text-gray-500">
              {entry.status === 'uploading' && `${entry.progress}%`}
              {entry.status === 'queued' && 'Queued'}
              {entry.status === 'done' && 'Done'}
              {entry.status === 'error' && 'Error'}
            </span>
          </div>
          {entry.status === 'uploading' && (
            <div className="mt-1 h-1.5 rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${entry.progress}%` }}
              />
            </div>
          )}
          {entry.status === 'error' && entry.error && (
            <p className="mt-1 text-xs text-red-400">{entry.error}</p>
          )}
        </div>
      ))}

      {isConcatActive && (
        <div
          className="rounded-md bg-amber-900/30 px-3 py-2 text-sm text-amber-300"
          role="status"
          aria-live="polite"
        >
          {concatStatus === 'loading-ffmpeg' ? 'Loading processing engine...' : 'Re-stitching timeline...'}
        </div>
      )}
    </div>
  )
}
