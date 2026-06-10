import type { ContentAnalysis, EditPlan, EditDecision, StyleKey, StyleProfile } from './types'
import { getStyleProfile, inferStyle, getPacingMultiplier } from './style-profiles'
import type { RetentionAnalysis } from './retention-engine'

export interface PlannerInput {
  projectId: string
  instructions: string
  selectedStyle: StyleKey | null
  clips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[]
  contentAnalysis: ContentAnalysis
  retention: RetentionAnalysis
  transcription: { start: number; end: number; text: string }[]
}

export function createEditPlan(input: PlannerInput): EditPlan {
  const styleKey = input.selectedStyle ?? inferStyle(input.contentAnalysis.category, input.instructions)
  const style = getStyleProfile(styleKey)
  const pacingMultiplier = getPacingMultiplier(style.pacing)

  const decisions: EditDecision[] = []
  const warnings: string[] = []

  for (const clip of input.clips) {
    if (clip.slot !== 'A') continue

    decisions.push({
      id: `keep-${clip.id}`,
      type: 'keep',
      clipId: clip.id,
      slot: clip.slot,
      startTime: 0,
      endTime: clip.duration,
      parameters: {},
      justification: `Included in timeline`,
    })
  }

  for (const region of input.retention.lowEnergyRegions) {
    const mainClip = input.clips.find(
      (c) => c.slot === 'A' && c.duration >= region.end,
    )
    if (mainClip) {
      decisions.push({
        id: `trim-${region.start.toFixed(1)}-${region.end.toFixed(1)}`,
        type: 'trim',
        clipId: mainClip.id,
        slot: mainClip.slot,
        startTime: region.start,
        endTime: region.end,
        parameters: {},
        justification: `Removed ${(region.duration).toFixed(1)}s of dead air to improve pacing`,
      })
    }
  }

  if (input.contentAnalysis.structure.hook && style.zoom !== 'soft') {
    const hookClip = input.clips.find(
      (c) => c.slot === 'A' && c.duration >= (input.contentAnalysis.structure.hook?.end ?? 0),
    )
    if (hookClip) {
      decisions.push({
        id: `zoom-hook-${hookClip.id}`,
        type: 'zoom',
        clipId: hookClip.id,
        slot: hookClip.slot,
        startTime: input.contentAnalysis.structure.hook.start,
        endTime: input.contentAnalysis.structure.hook.end,
        parameters: { intensity: style.zoom, duration: 1.5 },
        justification: `Subtle zoom on hook to draw viewer attention`,
      })
    }
  }

  for (const moment of input.retention.highValueMoments.slice(0, 5)) {
    if (style.motionIntensity < 0.3) continue
    const clip = input.clips.find(
      (c) => c.slot === 'A' && c.duration >= moment.time + 1,
    )
    if (clip) {
      decisions.push({
        id: `emphasis-${moment.time.toFixed(1)}`,
        type: 'zoom',
        clipId: clip.id,
        slot: clip.slot,
        startTime: Math.max(0, moment.time - 0.3),
        endTime: Math.min(clip.duration, moment.time + 3),
        parameters: { intensity: style.zoom, duration: 2 },
        justification: `Emphasize: ${moment.reason}`,
      })
    }
  }

  for (const region of input.retention.repetitiveRegions) {
    const clip = input.clips.find(
      (c) => c.slot === 'A' && c.duration >= region.end,
    )
    if (clip) {
      decisions.push({
        id: `trim-repeat-${region.start.toFixed(1)}`,
        type: 'trim',
        clipId: clip.id,
        slot: clip.slot,
        startTime: region.start,
        endTime: region.end,
        parameters: {},
        justification: `Removed repetitive content`,
      })
    }
  }

  const overlayClips = input.clips.filter((c) => c.slot === 'B')
  if (overlayClips.length > 0 && style.overlayFrequency !== 'rare') {
    for (const overlay of overlayClips) {
      const targetClip = input.clips.find((c) => c.slot === 'A')
      if (targetClip) {
        decisions.push({
          id: `overlay-${overlay.id}`,
          type: 'overlay',
          clipId: targetClip.id,
          slot: targetClip.slot,
          overlayClipId: overlay.id,
          startTime: 0,
          endTime: Math.min(targetClip.duration, overlay.duration),
          parameters: { position: 'bottom-right', scale: 0.3 },
          justification: `Overlay "${overlay.fileName}" to enhance visual interest`,
        })
      }
    }
  }

  const totalInputDuration = input.clips
    .filter((c) => c.slot === 'A')
    .reduce((sum, c) => sum + c.duration, 0)

  const trimmedDuration = decisions
    .filter((d) => d.type === 'trim')
    .reduce((sum, d) => sum + (d.endTime - d.startTime), 0)

  const estimatedDuration = Math.max(
    5,
    (totalInputDuration - trimmedDuration) * pacingMultiplier,
  )

  if (totalInputDuration < 10) {
    warnings.push('Project is very short — editing options are limited.')
  }
  if (estimatedDuration < totalInputDuration * 0.3) {
    warnings.push('Aggressive trimming may affect natural pacing.')
  }

  return {
    projectId: input.projectId,
    style: styleKey,
    instructions: input.instructions,
    contentAnalysis: input.contentAnalysis,
    decisions,
    estimatedDuration,
    warnings,
  }
}
