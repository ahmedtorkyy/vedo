import type { TranscriptionSegment as SegType } from '../../types'

interface TransSegProps {
  segment: SegType
  index: number
  active?: boolean
  onClick?: (start: number) => void
}

function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor((t % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export function TranscriptionSegmentRow({ segment, index, active, onClick }: TransSegProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(segment.start)}
      className={`flex w-full gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
        active
          ? 'bg-sky-800/40 text-sky-200'
          : 'hover:bg-gray-700 text-gray-300'
      }`}
      aria-label={`Segment ${index + 1}: ${fmt(segment.start)} to ${fmt(segment.end)}. ${segment.text}`}
    >
      <span className="shrink-0 font-mono text-xs text-gray-500 w-16">
        {fmt(segment.start)}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">
        {segment.text}
      </span>
    </button>
  )
}
