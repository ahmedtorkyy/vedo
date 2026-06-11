export type StyleKey =
  | 'professional' | 'cinematic' | 'documentary' | 'educational'
  | 'corporate' | 'luxury' | 'podcast' | 'vlog'
  | 'food-review' | 'tech-review' | 'product-review' | 'general-review'
  | 'gaming' | 'tiktok' | 'shorts' | 'reels'

export type ZoomLevel = 'soft' | 'medium' | 'dynamic' | 'aggressive'
export type TransitionLevel = 'minimal' | 'light' | 'dynamic' | 'heavy'
export type EffectsLevel = 'subtle' | 'balanced' | 'strong'
export type PacingLevel = 'slow' | 'moderate' | 'fast' | 'dynamic'
export type OverlayFrequency = 'rare' | 'moderate' | 'frequent'

export interface StyleProfile {
  zoom: ZoomLevel
  transitions: TransitionLevel
  effects: EffectsLevel
  pacing: PacingLevel
  overlayFrequency: OverlayFrequency
  motionIntensity: number
  transitionPreference: string
}

export interface ContentAnalysis {
  topic: string
  category: string
  keywords: string[]
  structure: {
    hook: { start: number; end: number; confidence: number } | null
    setup: { start: number; end: number } | null
    mainContent: { start: number; end: number } | null
    conclusion: { start: number; end: number } | null
  }
  importantMoments: { time: number; description: string; confidence: number }[]
  emotionalMoments: { time: number; emotion: string; intensity: number }[]
  keySubjects: string[]
  keyObjects: string[]
}

export interface EditDecision {
  id: string
  type: 'trim' | 'zoom' | 'transition' | 'overlay' | 'speed' | 'reorder' | 'keep'
  clipId: string
  slot: 'A' | 'B'
  startTime: number
  endTime: number
  parameters: Record<string, unknown>
  justification: string
  overlayClipId?: string
}

export interface EditPlan {
  projectId: string
  style: StyleKey
  instructions: string
  contentAnalysis: ContentAnalysis
  decisions: EditDecision[]
  estimatedDuration: number
  warnings: string[]
}

export interface DirectorState {
  status: 'idle' | 'analyzing' | 'planning' | 'ready' | 'executing' | 'done' | 'error'
  instructions: string
  selectedStyle: StyleKey
  plan: EditPlan | null
  suggestions: Suggestion[]
  feedbackText: string
  error?: string
}

export interface HookInfo {
  start: number
  end: number
  type: 'opening' | 'reaction' | 'reveal' | 'statement' | 'demonstration'
  confidence: number
  text: string
}

export interface InstructionOverrides {
  zoom: ZoomLevel | null
  transitions: TransitionLevel | null
  pacing: PacingLevel | null
  overlayFrequency: OverlayFrequency | null
  effects: EffectsLevel | null
  framingStyle: 'close-up' | 'medium' | 'wide' | null
  visualEffects: string[]
  parsedDirectives: { type: string; value: string; source: string }[]
}

export type OverlayPlacement = 'center' | 'left' | 'right' | 'pip' | 'fullscreen'

export interface OverlayDecision {
  overlayClipId: string
  startTime: number
  endTime: number
  placement: OverlayPlacement
  scale: number
  opacity: number
  reason: string
}

export interface CombinedTimeline {
  segments: { start: number; end: number; text: string }[]
  silenceSegments: { start: number; end: number; duration: number; confidence: number }[]
  clips: { id: string; fileName: string; duration: number; slot: 'A' | 'B' }[]
  totalDuration: number
}

export interface Suggestion {
  id: string
  label: string
  description: string
  selected: boolean
}
