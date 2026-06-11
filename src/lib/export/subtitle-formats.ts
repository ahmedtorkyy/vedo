import type { SegmentWithTiming } from './ass-generator'

function toSrtTs(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ms = Math.round((s % 1) * 1000)
  const sec = Math.floor(s)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function toVttTs(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ms = Math.round((s % 1) * 1000)
  const sec = Math.floor(s)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function buildSrt(segments: SegmentWithTiming[]): string {
  let srt = ''
  let i = 1
  for (const seg of segments) {
    if (!seg.text.trim()) continue
    const start = seg.stitchedStart >= 0 ? seg.stitchedStart : seg.start
    const end = seg.stitchedEnd >= 0 ? seg.stitchedEnd : seg.end
    if (end <= start) continue
    srt += `${i}\n`
    srt += `${toSrtTs(start)} --> ${toSrtTs(end)}\n`
    srt += `${seg.text.trim()}\n\n`
    i++
  }
  return srt
}

export function buildVtt(segments: SegmentWithTiming[]): string {
  let vtt = 'WEBVTT\n\n'
  for (const seg of segments) {
    if (!seg.text.trim()) continue
    const start = seg.stitchedStart >= 0 ? seg.stitchedStart : seg.start
    const end = seg.stitchedEnd >= 0 ? seg.stitchedEnd : seg.end
    if (end <= start) continue
    vtt += `${toVttTs(start)} --> ${toVttTs(end)}\n`
    vtt += `${seg.text.trim()}\n\n`
  }
  return vtt
}
