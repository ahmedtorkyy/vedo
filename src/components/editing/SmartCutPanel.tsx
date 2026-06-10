import type { SmartCutOptions } from '../../types'
import { getEffectiveOptions } from '../../lib/editing'

interface SmartCutPanelProps {
  clipId: string
  options: SmartCutOptions
  silenceCount: number
  onOptionsChange: (clipId: string, options: SmartCutOptions) => void
  onApply: () => void
  disabled?: boolean
  status?: 'idle' | 'applying' | 'done' | 'error'
  error?: string
}

const AGGRESSIVENESS_LABELS: Record<string, string> = {
  low: 'Low — remove long pauses only',
  medium: 'Medium — balance between pacing and natural flow',
  high: 'High — aggressive silence removal',
}

export function SmartCutPanel({
  clipId,
  options,
  silenceCount,
  onOptionsChange,
  onApply,
  disabled,
  status,
  error,
}: SmartCutPanelProps) {
  const effective = getEffectiveOptions(options)

  return (
    <div role="region" aria-label="Smart cut controls" className="space-y-3 rounded-md border border-gray-700 bg-gray-800/50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300">Smart Cut</h3>
        <span className="text-[10px] text-gray-500">
          Threshold: {effective.threshold.toFixed(3)} RMS · Min: {effective.minDuration.toFixed(1)}s
        </span>
      </div>

      <div className="space-y-1">
        <label htmlFor={`aggressiveness-${clipId}`} className="text-[10px] text-gray-500">
          Aggressiveness
        </label>
        <select
          id={`aggressiveness-${clipId}`}
          value={options.aggressiveness}
          onChange={(e) => onOptionsChange(clipId, { ...options, aggressiveness: e.target.value as SmartCutOptions['aggressiveness'] })}
          className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Smart cut aggressiveness"
        >
          {Object.entries(AGGRESSIVENESS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {silenceCount} silence segment{silenceCount !== 1 ? 's' : ''} detected
        </span>
        <button
          type="button"
          onClick={onApply}
          disabled={disabled || silenceCount === 0}
          className="rounded-md bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label={status === 'applying' ? 'Applying smart cut...' : 'Apply smart cut'}
        >
          {status === 'applying' ? 'Cutting...' : 'Apply Smart Cut'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded bg-red-900/30 px-2 py-1 text-[10px] text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
