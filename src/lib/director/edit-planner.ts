import type {
  ContentAnalysis, EditPlan, EditDecision, StyleKey, StyleProfile,
  InstructionOverrides, OverlayDecision,
} from './types'
import { getStyleProfile, inferStyle, getPacingMultiplier } from './style-profiles'
import type { RetentionAnalysis } from './retention-engine'
import { parseInstructions, mergeOverrides } from './instruction-parser'
import { determineOverlayDecisions } from './overlay-engine'

export interface PlannerInput {
  projectId: string
  instructions: string
  selectedStyle: StyleKey | null
  clips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[]
  contentAnalysis: ContentAnalysis
  retention: RetentionAnalysis
  transcription: { start: number; end: number; text: string }[]
  clipOffsets?: { clipId: string; offsetStart: number; offsetEnd: number }[]
}

function getClipAtTime(
  clips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[],
  clipOffsets: { clipId: string; offsetStart: number; offsetEnd: number }[] | undefined,
  time: number,
): { id: string; fileName: string; duration: number; slot: 'A' | 'B' } | null {
  if (!clipOffsets || clipOffsets.length === 0) {
    return clips.find((c) => c.slot === 'A' && c.duration >= time) ?? null
  }

  for (const offset of clipOffsets) {
    if (time >= offset.offsetStart && time < offset.offsetEnd) {
      return clips.find((c) => c.id === offset.clipId) ?? null
    }
  }
  return clips.find((c) => c.slot === 'A') ?? null
}

