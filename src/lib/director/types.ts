export type StyleKey =
  | 'professional' | 'cinematic' | 'documentary' | 'educational'
  | 'corporate' | 'luxury' | 'podcast' | 'vlog'
  | 'food-review' | 'gaming' | 'tiktok' | 'shorts' | 'reels'

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
  error?: string
}

export interface HookInfo {
  start: number
  end: number
  type: 'opening' | 'reaction' | 'reveal' | 'statement' | 'demonstration'
  confidence: number
  text: string
}
