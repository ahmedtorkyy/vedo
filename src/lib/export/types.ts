export type ExportQuality = '480p' | '720p' | '1080p' | '4K'

export type ExportFormat = 'mp4' | 'webm' | 'mkv'

export type PlatformPreset = 'none' | 'tiktok' | 'reels' | 'shorts' | 'youtube'

export interface ExportOptions {
  quality: ExportQuality
  format: ExportFormat
  platform: PlatformPreset
  burnCaptions: boolean
  captionBackend?: 'drawtext' | 'subtitles'
}

export interface ExportCodecParams {
  videoCodec: string
  audioCodec: string
  videoParams: string[]
  audioParams: string[]
  extension: string
  muxer: string
}

export interface ExportScaleParams {
  width: number
  height: number
  scaleFilter: string
  padFilter?: string
  cropFilter?: string
}
