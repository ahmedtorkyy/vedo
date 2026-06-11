import { useCallback } from 'react'
import { useDirectorStore, generateSuggestions, applySelectedSuggestions } from '../../lib/director'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'

interface ImprovementReviewProps {
  projectId: string
  onApply: (instructions: string, style: string) => void
}

export function ImprovementReview({ projectId, onApply }: ImprovementReviewProps) {
  const projectState = useDirectorStore((s) => s.state[projectId])
  const setFeedbackText = useDirectorStore((s) => s.setFeedbackText)
  const toggleSuggestion = useDirectorStore((s) => s.toggleSuggestion)
  const { announce } = useAriaAnnouncer()

  const handleApply = useCallback(() => {
    const state = useDirectorStore.getState().state[projectId]
    if (!state) return
    const result = applySelectedSuggestions(state.plan!, state.suggestions, state.feedbackText)
    onApply(result.adjustedInstructions, result.adjustedStyle)
    announce('Applying improvements and regenerating edit plan')
  }, [projectId, onApply, announce])

  const handleRegenSuggestions = useCallback(() => {
    const state = useDirectorStore.getState().state[projectId]
    if (!state?.plan) return
    const newSuggestions = generateSuggestions(state.plan)
    useDirectorStore.getState().setSuggestions(projectId, newSuggestions)
    announce('Improvement suggestions updated')
  }, [projectId, announce])

  if (!projectState?.plan || projectState.status !== 'done') return null

  const { suggestions, feedbackText } = projectState
  const hasSuggestions = suggestions.length > 0
  const selectedCount = suggestions.filter((s) => s.selected).length

  if (!hasSuggestions && !feedbackText) return null

  return (
    <div role="region" aria-label="Improvement review" className="space-y-3 rounded-md border border-violet-700 bg-gray-800/50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-violet-300">Improvement Loop</h3>
        <button
          type="button"
          onClick={handleRegenSuggestions}
          className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Regenerate improvement suggestions"
        >
          Refresh suggestions
        </button>
      </div>

      {hasSuggestions && (
        <div className="space-y-1" role="group" aria-label="Improvement suggestions">
          <p className="text-[10px] text-gray-500">
            Select suggestions to apply ({selectedCount} of {suggestions.length} selected)
          </p>
          {suggestions.map((sg) => (
            <label
              key={sg.id}
              className="flex items-start gap-2 rounded bg-gray-800 px-2 py-1.5 cursor-pointer hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={sg.selected}
                onChange={() => toggleSuggestion(projectId, sg.id)}
                className="mt-0.5 h-3 w-3 rounded border-gray-600 bg-gray-700 text-violet-600 focus:ring-violet-500"
                aria-label={sg.label}
              />
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-gray-200">{sg.label}</span>
                <span className="block text-[10px] text-gray-400">{sg.description}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="improvement-feedback" className="text-[10px] text-gray-500">
          What would you like to adjust?
        </label>
        <textarea
          id="improvement-feedback"
          value={feedbackText}
          onChange={(e) => setFeedbackText(projectId, e.target.value)}
          placeholder="e.g. stronger zooms, remove the part about the sauce"
          rows={2}
          className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Free text adjustments"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedCount === 0 && !feedbackText.trim()}
          className="rounded-md bg-violet-700 px-3 py-1.5 text-xs text-white hover:bg-violet-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label={selectedCount > 0 || feedbackText.trim() ? 'Apply improvements' : 'Select suggestions or enter text to apply'}
        >
          Apply Improvements
        </button>
      </div>
    </div>
  )
}