export function createEditPlan(input: PlannerInput): EditPlan {
  const overrides: InstructionOverrides = parseInstructions(input.instructions)
  const styleKey = input.selectedStyle ?? inferStyle(input.contentAnalysis.category, input.instructions)
  const baseStyle = getStyleProfile(styleKey)

  const style: StyleProfile = {
    zoom: mergeOverrides(baseStyle.zoom, overrides.zoom),
    transitions: mergeOverrides(baseStyle.transitions, overrides.transitions),
    effects: mergeOverrides(baseStyle.effects, overrides.effects),
    pacing: mergeOverrides(baseStyle.pacing, overrides.pacing),
    overlayFrequency: mergeOverrides(baseStyle.overlayFrequency, overrides.overlayFrequency),
    motionIntensity: baseStyle.motionIntensity,
    transitionPreference: baseStyle.transitionPreference,
  }

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
    const targetClip = getClipAtTime(input.clips, input.clipOffsets, region.start)
    if (targetClip) {
      const localStart = region.start - (input.clipOffsets?.find((o) => o.clipId === targetClip.id)?.offsetStart ?? 0)
      const localEnd = region.end - (input.clipOffsets?.find((o) => o.clipId === targetClip.id)?.offsetStart ?? 0)
      decisions.push({
        id: `trim-${region.start.toFixed(1)}-${region.end.toFixed(1)}`,
        type: 'trim',
        clipId: targetClip.id,
        slot: targetClip.slot,
        startTime: Math.max(0, localStart),
        endTime: Math.min(targetClip.duration, localEnd),
        parameters: {},
        justification: `Removed ${(region.duration).toFixed(1)}s of dead air to improve pacing`,
      })
    }
  }

  if (input.contentAnalysis.structure.hook && style.zoom !== 'soft') {
    const hookStart = input.contentAnalysis.structure.hook.start
    const hookClip = getClipAtTime(input.clips, input.clipOffsets, hookStart)
    if (hookClip) {
      const hookLocalStart = hookStart - (input.clipOffsets?.find((o) => o.clipId === hookClip.id)?.offsetStart ?? 0)
      const hookLocalEnd = input.contentAnalysis.structure.hook.end - (input.clipOffsets?.find((o) => o.clipId === hookClip.id)?.offsetStart ?? 0)
      decisions.push({
        id: `zoom-hook-${hookClip.id}`,
        type: 'zoom',
        clipId: hookClip.id,
        slot: hookClip.slot,
        startTime: Math.max(0, hookLocalStart),
        endTime: Math.min(hookClip.duration, hookLocalEnd),
        parameters: { intensity: style.zoom, duration: 1.5 },
        justification: `Subtle zoom on hook to draw viewer attention`,
      })
    }
  }

  for (const moment of input.retention.highValueMoments.slice(0, 5)) {
    if (style.motionIntensity < 0.3) continue
    const momentClip = getClipAtTime(input.clips, input.clipOffsets, moment.time)
    if (momentClip) {
      const momentLocalStart = moment.time - (input.clipOffsets?.find((o) => o.clipId === momentClip.id)?.offsetStart ?? 0)
      decisions.push({
        id: `emphasis-${moment.time.toFixed(1)}`,
        type: 'zoom',
        clipId: momentClip.id,
        slot: momentClip.slot,
        startTime: Math.max(0, momentLocalStart - 0.3),
        endTime: Math.min(momentClip.duration, momentLocalStart + 3),
        parameters: { intensity: style.zoom, duration: 2 },
        justification: `Emphasize: ${moment.reason}`,
      })
    }
  }

  for (const region of input.retention.repetitiveRegions) {
    const targetClip = getClipAtTime(input.clips, input.clipOffsets, region.start)
    if (targetClip) {
      const localStart = region.start - (input.clipOffsets?.find((o) => o.clipId === targetClip.id)?.offsetStart ?? 0)
      const localEnd = region.end - (input.clipOffsets?.find((o) => o.clipId === targetClip.id)?.offsetStart ?? 0)
      decisions.push({
        id: `trim-repeat-${region.start.toFixed(1)}`,
        type: 'trim',
        clipId: targetClip.id,
        slot: targetClip.slot,
        startTime: Math.max(0, localStart),
        endTime: Math.min(targetClip.duration, localEnd),
        parameters: {},
        justification: `Removed repetitive content`,
      })
    }
  }

  const overlayClips = input.clips.filter((c) => c.slot === 'B')
  const mainClips = input.clips.filter((c) => c.slot === 'A')

  if (overlayClips.length > 0 && style.overlayFrequency !== 'rare') {
    for (const overlay of overlayClips) {
      const overlayDecisions: OverlayDecision[] = determineOverlayDecisions({
        overlayClip: overlay,
        mainClips,
        contentAnalysis: input.contentAnalysis,
        segments: input.transcription,
        timelineDuration: input.clipOffsets
          ? input.clipOffsets[input.clipOffsets.length - 1]?.offsetEnd ?? 0
          : mainClips.reduce((sum, c) => sum + c.duration, 0),
        style,
        overrides,
      })

      for (const od of overlayDecisions) {
        const targetClip = mainClips.find((c) => c.id === od.targetClipId)
        if (targetClip) {
          decisions.push({
            id: `overlay-${od.overlayClipId}-${od.startTime.toFixed(1)}`,
            type: 'overlay',
            clipId: targetClip.id,
            slot: targetClip.slot,
            overlayClipId: od.overlayClipId,
            startTime: od.startTime,
            endTime: od.endTime,
            parameters: {
              placement: od.placement,
              scale: od.scale,
              opacity: od.opacity,
            },
            justification: od.reason,
          })
        } else {
          const firstMain = mainClips[0]
          if (firstMain) {
            decisions.push({
              id: `overlay-${od.overlayClipId}-${od.startTime.toFixed(1)}`,
              type: 'overlay',
              clipId: firstMain.id,
              slot: firstMain.slot,
              overlayClipId: od.overlayClipId,
              startTime: od.startTime,
              endTime: od.endTime,
              parameters: {
                placement: od.placement,
                scale: od.scale,
                opacity: od.opacity,
              },
              justification: od.reason,
            })
          }
        }
      }
    }
  }

  const totalInputDuration = mainClips.reduce((sum, c) => sum + c.duration, 0)

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

  if (overrides.parsedDirectives.length > 0) {
    const directiveList = overrides.parsedDirectives
      .map((d) => `${d.type}: ${d.value}`)
      .join(', ')
    warnings.push(`Applied user directives: ${directiveList}`)
  }

  if (input.clipOffsets && input.clipOffsets.length > 1) {
    warnings.push(`Editing across ${input.clipOffsets.length} clips in Slot A (combined timeline)`)
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
