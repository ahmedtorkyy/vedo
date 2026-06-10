import type { InstructionOverrides, ZoomLevel, TransitionLevel, PacingLevel, OverlayFrequency, EffectsLevel } from './types'

const ZOOM_PATTERNS: { regex: RegExp; value: ZoomLevel }[] = [
  { regex: /\b(?:aggressive|heavy|intense|extreme)\s*zoom/i, value: 'aggressive' },
  { regex: /\b(?:dynamic|moderate|medium)\s*zoom/i, value: 'dynamic' },
  { regex: /\b(?:subtle|soft|gentle|light)\s*zoom/i, value: 'soft' },
  { regex: /\b(?:no\s*zoom|minimal\s*zoom|steady|camera\s*fixed)\b/i, value: 'soft' },
  { regex: /\bzoom\s*(?:in|out)?\s*(?:aggressive|heavy|intense|extreme)/i, value: 'aggressive' },
  { regex: /\bzoom\s*(?:in|out)?\s*(?:dynamic|medium|moderate)/i, value: 'dynamic' },
  { regex: /\bzoom\s*(?:in|out)?\s*(?:subtle|soft|gentle|light|minimal)/i, value: 'soft' },
  { regex: /\b(?:soft|gentle|subtle)\s*(?:camera|movement|motion)\b/i, value: 'soft' },
  { regex: /\b(?:dynamic|active|lively)\s*(?:camera|movement|motion)\b/i, value: 'dynamic' },
  { regex: /(?:تكبير|تقريب|زوم)\s*(?:قوي|كبير|عنيف|حاد)/i, value: 'aggressive' },
  { regex: /(?:تكبير|تقريب|زوم)\s*(?:بسيط|خفيف|ناعم|هادئ)/i, value: 'soft' },
  { regex: /(?:تكبير|تقريب|زوم)\s*(?:متوسط|ديناميكي)?/i, value: 'dynamic' },
]

const TRANSITION_PATTERNS: { regex: RegExp; value: TransitionLevel }[] = [
  { regex: /\b(?:no\s*transitions|hard\s*cut|straight\s*cut)\b/i, value: 'minimal' },
  { regex: /\b(?:minimal|few|barely)\s*(?:transitions|cuts)\b/i, value: 'minimal' },
  { regex: /\b(?:light|subtle|gentle)\s*(?:transitions|cuts)\b/i, value: 'light' },
  { regex: /\b(?:dynamic|moderate|smooth)\s*(?:transitions|cuts)\b/i, value: 'dynamic' },
  { regex: /\b(?:heavy|lots? of|many|frequent)\s*(?:transitions|cuts|effects?)\b/i, value: 'heavy' },
  { regex: /\b(?:smooth|slow)\s*(?:transitions|cuts|dissolve)\b/i, value: 'light' },
  { regex: /\b(?:fast|quick|rapid)\s*(?:transitions|cuts|edits?)\b/i, value: 'heavy' },
  { regex: /\b(?:dissolve|fade)\b/i, value: 'light' },
  { regex: /\b(?:cut|jump\s*cut)\b/i, value: 'heavy' },
  { regex: /(?:انتقالات?|قص|تقطيع)\s*(?:بسيط|خفيف|قليل)/i, value: 'minimal' },
  { regex: /(?:انتقالات?|قص|تقطيع)\s*(?:كثير|كثيرة|متكرر|سريع|عنيف)/i, value: 'heavy' },
  { regex: /(?:انتقالات?|قص|تقطيع)\s*(?:ديناميكي|سلس|متوسط)/i, value: 'dynamic' },
  { regex: /(?:دمج|تداخل|فيد|تدرج)/i, value: 'light' },
]

const PACING_PATTERNS: { regex: RegExp; value: PacingLevel }[] = [
  { regex: /\b(?:slow|relaxed|calm|chill|laid.back)\s*(?:pace|editing|tempo|speed)?\b/i, value: 'slow' },
  { regex: /\b(?:moderate|medium|normal|balanced)\s*(?:pace|editing|tempo|speed)?\b/i, value: 'moderate' },
  { regex: /\b(?:fast|quick|rapid|snappy|energetic|punchy)\s*(?:pace|editing|tempo|speed)?\b/i, value: 'fast' },
  { regex: /\b(?:dynamic|varying|mixed|varied)\s*(?:pace|editing|tempo|speed)?\b/i, value: 'dynamic' },
  { regex: /\b(?:short|tight|concise)\b/i, value: 'fast' },
  { regex: /(?:بطيء|هادئ|مريح|رخو)\s*(?:مونتاج|سرعة|ايقاع)?/i, value: 'slow' },
  { regex: /(?:سريع|سريعة|بسرعة|قصير|مختصر)\s*(?:مونتاج|سرعة|ايقاع)?/i, value: 'fast' },
  { regex: /(?:متوسط|معتدل|طبيعي|عادي)\s*(?:مونتاج|سرعة|ايقاع)?/i, value: 'moderate' },
  { regex: /(?:ديناميكي|متنوع|متغير)\s*(?:مونتاج|سرعة|ايقاع)?/i, value: 'dynamic' },
]

