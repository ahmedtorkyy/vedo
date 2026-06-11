import type { VideoFrame } from './vision-types'

export interface SamplerConfig {
  targetFps: number
  maxWidth: number
  maxHeight: number
}

const DEFAULT_CONFIG: SamplerConfig = {
  targetFps: 3,
  maxWidth: 256,
  maxHeight: 256,
}

export function createSampler(config: Partial<SamplerConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  async function extractFrames(video: HTMLVideoElement): Promise<VideoFrame[]> {
    const frames: VideoFrame[] = []
    const duration = video.duration
    if (!duration || !isFinite(duration)) return frames

    const interval = 1 / cfg.targetFps
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (!ctx) return frames

    canvas.width = cfg.maxWidth
    canvas.height = cfg.maxHeight

    for (let t = 0; t < duration; t += interval) {
      video.currentTime = t
      await videoReady(video)
      ctx.drawImage(video, 0, 0, cfg.maxWidth, cfg.maxHeight)
      const imageData = ctx.getImageData(0, 0, cfg.maxWidth, cfg.maxHeight)
      frames.push({
        data: imageData.data,
        width: cfg.maxWidth,
        height: cfg.maxHeight,
        timestamp: t,
      })
    }

    return frames
  }

  return { extractFrames, config: cfg }
}

function videoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }
    const onCanPlay = () => {
      video.removeEventListener('canplay', onCanPlay)
      resolve()
    }
    video.addEventListener('canplay', onCanPlay)
  })
}

export function extractMotionScore(prev: Uint8ClampedArray, curr: Uint8ClampedArray): number {
  if (prev.length !== curr.length) return 0
  const len = prev.length
  let diff = 0
  for (let i = 0; i < len; i += 4) {
    diff += Math.abs(prev[i] - curr[i])
    diff += Math.abs(prev[i + 1] - curr[i + 1])
    diff += Math.abs(prev[i + 2] - curr[i + 2])
  }
  return diff / (len / 4) / 255
}
