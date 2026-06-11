import type { EditPlan, Suggestion } from './types'

export function generateSuggestions(plan: EditPlan): Suggestion[] {
  const suggestions: Suggestion[] = []
  const decisions = plan.decisions

  const zoomCount = decisions.filter((d) => d.type === 'zoom').length
  const trimCount = decisions.filter((d) => d.type === 'trim').length
  const overlayCount = decisions.filter((d) => d.type === 'overlay').length
  const reorderCount = decisions.filter((d) => d.type === 'reorder').length
  const lowConfidence = decisions.filter((d) => {
    const conf = d.parameters?.confidence as number | undefined
    return conf !== undefined && conf < 0.4
  }).length

  const totalTrimmed = decisions
    .filter((d) => d.type === 'trim')
    .reduce((sum, d) => sum + (d.endTime - d.startTime), 0)

  if (zoomCount > 0) {
    suggestions.push({
      id: 'strengthen-zooms',
      label: 'Strengthen zoom intensity',
      description: `${zoomCount} zoom${zoomCount > 1 ? 's were' : ' was'} placed. Increase zoom factor for more visual impact.`,
      selected: false,
    })
  }

  if (trimCount > 0 && totalTrimmed > 5) {
    suggestions.push({
      id: 'more-trimming',
      label: 'Trim more low-energy content',
      description: `${totalTrimmed.toFixed(0)}s of content was trimmed. Consider more aggressive trimming for tighter pacing.`,
      selected: false,
    })
  }

  if (overlayCount > 0) {
    suggestions.push({
      id: 'reduce-overlays',
      label: 'Reduce overlay count',
      description: `${overlayCount} overlay${overlayCount > 1 ? 's were' : ' was'} placed. Fewer overlays can improve clarity.`,
      selected: false,
    })
    suggestions.push({
      id: 'adjust-overlay-timing',
      label: 'Shift overlays away from speech',
      description: `${overlayCount} overlay${overlayCount > 1 ? 's' : ''} may overlap with spoken segments. Adjust timing to avoid distraction.`,
      selected: false,
    })
  }

  if (lowConfidence > 0) {
    suggestions.push({
      id: 'review-low-confidence',
      label: 'Review low-confidence decisions',
      description: `${lowConfidence} decision${lowConfidence > 1 ? 's' : ''} ${lowConfidence > 1 ? 'were' : 'was'} made at low-confidence moments. Review and adjust.`,
      selected: false,
    })
  }

  if (reorderCount > 0) {
    suggestions.push({
      id: 'review-reorder',
      label: 'Review clip reordering',
      description: `${reorderCount} clip${reorderCount > 1 ? 's were' : ' was'} reordered. Verify the new sequence maintains narrative flow.`,
      selected: false,
    })
  }

  const pacing = plan.style === 'tiktok' || plan.style === 'shorts' || plan.style === 'reels' || plan.style === 'gaming'
  if (pacing) {
    suggestions.push({
      id: 'increase-pacing',
      label: 'Increase pacing further',
      description: 'Faster cuts and shorter clips for a more energetic feel.',
      selected: false,
    })
  }

  suggestions.push({
    id: 'reduce-warnings',
    label: 'Address plan warnings',
    description: `${plan.warnings.length} warning${plan.warnings.length !== 1 ? 's' : ''} were generated. ${plan.warnings[0] ?? 'Review and resolve them.'}`,
    selected: false,
  })

  return suggestions.slice(0, 6)
}

export function applySelectedSuggestions(
  plan: EditPlan,
  suggestions: Suggestion[],
  feedbackText: string,
): { adjustedInstructions: string; adjustedStyle: string } {
  const selected = suggestions.filter((s) => s.selected)
  const parts: string[] = [plan.instructions]

  for (const s of selected) {
    switch (s.id) {
      case 'strengthen-zooms':
        parts.push('aggressive zoom on key moments')
        break
      case 'more-trimming':
        parts.push('aggressive silence removal')
        break
      case 'reduce-overlays':
        parts.push('minimal overlays')
        break
      case 'adjust-overlay-timing':
        parts.push('overlays during pauses only')
        break
      case 'review-low-confidence':
        parts.push('emphasize high-confidence moments')
        break
      case 'review-reorder':
        parts.push('maintain narrative flow')
        break
      case 'increase-pacing':
        parts.push('faster pacing')
        break
      case 'reduce-warnings':
        parts.push('resolve pacing and flow issues')
        break
    }
  }

  if (feedbackText.trim()) {
    parts.push(feedbackText.trim())
  }

  return {
    adjustedInstructions: parts.filter(Boolean).join('. ') + '.',
    adjustedStyle: plan.style,
  }
}