const OVERLAY_PATTERNS: { regex: RegExp; value: OverlayFrequency }[] = [
  { regex: /\b(?:no|without|zero)\s*(?:overlays?|b.?roll|overlay)\b/i, value: 'rare' },
  { regex: /\b(?:rare|minimal|few|occasional)\s*(?:overlays?|b.?roll)\b/i, value: 'rare' },
  { regex: /\b(?:moderate|some|balanced)\s*(?:overlays?|b.?roll)\b/i, value: 'moderate' },
  { regex: /\b(?:lots? of|many|frequent|heavy|plenty)\s*(?:overlays?|b.?roll|overlay)\b/i, value: 'frequent' },
  { regex: /\b(?:add|include|use|show)\s*(?:overlays?|b.?roll)\b/i, value: 'frequent' },
  { regex: /(?:بدون|دون|لا)\s*(?:تراكب|تراكبات|طبقات)/i, value: 'rare' },
  { regex: /(?:تراكب|تراكبات|طبقات)\s*(?:قليل|نادر|بسيط|خفيف)/i, value: 'rare' },
  { regex: /(?:قليل|نادر|بسيط|خفيف)\s*(?:تراكب|تراكبات|طبقات)/i, value: 'rare' },
  { regex: /(?:تراكب|تراكبات|طبقات)\s*(?:كثير|متكرر|وافر|كثيرة)/i, value: 'frequent' },
  { regex: /(?:كثير|متكرر|وافر)\s*(?:تراكب|تراكبات|طبقات)/i, value: 'frequent' },
  { regex: /(?:تراكب|تراكبات|طبقات)\s*(?:متوسط|بعض)/i, value: 'moderate' },
  { regex: /(?:متوسط|بعض)\s*(?:تراكب|تراكبات|طبقات)/i, value: 'moderate' },
]

const EFFECTS_PATTERNS: { regex: RegExp; value: EffectsLevel }[] = [
  { regex: /\b(?:no|without|zero|subtle|minimal|natural)\s*(?:effects?|filters?|color)\b/i, value: 'subtle' },
  { regex: /\b(?:balanced|moderate|some|light)\s*(?:effects?|filters?|color)\b/i, value: 'balanced' },
  { regex: /\b(?:strong|heavy|lots? of|many|dramatic|cinematic)\s*(?:effects?|filters?|color)\b/i, value: 'strong' },
  { regex: /\b(?:vintage|retro|film|grain|glitch|vhs|8mm|filter)\b/i, value: 'strong' },
  { regex: /(?:مؤثرات|تأثيرات|فلاتر)\s*(?:بسيط|خفيف|طبيعي)/i, value: 'subtle' },
  { regex: /(?:مؤثرات|تأثيرات|فلاتر)\s*(?:قوي|كبير|سينمائي|درامي)/i, value: 'strong' },
  { regex: /(?:سينمائي|درامي|قديم|ريترو|فيلم)/i, value: 'strong' },
]

const FRAMING_PATTERNS: { regex: RegExp; value: 'close-up' | 'medium' | 'wide' }[] = [
  { regex: /\b(?:close.?up|tight|detail|face|intimate)\b/i, value: 'close-up' },
  { regex: /\b(?:medium|waist|chest|standard)\s*(?:shot|framing)\b/i, value: 'medium' },
  { regex: /\b(?:wide|full|establishing|environment|landscape)\s*(?:shot|framing)\b/i, value: 'wide' },
  { regex: /(?:قريب|وجه|تفاصيل|عن.?قرب|مكبر)/i, value: 'close-up' },
  { regex: /(?:متوسط|وسط|خصر)\s*(?:لقطة|تصوير)/i, value: 'medium' },
  { regex: /(?:واسع|بعيد|عام|كامل|بانوراما|منظر)\s*(?:لقطة|تصوير)?/i, value: 'wide' },
]

