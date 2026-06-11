import { describe, it, expect, beforeAll } from 'vitest'
import { decodeWavToF32 } from './transcription-engine'

const SAMPLE_RATE = 16000
const TONE_FREQ = 440
const DURATION_SEC = 0.25

function generateSineWav(): Uint8Array {
  const numSamples = Math.floor(SAMPLE_RATE * DURATION_SEC)
  const bytesPerSample = 2
  const numChannels = 1
  const dataSize = numSamples * numChannels * bytesPerSample
  const fmtSize = 16
  const fileSize = 36 + dataSize

  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  let offset = 0

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i))
  }

  writeStr('RIFF')
  view.setUint32(offset, fileSize, true); offset += 4
  writeStr('WAVE')
  writeStr('fmt ')
  view.setUint32(offset, fmtSize, true); offset += 4
  view.setUint16(offset, 1, true); offset += 2
  view.setUint16(offset, numChannels, true); offset += 2
  view.setUint32(offset, SAMPLE_RATE, true); offset += 4
  view.setUint32(offset, SAMPLE_RATE * numChannels * bytesPerSample, true); offset += 4
  view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2
  writeStr('data')
  view.setUint32(offset, dataSize, true); offset += 4

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE
    const sample = Math.sin(2 * Math.PI * TONE_FREQ * t) * 0.7
    view.setInt16(offset, sample * 32767, true); offset += 2
  }

  return new Uint8Array(buf)
}

let sineWav: Uint8Array

beforeAll(() => {
  sineWav = generateSineWav()
})

function generateSineWavWithListChunk(): Uint8Array {
  // Mirrors real FFmpeg output: RIFF -> fmt -> LIST(INFO) -> data.
  // This exact layout broke the previous chunk walker (off-by-one skipped the
  // LIST chunk boundary and never found 'data'). Regression case for that bug.
  const base = generateSineWav()
  const listPayload = 'INFOISFT' // minimal LIST/INFO content
  const listSize = listPayload.length + 6 // + software string 'vedo\0' padded
  const listChunkTotal = 8 + listSize
  const out = new ArrayBuffer(base.byteLength + listChunkTotal)
  const view = new DataView(out)
  const src = new DataView(base.buffer, base.byteOffset, base.byteLength)

  // copy RIFF header + fmt chunk (bytes 0..35)
  for (let i = 0; i < 36; i++) view.setUint8(i, src.getUint8(i))
  // patch RIFF size
  view.setUint32(4, src.getUint32(4, true) + listChunkTotal, true)

  // write LIST chunk at 36
  let o = 36
  const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)) }
  writeStr('LIST')
  view.setUint32(o, listSize, true); o += 4
  writeStr(listPayload)
  writeStr('vedo\0\0')

  // copy data chunk (starts at 36 in the canonical file)
  for (let i = 36; i < base.byteLength; i++) view.setUint8(o++, src.getUint8(i))

  return new Uint8Array(out)
}

describe('decodeWavToF32', () => {
  it('decodes a known sine wave and returns nonzero samples at correct sample rate', () => {
    const result = decodeWavToF32(sineWav.buffer as ArrayBuffer)
    expect(result).not.toBeNull()
    expect(result!.sampleRate).toBe(SAMPLE_RATE)
    expect(result!.audio.length).toBeGreaterThan(0)
    const maxAbs = Math.max(...result!.audio.map(Math.abs))
    expect(maxAbs).toBeGreaterThan(0.01)
  })

  it('decodes to expected frame count', () => {
    const result = decodeWavToF32(sineWav.buffer as ArrayBuffer)
    const expectedFrames = Math.floor(SAMPLE_RATE * DURATION_SEC)
    expect(result!.audio.length).toBe(expectedFrames)
  })

  it('returns null for non-WAV data', () => {
    const garbage = new Uint8Array(100)
    expect(decodeWavToF32(garbage.buffer as ArrayBuffer)).toBeNull()
  })

  it('decodes FFmpeg-style WAV with a LIST chunk before data (regression)', () => {
    const wav = generateSineWavWithListChunk()
    const result = decodeWavToF32(wav.buffer as ArrayBuffer)
    expect(result).not.toBeNull()
    expect(result!.sampleRate).toBe(SAMPLE_RATE)
    expect(result!.audio.length).toBe(Math.floor(SAMPLE_RATE * DURATION_SEC))
    const maxAbs = Math.max(...result!.audio.map(Math.abs))
    expect(maxAbs).toBeGreaterThan(0.01)
  })
})
