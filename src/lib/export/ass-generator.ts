import type { TranscriptionSegment } from '../../types'

export interface DrawtextResult {
  filters: string[]
  textFiles: { name: string; content: string }[]
}

const LATIN_FONT = 'noto-sans.ttf'
const ARABIC_FONT = 'noto-sans-arabic.ttf'

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
}

function fontForText(text: string): string {
  return hasArabic(text) ? ARABIC_FONT : LATIN_FONT
}

/**
 * Wrap caption text so no line exceeds the safe drawable width.
 * drawtext does not wrap automatically — long transcript lines render wider
 * than the frame and get clipped at both edges. Newlines in the textfile
 * render as centered line breaks. Wrapping splits on spaces only, which is
 * safe for Arabic shaping (letter joining never crosses a space).
 */
export function wrapCaptionText(text: string, videoWidth: number, fontSize: number): string {
  const usable = videoWidth * 0.9
  const avgGlyph = fontSize * 0.55
  const maxChars = Math.max(8, Math.floor(usable / avgGlyph))

  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = w
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

export function buildDrawtextFilters(
  segments: SegmentWithTiming[],
  videoWidth: number,
  videoHeight: number,
): DrawtextResult {
  const fontSize = Math.max(16, Math.round(videoHeight / 30))
  const borderWidth = Math.max(1, Math.round(fontSize / 12))
  const yPos = `h-text_h-${Math.round(videoHeight * 0.06)}`

  const filters: string[] = []
  const textFiles: { name: string; content: string }[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.text.trim() || seg.stitchedEnd <= seg.stitchedStart) continue
    const enable = `between(t,${seg.stitchedStart.toFixed(3)},${seg.stitchedEnd.toFixed(3)})`
    const filename = `caption_${i}.txt`
    const wrapped = wrapCaptionText(seg.text.trim(), videoWidth, fontSize)
    filters.push(
      `drawtext=textfile=${filename}:fontfile=${fontForText(seg.text.trim())}:fontsize=${fontSize}:fontcolor=white:borderw=${borderWidth}:bordercolor=black:x=(w-text_w)/2:y=${yPos}:line_spacing=${Math.round(fontSize * 0.25)}:enable='${enable}'`
    )
    textFiles.push({ name: filename, content: wrapped })
  }

  return { filters, textFiles }
}

export interface SubtitleResult {
  filter: string
  assFiles: { name: string; content: string }[]
}

export function buildSubtitleFilter(
  clipId: string,
  segments: SegmentWithTiming[],
  videoWidth: number,
  videoHeight: number,
): SubtitleResult {
  const assFilename = `subs_${clipId.replace(/[^a-zA-Z0-9._-]/g, '_')}.ass`
  const content = buildAssContent(segments, videoWidth, videoHeight)
  return {
    filter: `subtitles=${assFilename}:fontsdir=/`,
    assFiles: [{ name: assFilename, content }],
  }
}

export interface SegmentWithTiming extends TranscriptionSegment {
  stitchedStart: number
  stitchedEnd: number
}

/**
 * Convert seconds to ASS time format H:MM:SS.cc
 */
function toAssTs(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const cs = Math.round((s % 1) * 100)
  const sec = Math.floor(s)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function escapeAssText(text: string): string {
  return text
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N')
}

/**
 * Build an ASS subtitle file from transcribed segments that have been
 * mapped through stitched-timeline offsets and trim adjustments.
 */
export function buildAssContent(
  segments: SegmentWithTiming[],
  videoWidth: number,
  videoHeight: number,
): string {
  const fontSize = Math.max(16, Math.round(videoHeight / 30))
  const marginV = Math.round(videoHeight * 0.06)
  const marginL = Math.round(videoWidth * 0.04)
  const marginR = marginL

  let ass = '[Script Info]\n'
  ass += 'ScriptType: v4.00+\n'
  ass += `PlayResX: ${videoWidth}\n`
  ass += `PlayResY: ${videoHeight}\n`
  ass += 'ScaledBorderAndShadow: yes\n'
  ass += '\n'

  ass += '[V4+ Styles]\n'
  ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
  ass += `Style: Default,Noto Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,${marginL},${marginR},${marginV},1\n`
  ass += '\n'

  ass += '[Events]\n'
  ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'

  for (const seg of segments) {
    if (!seg.text.trim()) continue
    const start = seg.stitchedStart >= 0 ? seg.stitchedStart : seg.start
    const end = seg.stitchedEnd >= 0 ? seg.stitchedEnd : seg.end
    if (end <= start) continue
    ass += `Dialogue: 0,${toAssTs(start)},${toAssTs(end)},Default,,0,0,0,,${escapeAssText(seg.text.trim())}\n`
  }

  return ass
}

/**
 * Map per-clip caption segments through cumulative stitched offset.
 * Each clip's segment timestamps are relative to that clip's original timeline.
 */
export function mapSegmentsThroughOffset(
  segments: TranscriptionSegment[],
  clipOffset: number,
): SegmentWithTiming[] {
  return segments.map((seg) => ({
    ...seg,
    stitchedStart: seg.start + clipOffset,
    stitchedEnd: seg.end + clipOffset,
  }))
}

/**
 * Build the list of kept intervals (parts that remain after removing trims).
 */
export function buildKeptIntervals(
  trimSegments: { start: number; end: number }[],
  originalDuration: number,
): { start: number; end: number }[] {
  const sorted = [...trimSegments].sort((a, b) => a.start - b.start)
  const kept: { start: number; end: number }[] = []
  let cursor = 0
  for (const ts of sorted) {
    if (ts.start > cursor) {
      kept.push({ start: cursor, end: ts.start })
    }
    cursor = Math.max(cursor, ts.end)
  }
  if (cursor < originalDuration) {
    kept.push({ start: cursor, end: originalDuration })
  }
  return kept
}

/**
 * Map per-clip caption segments through both stitched offset and trims.
 * Trims remove sections from the clip; segment timestamps are compressed
 * to skip removed regions.
 */
export function mapSegmentsThroughTrims(
  segments: TranscriptionSegment[],
  clipOffset: number,
  trimSegments: { start: number; end: number }[],
  originalDuration: number,
): SegmentWithTiming[] {
  if (trimSegments.length === 0) {
    return mapSegmentsThroughOffset(segments, clipOffset)
  }

  const kept = buildKeptIntervals(trimSegments, originalDuration)
  if (kept.length === 0) return []

  // Precompute cumulative kept duration up to each kept interval
  const keptStartOffset: number[] = []
  let accum = 0
  for (const k of kept) {
    keptStartOffset.push(accum)
    accum += k.end - k.start
  }

  return segments.map((seg) => {
    const mid = (seg.start + seg.end) / 2
    let keptIdx = -1
    for (let i = 0; i < kept.length; i++) {
      if (mid >= kept[i].start && mid <= kept[i].end) {
        keptIdx = i
        break
      }
    }
    if (keptIdx === -1) {
      return { ...seg, stitchedStart: -1, stitchedEnd: -1 }
    }

    const ki = kept[keptIdx]
    const stitchedStart = keptStartOffset[keptIdx] + (seg.start - ki.start) + clipOffset
    const stitchedEnd = keptStartOffset[keptIdx] + (seg.end - ki.start) + clipOffset
    return { ...seg, stitchedStart, stitchedEnd }
  }).filter((s): s is SegmentWithTiming => s.stitchedStart >= 0 && s.stitchedEnd > s.stitchedStart)
}
