import type { SilenceSegment } from '../../types'

interface SilenceTimelineProps {
  duration: number
  segments: SilenceSegment[]
  fillerWords: { start: number; word: string }[]
  lowEnergySections: SilenceSegment[]
  selectedSilenceIndices?: number[]
  onSkip?: (time: number) => void
  onTrim?: (index: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function SilenceTimeline({ duration, segments, fillerWords, lowEnergySections, selectedSilenceIndices, onSkip, onTrim }: SilenceTimelineProps) {
  if (duration <= 0) return null

  const silenceColor = 'bg-rose-500/40'
  const lowEnergyColor = 'bg-amber-500/30'
  const fillerColor = 'bg-sky-400/50'

  function toPercent(time: number): number {
    return Math.min(100, Math.max(0, (time / duration) * 100))
  }

  return (
    <div role="region" aria-label="Audio timeline" className="space-y-1">
      <div className="relative h-8 w-full rounded-md bg-gray-800 overflow-hidden">
        <div className="absolute inset-0 flex" role="img" aria-label={`Timeline: ${segments.length} silent regions, ${fillerWords.length} filler words, ${lowEnergySections.length} low-energy sections`}>
          {segments.map((seg, i) => (
            <div
              key={`silence-${i}`}
              className={`absolute top-0 h-full ${silenceColor}`}
              style={{
                left: `${toPercent(seg.start)}%`,
                width: `${toPercent(seg.duration)}%`,
              }}
              title={`Silence: ${formatTime(seg.start)} - ${formatTime(seg.end)} (${seg.duration.toFixed(1)}s)`}
            />
          ))}
          {lowEnergySections.map((seg, i) => (
            <div
              key={`low-${i}`}
              className={`absolute top-0 h-full ${lowEnergyColor}`}
              style={{
                left: `${toPercent(seg.start)}%`,
                width: `${toPercent(seg.duration)}%`,
              }}
              title={`Low energy: ${formatTime(seg.start)} - ${formatTime(seg.end)}`}
            />
          ))}
          {fillerWords.map((fw, i) => (
            <div
              key={`filler-${i}`}
              className={`absolute top-0 h-full ${fillerColor}`}
              style={{
                left: `${toPercent(fw.start)}%`,
                width: '0.25%',
              }}
              title={`"${fw.word}" at ${formatTime(fw.start)}`}
            />
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[10px] text-gray-500">
          <span>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-gray-400" role="list" aria-label="Timeline legend">
        <span className="flex items-center gap-1" role="listitem">
          <span className="inline-block h-2 w-2 rounded-sm bg-rose-500/60" /> Silence
          <span className="text-gray-500">({segments.length})</span>
        </span>
        <span className="flex items-center gap-1" role="listitem">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/50" /> Low energy
          <span className="text-gray-500">({lowEnergySections.length})</span>
        </span>
        <span className="flex items-center gap-1" role="listitem">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400/60" /> Filler words
          <span className="text-gray-500">({fillerWords.length})</span>
        </span>
      </div>

      {segments.length > 0 && (
        <div className="mt-2 space-y-1" role="list" aria-label="Silent regions list">
          <p className="text-[10px] font-medium text-gray-500">Silent regions — Skip to preview, Trim to remove</p>
          {segments.map((seg, i) => {
            const isSelected = selectedSilenceIndices?.includes(i) ?? false
            return (
              <div key={`silence-item-${i}`} role="listitem" aria-label={`Silence ${i + 1} of ${segments.length}`} className="flex items-center gap-2 rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-400">
                <span className="shrink-0 font-mono text-gray-500">#{i + 1}</span>
                <span>{formatTime(seg.start)} – {formatTime(seg.end)}</span>
                <span className="text-gray-500">({seg.duration.toFixed(1)}s)</span>
                <div className="ml-auto flex gap-1">
                  {onSkip && (
                    <button
                      type="button"
                      onClick={() => onSkip(seg.start)}
                      aria-label={`Skip to silence ${i + 1} at ${formatTime(seg.start)}`}
                      className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-700 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      Skip
                    </button>
                  )}
                  {onTrim && (
                    <button
                      type="button"
                      onClick={() => onTrim(i)}
                      aria-label={isSelected ? `Keep silence ${i + 1}` : `Trim silence ${i + 1}`}
                      aria-pressed={isSelected}
                      className={`rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                        isSelected
                          ? 'bg-rose-700 text-white'
                          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {isSelected ? 'Keep' : 'Trim'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}