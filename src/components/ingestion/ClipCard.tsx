import type { Clip } from '../../types'

interface ClipCardProps {
  clip: Clip
  index: number
  total: number
  onPlay: (clipId: string) => void
  onMute: (clipId: string) => void
  onDelete: (clipId: string) => void
}

export function ClipCard({ clip, index, total, onPlay, onMute, onDelete }: ClipCardProps) {
  const sizeLabel = clip.fileSize > 1_048_576
    ? `${(clip.fileSize / 1_048_576).toFixed(1)} MB`
    : `${(clip.fileSize / 1024).toFixed(0)} KB`

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
      role="group"
      aria-label={`Clip ${index + 1} of ${total}: ${clip.fileName}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-700 text-xs font-bold text-gray-400">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">{clip.fileName}</p>
        <p className="text-xs text-gray-500">
          {sizeLabel}
          {clip.duration > 0 && ` · ${clip.duration.toFixed(1)}s`}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onPlay(clip.id)}
          aria-label={`Preview clip ${index + 1}`}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          title="Preview"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onMute(clip.id)}
          aria-label={clip.muted ? 'Unmute clip' : 'Mute clip'}
          aria-pressed={clip.muted}
          className={`rounded p-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
            clip.muted
              ? 'text-red-400 hover:bg-red-900/30'
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          title={clip.muted ? 'Unmute' : 'Mute'}
        >
          {clip.muted ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L4.703 13H2.25a.75.75 0 01-.75-.75v-4.5a.75.75 0 01.75-.75h2.453l4.033-3.796a.75.75 0 01.811-.142zM13.28 7.22a.75.75 0 011.06 0l.66.66.66-.66a.75.75 0 111.06 1.06l-.66.66.66.66a.75.75 0 11-1.06 1.06l-.66-.66-.66.66a.75.75 0 11-1.06-1.06l.66-.66-.66-.66a.75.75 0 010-1.06z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L4.703 13H2.25a.75.75 0 01-.75-.75v-4.5a.75.75 0 01.75-.75h2.453l4.033-3.796a.75.75 0 01.811-.142zM14.5 10a4.5 4.5 0 00-2.697-4.12.75.75 0 10-.63 1.36A3 3 0 0113 10a3 3 0 01-1.827 2.76.75.75 0 10.63 1.36A4.5 4.5 0 0014.5 10zm3.5 0a8 8 0 00-4.28-7.11.75.75 0 10-.71 1.32A6.5 6.5 0 0117 10a6.5 6.5 0 01-2.49 5.79.75.75 0 10.71 1.32A8 8 0 0018 10z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => onDelete(clip.id)}
          aria-label={`Delete clip ${index + 1}: ${clip.fileName}`}
          className="rounded p-1.5 text-gray-400 hover:bg-red-900/30 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
          title="Delete"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
