import type { SilenceSegment, SmartCutOptions } from '../../types'

const AGGRESSIVENESS_MAP: Record<string, { threshold: number; minDuration: number }> = {
  low: { threshold: 0.005, minDuration: 1.0 },
  medium: { threshold: 0.01, minDuration: 0.5 },
  high: { threshold: 0.02, minDuration: 0.3 },
}

export function getEffectiveOptions(options: SmartCutOptions): { threshold: number; minDuration: number } {
  const preset = AGGRESSIVENESS_MAP[options.aggressiveness] ?? AGGRESSIVENESS_MAP.medium
  return {
    threshold: options.customThreshold ?? preset.threshold,
    minDuration: options.customMinDuration ?? preset.minDuration,
  }
}

export function filterSilenceSegments(
  segments: SilenceSegment[],
  options: SmartCutOptions,
): SilenceSegment[] {
  const { threshold: _t, minDuration } = getEffectiveOptions(options)
  return segments.filter((s) => s.duration >= minDuration)
}

export function generateTrimFilters(
  segments: SilenceSegment[],
  totalDuration: number,
): { audioFilter: string; videoFilter: string } | null {
  const kept: { start: number; end: number }[] = []
  let cursor = 0

  for (const seg of segments) {
    if (seg.start > cursor) {
      kept.push({ start: cursor, end: seg.start })
    }
    cursor = seg.end
  }

  if (cursor < totalDuration) {
    kept.push({ start: cursor, end: totalDuration })
  }

  if (kept.length === 0) return null

  const selectExpr = kept
    .map((k, _i) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`)
    .join('+')

  const audioFilter = `aselect='${selectExpr}',asetpts=N/SR/TB`
  const videoFilter = `select='${selectExpr}',setpts=N/FRAME_RATE/TB`

  return { audioFilter, videoFilter }
}

export function buildTrimCommand(
  segments: SilenceSegment[],
  totalDuration: number,
  inputName: string,
  outputName: string,
): string[] {
  const filters = generateTrimFilters(segments, totalDuration)
  if (!filters) return []

  return [
    '-i', inputName,
    '-filter_complex',
    `[0:v]${filters.videoFilter}[v];[0:a]${filters.audioFilter}[a]`,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'mp4',
    outputName,
  ]
}