const VISUAL_EFFECTS_PATTERNS: { regex: RegExp; value: string }[] = [
  { regex: /\b(?:black.?and.?white|b&w|monochrome)\b/i, value: 'black-and-white' },
  { regex: /\b(?:slow.?mo|slow\s*motion|slo.?mo)\b/i, value: 'slow-motion' },
  { regex: /\b(?:fast.?mo|fast\s*motion|timelapse|time.?lapse|hyperlapse)\b/i, value: 'time-lapse' },
  { regex: /\b(?:vignette|dark.?en|shadow)\b/i, value: 'vignette' },
  { regex: /\b(?:glitch|vhs|static|distortion|noise)\b/i, value: 'glitch' },
  { regex: /\b(?:film|grain|8mm|super.?8|vintage|retro)\b/i, value: 'film-grain' },
  { regex: /\b(?:blur|bokeh|background\s*blur|depth.?of.?field)\b/i, value: 'blur' },
  { regex: /\b(?:color\s*grade|color\s*correct|warm|cool\s*tone)\b/i, value: 'color-grade' },
  { regex: /\b(?:text\s*overlay|caption|subtitle|title)\b/i, value: 'text-overlay' },
  { regex: /(?:أبيض|أسود)\s*(?:وأبيض|وأسود)/i, value: 'black-and-white' },
  { regex: /(?:بطيء|تصوير\s*بطيء|سلو)\s*(?:حركة|موشن)?/i, value: 'slow-motion' },
  { regex: /(?:تايم\s*لابس|تسريع|زمني|لقطات\s*زمنية)/i, value: 'time-lapse' },
  { regex: /(?:تشويش|كلاسيك|قديم|فينتج)/i, value: 'film-grain' },
  { regex: /(?:ضبابي|ضباب|خلفية\s*ضبابية)/i, value: 'blur' },
  { regex: /(?:نص|تعليق|ترجمة|عنوان)\s*(?:تراكب|على)?/i, value: 'text-overlay' },
]

function findFirst<T>(text: string, patterns: { regex: RegExp; value: T }[]): T | null {
  for (const { regex, value } of patterns) {
    if (regex.test(text)) return value
  }
  return null
}

function findAll<T>(text: string, patterns: { regex: RegExp; value: T }[]): T[] {
  const results: T[] = []
  for (const { regex, value } of patterns) {
    if (regex.test(text)) results.push(value)
  }
  return results
}

export function parseInstructions(instructions: string): InstructionOverrides {
  const text = instructions.trim()
  if (!text) {
    return {
      zoom: null,
      transitions: null,
      pacing: null,
      overlayFrequency: null,
      effects: null,
      framingStyle: null,
      visualEffects: [],
      parsedDirectives: [],
    }
  }

  const zoom = findFirst(text, ZOOM_PATTERNS)
  const transitions = findFirst(text, TRANSITION_PATTERNS)
  const pacing = findFirst(text, PACING_PATTERNS)
  const overlayFrequency = findFirst(text, OVERLAY_PATTERNS)
  const effects = findFirst(text, EFFECTS_PATTERNS)
  const framingStyle = findFirst(text, FRAMING_PATTERNS)
  const visualEffects = findAll(text, VISUAL_EFFECTS_PATTERNS)

  const directives: { type: string; value: string; source: string }[] = []
  if (zoom) directives.push({ type: 'zoom', value: zoom, source: 'instruction' })
  if (transitions) directives.push({ type: 'transitions', value: transitions, source: 'instruction' })
  if (pacing) directives.push({ type: 'pacing', value: pacing, source: 'instruction' })
  if (overlayFrequency) directives.push({ type: 'overlay-frequency', value: overlayFrequency, source: 'instruction' })
  if (effects) directives.push({ type: 'effects', value: effects, source: 'instruction' })
  if (framingStyle) directives.push({ type: 'framing', value: framingStyle, source: 'instruction' })
  for (const ve of visualEffects) {
    directives.push({ type: 'visual-effect', value: ve, source: 'instruction' })
  }

  return {
    zoom,
    transitions,
    pacing,
    overlayFrequency,
    effects,
    framingStyle,
    visualEffects,
    parsedDirectives: directives,
  }
}

export function mergeOverrides<T extends string>(
  styleValue: T,
  overrideValue: T | null,
): T {
  return overrideValue ?? styleValue
}
