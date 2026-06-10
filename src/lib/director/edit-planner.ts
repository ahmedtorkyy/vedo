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

export function getClipAtTime(
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
  return null
}

export function globalToLocal(
  globalTime: number,
  clipId: string,
  clipOffsets: { clipId: string; offsetStart: number; offsetEnd: number }[] | undefined,
): number {
  const offset = clipOffsets?.find((o) => o.clipId === clipId)?.offsetStart ?? 0
  return Math.max(0, globalTime - offset)
}

export function splitRegionAcrossClips(
  globalStart: number,
  globalEnd: number,
  clips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[],
  clipOffsets: { clipId: string; offsetStart: number; offsetEnd: number }[] | undefined,
): { clipId: string; localStart: number; localEnd: number }[] {
  if (!clipOffsets || clipOffsets.length === 0) {
    return []
  }

  const result: { clipId: string; localStart: number; localEnd: number }[] = []

  for (const offset of clipOffsets) {
    const regionStartInClip = Math.max(globalStart, offset.offsetStart)
    const regionEndInClip = Math.min(globalEnd, offset.offsetEnd)

    if (regionStartInClip < regionEndInClip) {
      result.push({
        clipId: offset.clipId,
        localStart: regionStartInClip - offset.offsetStart,
        localEnd: regionEndInClip - offset.offsetStart,
      })
    }
  }

  return result
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
    const splits = splitRegionAcrossClips(region.start, region.end, input.clips, input.clipOffsets)
    for (const split of splits) {
      decisions.push({
        id: `trim-${split.clipId}-${split.localStart.toFixed(1)}-${split.localEnd.toFixed(1)}`,
        type: 'trim',
        clipId: split.clipId,
        slot: 'A',
        startTime: split.localStart,
        endTime: split.localEnd,
        parameters: {},
        justification: `Removed ${(split.localEnd - split.localStart).toFixed(1)}s of dead air to improve pacing`,
      })
    }
  }

  if (input.contentAnalysis.structure.hook && style.zoom !== 'soft') {
    const hookStart = input.contentAnalysis.structure.hook.start
    const hookEnd = input.contentAnalysis.structure.hook.end
    const hookSplits = splitRegionAcrossClips(hookStart, hookEnd, input.clips, input.clipOffsets)

    if (hookSplits.length > 0) {
      for (const split of hookSplits) {
        const actualDuration = Math.min(
          split.localEnd - split.localStart,
          1.5,
        )
        decisions.push({
          id: `zoom-hook-${split.clipId}-${split.localStart.toFixed(1)}`,
          type: 'zoom',
          clipId: split.clipId,
          slot: 'A',
          startTime: split.localStart,
          endTime: split.localStart + actualDuration,
          parameters: { intensity: style.zoom, duration: actualDuration },
          justification: `Subtle zoom on hook to draw viewer attention`,
        })
      }
    }
  }

  for (const moment of input.retention.highValueMoments.slice(0, 5)) {
    if (style.motionIntensity < 0.3) continue
    const momentClip = getClipAtTime(input.clips, input.clipOffsets, moment.time)
    if (momentClip) {
      const localStart = globalToLocal(moment.time, momentClip.id, input.clipOffsets)
      const clipDuration = momentClip.duration
      decisions.push({
        id: `emphasis-${moment.time.toFixed(1)}`,
        type: 'zoom',
        clipId: momentClip.id,
        slot: 'A',
        startTime: Math.max(0, localStart - 0.3),
        endTime: Math.min(clipDuration, localStart + 3),
        parameters: { intensity: style.zoom, duration: 2 },
        justification: `Emphasize: ${moment.reason}`,
      })
    }
  }

  for (const region of input.retention.repetitiveRegions) {
    const splits = splitRegionAcrossClips(region.start, region.end, input.clips, input.clipOffsets)
    for (const split of splits) {
      decisions.push({
        id: `trim-repeat-${split.clipId}-${split.localStart.toFixed(1)}`,
        type: 'trim',
        clipId: split.clipId,
        slot: 'A',
        startTime: split.localStart,
        endTime: split.localEnd,
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
        const splits = splitRegionAcrossClips(od.startTime, od.endTime, input.clips, input.clipOffsets)
        for (const split of splits) {
          decisions.push({
            id: `overlay-${od.overlayClipId}-${split.localStart.toFixed(1)}-${split.clipId}`,
            type: 'overlay',
            clipId: split.clipId,
            slot: 'A',
            overlayClipId: od.overlayClipId,
            startTime: split.localStart,
            endTime: split.localEnd,
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
