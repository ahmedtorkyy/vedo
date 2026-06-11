import type { ExportOptions, ExportCodecParams, ExportScaleParams, ExportQuality } from './types'

const QUALITY_DIMS: Record<ExportQuality, { width: number; height: number; crf: number; videoBitrate: string }> = {
  '480p':  { width: 854,  height: 480,  crf: 26, videoBitrate: '800k' },
  '720p':  { width: 1280, height: 720,  crf: 23, videoBitrate: '2500k' },
  '1080p': { width: 1920, height: 1080, crf: 21, videoBitrate: '5000k' },
  '4K':    { width: 3840, height: 2160, crf: 18, videoBitrate: '20000k' },
}

export function getQualityDims(quality: ExportQuality): { width: number; height: number; crf: number; videoBitrate: string } {
  return QUALITY_DIMS[quality]
}

export function buildScaleParams(options: ExportOptions, inputWidth: number, inputHeight: number): ExportScaleParams {
  const dims = QUALITY_DIMS[options.quality]
  let targetW = dims.width
  let targetH = dims.height

  if (options.platform === 'tiktok' || options.platform === 'reels' || options.platform === 'shorts') {
    targetW = 1080
    targetH = 1920
  } else if (options.platform === 'youtube') {
    targetH = dims.height
    targetW = Math.round(targetH * 16 / 9)
  }

  const inputAspect = inputWidth / inputHeight
  const targetAspect = targetW / targetH

  let scaleFilter: string
  let padFilter: string | undefined
  let cropFilter: string | undefined

  if (options.platform === 'tiktok' || options.platform === 'reels' || options.platform === 'shorts') {
    const safeW = Math.round(targetH * inputAspect)
    scaleFilter = `scale=w=${safeW}:h=${targetH}`
    cropFilter = `crop=w=${targetW}:h=${targetH}:x='(in_w-out_w)/2':y=0`
  } else if (options.platform === 'youtube') {
    if (Math.abs(inputAspect - targetAspect) > 0.01) {
      const scaledW = Math.round(targetH * inputAspect)
      scaleFilter = `scale=w=${scaledW}:h=${targetH}`
      if (scaledW < targetW) {
        padFilter = `pad=w=${targetW}:h=${targetH}:x='(ow-iw)/2':y=0:color=black`
      } else {
        cropFilter = `crop=w=${targetW}:h=${targetH}:x='(in_w-out_w)/2':y=0`
      }
    } else {
      scaleFilter = `scale=w=${targetW}:h=${targetH}`
    }
  } else {
    scaleFilter = `scale=w=${targetW}:h=${targetH}:force_original_aspect_ratio=decrease`
    padFilter = `pad=w=${targetW}:h=${targetH}:x='(ow-iw)/2':y='(oh-ih)/2':color=black`
  }

  return { width: targetW, height: targetH, scaleFilter, padFilter, cropFilter }
}

export function buildCodecParams(options: ExportOptions): ExportCodecParams {
  const dims = QUALITY_DIMS[options.quality]

  switch (options.format) {
    case 'webm': {
      const crf = Math.round(dims.crf * 1.5)
      return {
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        videoParams: ['-crf', String(crf), '-b:v', dims.videoBitrate, '-cpu-used', '2', '-deadline', 'realtime'],
        audioParams: ['-b:a', '96k'],
        extension: 'webm',
        muxer: 'webm',
      }
    }
    case 'mkv': {
      return {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoParams: ['-preset', 'fast', '-crf', String(dims.crf)],
        audioParams: ['-b:a', '128k'],
        extension: 'mkv',
        muxer: 'matroska',
      }
    }
    case 'mp4':
    default: {
      return {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoParams: ['-preset', 'fast', '-crf', String(dims.crf)],
        audioParams: ['-b:a', '128k'],
        extension: 'mp4',
        muxer: 'mp4',
      }
    }
  }
}

