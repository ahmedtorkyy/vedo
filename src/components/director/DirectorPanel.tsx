import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useClipStore } from '../../lib/state'
import { useDirector } from '../../hooks/useDirector'
import { STYLE_LABELS, inferStyle, parseInstructions, generateSuggestions, useDirectorStore } from '../../lib/director'
import type { StyleKey } from '../../lib/director'
import { useAriaAnnouncer } from '../accessibility/AriaAnnouncer'
import { ImprovementReview } from './ImprovementReview'

interface DirectorPanelProps {
  projectId: string
}

export function DirectorPanel({ projectId }: DirectorPanelProps) {
  const {
    instructions, selectedStyle, status, plan, error,
    setInstructions, setStyle, generatePlan, executePlan,
  } = useDirector(projectId)
  const { announce } = useAriaAnnouncer()

  const projectClips = useClipStore((s) => s.clips[projectId])
  const clipsA = useMemo(() => projectClips?.A ?? [], [projectClips])
  const clipsB = useMemo(() => projectClips?.B ?? [], [projectClips])

  const isBusy = status === 'analyzing' || status === 'planning' || status === 'executing'

  const inferredStyle = useMemo(() => inferStyle('general', instructions), [instructions])

  const parsedDirectives = useMemo(() => {
    if (!instructions.trim()) return []
    const overrides = parseInstructions(instructions)
    return overrides.parsedDirectives
  }, [instructions])

  const handleGenerate = useCallback(() => {
    generatePlan()
    announce('Analyzing project and generating edit plan')
  }, [generatePlan, announce])

  const handleExecute = useCallback(() => {
    executePlan()
    announce('Executing editing plan')
  }, [executePlan, announce])

  const handleImprovementApply = useCallback((adjustedInstructions: string, adjustedStyle: string) => {
    setInstructions(adjustedInstructions)
    setStyle(adjustedStyle as StyleKey)
    generatePlan()
  }, [setInstructions, setStyle, generatePlan])

  const planVersionRef = useRef(0)

  useEffect(() => {
    if (status === 'ready' && plan) {
      planVersionRef.current++
      const sg = generateSuggestions(plan)
      useDirectorStore.getState().setSuggestions(projectId, sg)
      useDirectorStore.getState().setFeedbackText(projectId, '')
    }
  }, [status, plan, projectId])

  return (
    <section role="region" aria-label="AI Director" className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">AI Director</h2>

      <div className="flex gap-3 text-[10px] text-gray-500">
        <span>{clipsA.length} main clip{clipsA.length !== 1 ? 's' : ''} (Slot A)</span>
        <span>&middot;</span>
        <span>{clipsB.length} overlay clip{clipsB.length !== 1 ? 's' : ''} (Slot B)</span>
      </div>

      <div className="space-y-1">
        <label htmlFor="director-instructions" className="text-xs text-gray-500">
          What kind of video do you want to create?
        </label>
        <textarea
          id="director-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Make a fast-paced YouTube video with dynamic zooms, keep the best moments, and add relevant overlays..."
          rows={4}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Editing instructions for AI Director"
        />
        {instructions.length > 0 && inferredStyle !== selectedStyle && (
          <p className="text-[10px] text-gray-500">
            Suggested style based on your instructions: <span className="text-sky-400">{STYLE_LABELS[inferredStyle]}</span>
          </p>
        )}
        {parsedDirectives.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {parsedDirectives.map((d, i) => (
              <span key={i} className="rounded bg-violet-900/40 px-1.5 py-0.5 text-[9px] text-violet-300">
                {d.type.replace(/-/g, ' ')}: {d.value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="director-style" className="text-xs text-gray-500">Style</label>
        <select
          id="director-style"
          value={selectedStyle}
          onChange={(e) => setStyle(e.target.value as StyleKey)}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Select editing style"
        >
          {(Object.entries(STYLE_LABELS) as [StyleKey, string][]).map(([key, label]) => (
            <option key={key} value={key}>
              {label}{key === inferredStyle && instructions.length > 0 ? ' (suggested)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isBusy}
          className="rounded-md bg-violet-700 px-4 py-2 text-xs text-white hover:bg-violet-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label={isBusy ? 'Generating edit plan...' : 'Analyze and generate edit plan'}
        >
          {status === 'analyzing' && 'Analyzing content...'}
          {status === 'planning' && 'Planning edits...'}
          {status === 'executing' && 'Executing...'}
          {!isBusy && (plan ? 'Re-analyze' : 'Generate Edit Plan')}
        </button>

        {plan && status === 'ready' && (
          <button
            type="button"
            onClick={handleExecute}
            className="rounded-md bg-emerald-700 px-4 py-2 text-xs text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Execute editing plan"
          >
            Execute Plan
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {plan && (
        <div className="space-y-3 rounded-md border border-gray-700 bg-gray-800/50 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-300">Edit Plan</h3>
            <div className="flex gap-2 text-[10px] text-gray-500">
              <span>{STYLE_LABELS[plan.style]}</span>
              <span>&middot;</span>
              <span>~{plan.estimatedDuration.toFixed(0)}s estimated</span>
            </div>
          </div>

          {plan.warnings.length > 0 && (
            <div className="space-y-0.5">
              {plan.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-400">{w}</p>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>Topic: {plan.contentAnalysis.topic}</span>
              <span>Category: {plan.contentAnalysis.category}</span>
            </div>
            {plan.contentAnalysis.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {plan.contentAnalysis.keywords.slice(0, 8).map((kw, i) => (
                  <span key={i} className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">{kw}</span>
                ))}
              </div>
            )}
            {plan.contentAnalysis.keySubjects.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[9px] text-gray-500">Subjects:</span>
                {plan.contentAnalysis.keySubjects.slice(0, 5).map((s, i) => (
                  <span key={i} className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[9px] text-sky-300">{s}</span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-0.5" role="list" aria-label="Editing decisions">
            <span className="text-[10px] font-medium text-gray-500">
              {plan.decisions.length} decisions
            </span>
            {plan.decisions.map((d) => (
              <div
                key={d.id}
                role="listitem"
                className="flex items-start gap-2 rounded bg-gray-800 px-2 py-1"
              >
                <span className={`mt-0.5 shrink-0 rounded px-1 text-[9px] font-medium ${
                  d.type === 'trim' ? 'bg-rose-900/50 text-rose-300' :
                  d.type === 'zoom' ? 'bg-sky-900/50 text-sky-300' :
                  d.type === 'overlay' ? 'bg-emerald-900/50 text-emerald-300' :
                  d.type === 'keep' ? 'bg-gray-700/50 text-gray-400' :
                  'bg-amber-900/50 text-amber-300'
                }`}>
                  {d.type}
                </span>
                <span className="text-[10px] text-gray-400">{d.justification}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'done' && (
        <div role="status" className="rounded-md bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300">
          Edit plan executed successfully.
        </div>
      )}

      {status === 'done' && plan && (
        <ImprovementReview
          projectId={projectId}
          onApply={handleImprovementApply}
        />
      )}
    </section>
  )
}
