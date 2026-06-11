import type { StyleKey, StyleProfile } from './types'

export const STYLE_PROFILES: Record<StyleKey, StyleProfile> = {
  professional: {
    zoom: 'soft',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'moderate',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.2,
    transitionPreference: 'dissolve',
  },
  cinematic: {
    zoom: 'medium',
    transitions: 'light',
    effects: 'balanced',
    pacing: 'slow',
    overlayFrequency: 'rare',
    jumpCuts: false,
    motionIntensity: 0.4,
    transitionPreference: 'dissolve',
  },
  documentary: {
    zoom: 'soft',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'slow',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.15,
    transitionPreference: 'hard-cut',
  },
  educational: {
    zoom: 'medium',
    transitions: 'light',
    effects: 'balanced',
    pacing: 'moderate',
    overlayFrequency: 'frequent',
    jumpCuts: false,
    motionIntensity: 0.3,
    transitionPreference: 'dissolve',
  },
  corporate: {
    zoom: 'soft',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'moderate',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.15,
    transitionPreference: 'dissolve',
  },
  luxury: {
    zoom: 'medium',
    transitions: 'light',
    effects: 'balanced',
    pacing: 'slow',
    overlayFrequency: 'rare',
    jumpCuts: false,
    motionIntensity: 0.25,
    transitionPreference: 'dissolve',
  },
  podcast: {
    zoom: 'soft',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'moderate',
    overlayFrequency: 'rare',
    jumpCuts: false,
    motionIntensity: 0.1,
    transitionPreference: 'hard-cut',
  },
  vlog: {
    zoom: 'dynamic',
    transitions: 'dynamic',
    effects: 'balanced',
    pacing: 'fast',
    overlayFrequency: 'moderate',
    jumpCuts: true,
    motionIntensity: 0.6,
    transitionPreference: 'hard-cut',
  },
  'food-review': {
    zoom: 'dynamic',
    transitions: 'light',
    effects: 'balanced',
    pacing: 'moderate',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.5,
    transitionPreference: 'dissolve',
  },
  'tech-review': {
    zoom: 'medium',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'moderate',
    overlayFrequency: 'frequent',
    jumpCuts: false,
    motionIntensity: 0.3,
    transitionPreference: 'dissolve',
  },
  'product-review': {
    zoom: 'medium',
    transitions: 'light',
    effects: 'balanced',
    pacing: 'moderate',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.35,
    transitionPreference: 'dissolve',
  },
  'general-review': {
    zoom: 'soft',
    transitions: 'minimal',
    effects: 'subtle',
    pacing: 'moderate',
    overlayFrequency: 'moderate',
    jumpCuts: false,
    motionIntensity: 0.25,
    transitionPreference: 'dissolve',
  },
  gaming: {
    zoom: 'aggressive',
    transitions: 'dynamic',
    effects: 'strong',
    pacing: 'dynamic',
    overlayFrequency: 'frequent',
    jumpCuts: true,
    motionIntensity: 0.8,
    transitionPreference: 'hard-cut',
  },
  tiktok: {
    zoom: 'aggressive',
    transitions: 'heavy',
    effects: 'strong',
    pacing: 'dynamic',
    overlayFrequency: 'frequent',
    jumpCuts: true,
    motionIntensity: 0.9,
    transitionPreference: 'hard-cut',
  },
  shorts: {
    zoom: 'aggressive',
    transitions: 'heavy',
    effects: 'strong',
    pacing: 'dynamic',
    overlayFrequency: 'frequent',
    jumpCuts: true,
    motionIntensity: 0.85,
    transitionPreference: 'hard-cut',
  },
  reels: {
    zoom: 'dynamic',
    transitions: 'heavy',
    effects: 'strong',
    pacing: 'dynamic',
    overlayFrequency: 'frequent',
    jumpCuts: true,
    motionIntensity: 0.8,
    transitionPreference: 'hard-cut',
  },
}

export function getStyleProfile(style: StyleKey | string): StyleProfile {
  return STYLE_PROFILES[style as StyleKey] ?? STYLE_PROFILES.professional
}

export function inferStyle(
  category: string,
  instructions: string,
): StyleKey {
  const lower = instructions.toLowerCase()

  if (/(?:tiktok|short|vertical|reel)/i.test(lower)) return 'tiktok'
  if (/(?:youtube|vlog|daily)/i.test(lower)) return 'vlog'
  if (/(?:cinematic|film|movie)/i.test(lower)) return 'cinematic'
  if (/(?:documentary|doc)/i.test(lower)) return 'documentary'
  if (/(?:educational|learn|teach|tutorial)/i.test(lower)) return 'educational'
  if (/(?:corporate|business|professional)/i.test(lower)) return 'corporate'
  if (/(?:luxury|premium|high.?end)/i.test(lower)) return 'luxury'
  if (/(?:podcast|interview|conversation)/i.test(lower)) return 'podcast'
  if (/(?:gaming|gameplay|stream)/i.test(lower)) return 'gaming'
  if (/(?:food.?review|recipe|cooking|restaurant)/i.test(lower)) return 'food-review'
  if (/(?:tech.?review|specs|benchmark|gadget)/i.test(lower)) return 'tech-review'
  if (/(?:product.?review|honest review|buying guide)/i.test(lower)) return 'product-review'

  switch (category) {
    case 'tutorial': return 'educational'
    case 'food-review': return 'food-review'
    case 'tech-review': return 'tech-review'
    case 'product-review': return 'product-review'
    case 'general-review': return 'general-review'
    case 'educational': return 'educational'
    case 'entertainment': return 'vlog'
    case 'vlog': return 'vlog'
    case 'podcast': return 'podcast'
    case 'cooking': return 'food-review'
    case 'gaming': return 'gaming'
    case 'tech': return 'tech-review'
    default: return 'professional'
  }
}

export function getZoomParameters(level: StyleProfile['zoom']): { scale: number; duration: number } {
  switch (level) {
    case 'soft': return { scale: 1.02, duration: 3 }
    case 'medium': return { scale: 1.05, duration: 2 }
    case 'dynamic': return { scale: 1.1, duration: 1.5 }
    case 'aggressive': return { scale: 1.2, duration: 1 }
  }
}

export function getTransitionDuration(level: StyleProfile['transitions']): number {
  switch (level) {
    case 'minimal': return 0.15
    case 'light': return 0.3
    case 'dynamic': return 0.5
    case 'heavy': return 0.7
  }
}

export function getPacingMultiplier(level: StyleProfile['pacing']): number {
  switch (level) {
    case 'slow': return 1.2
    case 'moderate': return 1.0
    case 'fast': return 0.75
    case 'dynamic': return 0.5
  }
}

export const STYLE_LABELS: Record<StyleKey, string> = {
  professional: 'Professional',
  cinematic: 'Cinematic',
  documentary: 'Documentary',
  educational: 'Educational',
  corporate: 'Corporate',
  luxury: 'Luxury',
  podcast: 'Podcast',
  vlog: 'Vlog',
  'food-review': 'Food Review',
  'tech-review': 'Tech Review',
  'product-review': 'Product Review',
  'general-review': 'General Review',
  gaming: 'Gaming',
  tiktok: 'TikTok',
  shorts: 'Shorts',
  reels: 'Reels',
}
