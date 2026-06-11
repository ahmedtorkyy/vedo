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
  { regex: /\b(?:close.?up|tight|detail|intimate)\b/i, value: 'close-up' },
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

const JUMP_CUT_PATTERNS: { regex: RegExp; value: boolean }[] = [
  { regex: /\bjump\s*cut/i, value: true },
  { regex: /\bno\s*(?:transitions|dissolve|fade)\b/i, value: true },
  { regex: /\bstraight\s*cut/i, value: true },
  { regex: /\bhard\s*cut/i, value: true },
  { regex: /\bfast\s*cuts/i, value: true },
  { regex: /\bquick\s*edits/i, value: true },
  { regex: /\b(?:no\s*)?dissolve/i, value: true },
  { regex: /(?:قص|قطع)\s*(?:سريع|مباشر|جاف)/i, value: true },
  { regex: /(?:بدون|دون)\s*(?:انتقالات|تأثيرات)/i, value: true },
]

const PLATFORM_PATTERNS: { regex: RegExp; value: string }[] = [
  { regex: /\b(?:for|on|upload\s*to|make\s*for)\s*(?:youtube|yt)\b/i, value: 'youtube' },
  { regex: /\b(?:for|on|upload\s*to)\s*tiktok\b/i, value: 'tiktok' },
  { regex: /\b(?:for|on|upload\s*to)\s*(?:instagram|ig|reel)\b/i, value: 'instagram' },
  { regex: /\b(?:for|on|upload\s*to)\s*(?:shorts|youtube\s*shorts)\b/i, value: 'shorts' },
  { regex: /\b(?:for|on|upload\s*to)\s*(?:facebook|fb)\b/i, value: 'facebook' },
]

const ASPECT_PATTERNS: { regex: RegExp; value: string }[] = [
  { regex: /\bvertical\b/i, value: '9:16' },
  { regex: /\b(?:horizontal|landscape)\b/i, value: '16:9' },
  { regex: /\bsquare\b/i, value: '1:1' },
  { regex: /\bportrait\b/i, value: '9:16' },
  { regex: /\b(?:4[\s:]?5|portrait\s*friendly)\b/i, value: '4:5' },
]

const ZOOM_TARGET_PATTERNS: { regex: RegExp; value: string }[] = [
  { regex: /\b(?:reveal|showcase)\b/i, value: 'reveal' },
  { regex: /\b(?:eating|food)\b/i, value: 'eating' },
  { regex: /\breactions?\b/i, value: 'reaction' },
  { regex: /\b(?:product|item)\b/i, value: 'product' },
  { regex: /\bwhen I show\b/i, value: 'demo' },
  { regex: /\bface\b/i, value: 'face' },
  { regex: /\bdemo\b/i, value: 'demo' },
  { regex: /\b(?:detail|close.?up)\b/i, value: 'detail' },
]

const MULTICAM_PATTERNS: { regex: RegExp; value: boolean }[] = [
  { regex: /\b(?:multicam|multi.?cam|multi.?angle|alternate.?angles)\b/i, value: true },
  { regex: /\b(?:different\s*angles|camera\s*switch)\b/i, value: true },
]

const CLAUSE_BOUNDARY = '(?:keep|make|use|add|set|with|without|and|but|under|then|also|please|transition|zoom|effect|overlay|caption|speed|audio|slow|fast|remove|cut|skip|delete|focus|part|section|segment)'
const CONTENT_REF_PATTERNS: RegExp[] = [
  new RegExp(`\\bremove\\s+the\\s+part\\s+about\\s+(.+?)(?:\\.|,|;|\\b${CLAUSE_BOUNDARY}|$)`, 'gi'),
  new RegExp(`\\bcut\\s+(?:the\\s+)?(?:part|section|segment)\\s+(?:about|on|of)\\s+(.+?)(?:\\.|,|;|\\b${CLAUSE_BOUNDARY}|$)`, 'gi'),
  new RegExp(`\\b(?:skip|delete|remove)\\s+(.+?)(?:\\s+(?:part|section|segment)|\\.|,|;|\\b${CLAUSE_BOUNDARY}|$)`, 'gi'),
  new RegExp(`\\b(?:keep\\s+only|focus\\s+on)\\s+(.+?)(?:\\.|,|;|\\b${CLAUSE_BOUNDARY}|$)`, 'gi'),
]

const CONTENT_REF_STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
  'and', 'or', 'but', 'if', 'so', 'then', 'just', 'also', 'please', 'with', 'without',
  'under', 'keep', 'make', 'use', 'add', 'set', 'remove', 'cut', 'skip', 'delete',
  'get', 'go', 'do', 'be', 'have', 'will', 'can', 'would', 'could', 'should', 'may',
])

const CAPTION_PATTERNS: { regex: RegExp; value: boolean }[] = [
  { regex: /\b(?:captions?\s+on|subtitles?\s+on|add\s+captions?|include\s+subtitles?)\b/i, value: true },
  { regex: /\b(?:captions?\s+off|subtitles?\s+off|no\s+captions?|no\s+subtitles?|remove\s+captions?)\b/i, value: false },
  { regex: /\b(?:always\s+show\s+captions?|forced\s+captions?)\b/i, value: true },
]

const AUDIO_DIRECTIVES: { regex: RegExp; value: string }[] = [
  { regex: /\b(?:background\s+music|bgm|ambient\s+music)\b/i, value: 'background-music' },
  { regex: /\b(?:voiceover|narration|voice\s+over)\b/i, value: 'voiceover' },
  { regex: /\b(?:ambient\s+sound|environment\s+sound|nature\s+sounds)\b/i, value: 'ambient' },
  { regex: /\b(?:soundtrack|score|music\s+track)\b/i, value: 'soundtrack' },
  { regex: /\b(?:silence\s+removal|remove\s+silence)\b/i, value: 'remove-silence' },
  { regex: /\b(?:music|song)\s*(?:bed|under|behind)\b/i, value: 'background-music' },
]

const SPEED_PATTERNS: { regex: RegExp; value: number }[] = [
  { regex: /\b(?:2x|2\s*timess?|double\s*speed)\b/i, value: 2 },
  { regex: /\b(?:1\.5x|1\.5\s*timess?|one\s*and\s*a\s*half)\b/i, value: 1.5 },
  { regex: /\b(?:1\.25x|1\.25\s*timess?)\b/i, value: 1.25 },
  { regex: /\b(?:speed\s*up|faster|increase\s*speed)\b/i, value: 1.25 },
  { regex: /\b(?:slow\s*down|decrease\s*speed|slower)\b/i, value: 0.75 },
  { regex: /\b(?:half\s*speed|0\.5x)\b/i, value: 0.5 },
]

const DURATION_PATTERNS: RegExp[] = [
  /\b(?:under|less\s*than|max|maximum)\s*(\d+)\s*(?:seconds?|sec|s)\b/i,
  /\b(?:make\s*it|keep\s*it|target)\s*(\d+)\s*(?:seconds?|sec|s)\b/i,
  /\b(?:under|less\s*than|max|maximum)\s*(\d+)\s*(?:minutes?|min)\b/i,
  /\b(?:make\s*it|keep\s*it|target)\s*(\d+)\s*(?:minutes?|min)\b/i,
]

const NEGATION_PATTERNS: { prefix: RegExp; dimension: string }[] = [
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?transitions?/i, dimension: 'transitions' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?zooms?/i, dimension: 'zoom' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?(?:effects?|filters?)/i, dimension: 'effects' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?(?:overlays?|b.?roll)/i, dimension: 'overlayFrequency' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?(?:dissolve|fade|wipes?)/i, dimension: 'jumpCuts' },
  { prefix: /(?:no|don't|do not|without)\s+(?:jump\s*)?cuts?/i, dimension: 'jumpCuts' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?(?:captions?|subtitles?)/i, dimension: 'captionsEnabled' },
  { prefix: /(?:don't|do not|without|no|never)\s+(?:use\s+)?(?:multicam|multi.?cam)/i, dimension: 'multicam' },
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

function applyNegationPrePass(text: string): Set<string> {
  const negated: Set<string> = new Set()
  for (const { prefix, dimension } of NEGATION_PATTERNS) {
    if (prefix.test(text)) {
      negated.add(dimension)
    }
  }
  return negated
}

function findZoomTargets(text: string): string[] {
  const targets: string[] = []
  for (const { regex, value } of ZOOM_TARGET_PATTERNS) {
    if (regex.test(text)) targets.push(value)
  }
  return targets
}

function findContentReferences(text: string): string[] {
  const refs: string[] = []
  for (const pattern of CONTENT_REF_PATTERNS) {
    const matches = text.matchAll(pattern)
    for (const m of matches) {
      let phrase = (m[1] ?? '').trim()
      const words = phrase.split(/\s+/)
      while (words.length > 0 && CONTENT_REF_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
        words.pop()
      }
      phrase = words.join(' ')
      if (phrase.length < 3) continue
      if (phrase.split(/\s+/).length < 2) continue
      if (/^\d+$/.test(phrase)) continue
      if (!refs.includes(phrase)) refs.push(phrase)
    }
  }
  return refs
}

function findTargetDuration(text: string): number | null {
  for (const pattern of DURATION_PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num) && num > 0) {
        if (pattern.source.includes('minutes?')) return num * 60
        return num
      }
    }
  }
  return null
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
      jumpCuts: null,
      platformPreset: null,
      aspectRatio: null,
      zoomTargets: [],
      multicam: null,
      contentReferences: [],
      captionsEnabled: null,
      audioDirectives: [],
      speedDirective: null,
      targetDuration: null,
      safeFrameCenter: null,
      parsedDirectives: [],
      unmatchedPhrases: [],
    }
  }

  const negated = applyNegationPrePass(text)

  const zoom = findFirst(text, ZOOM_PATTERNS)
  let transitions = findFirst(text, TRANSITION_PATTERNS)
  const pacing = findFirst(text, PACING_PATTERNS)
  const overlayFrequency = findFirst(text, OVERLAY_PATTERNS)
  const effects = findFirst(text, EFFECTS_PATTERNS)
  const framingStyle = findFirst(text, FRAMING_PATTERNS)
  const visualEffects = findAll(text, VISUAL_EFFECTS_PATTERNS)
  const jumpCuts = findFirst(text, JUMP_CUT_PATTERNS)
  const platformPreset = findFirst(text, PLATFORM_PATTERNS)
  const aspectRatio = findFirst(text, ASPECT_PATTERNS)
  const zoomTargets = findZoomTargets(text)
  const multicam = findFirst(text, MULTICAM_PATTERNS)
  const contentReferences = findContentReferences(text)
  const captionsEnabled = findFirst(text, CAPTION_PATTERNS)
  const audioDirectives = findAll(text, AUDIO_DIRECTIVES)
  const speedDirective = findFirst(text, SPEED_PATTERNS)
  const targetDuration = findTargetDuration(text)
  const unmatchedPhrases: string[] = []

  if (negated.has('transitions')) transitions = 'minimal'

  const directives: { type: string; value: string; source: string }[] = []

  const pushDirective = (type: string, value: string | boolean | number | null) => {
    if (value !== null && value !== undefined) {
      directives.push({ type, value: String(value), source: 'instruction' })
    }
  }

  if (zoom) pushDirective('zoom', zoom)
  if (transitions) pushDirective('transitions', transitions)
  if (pacing) pushDirective('pacing', pacing)
  if (overlayFrequency) pushDirective('overlay-frequency', overlayFrequency)
  if (effects) pushDirective('effects', effects)
  if (framingStyle) pushDirective('framing', framingStyle)
  if (jumpCuts !== null) pushDirective('jump-cuts', jumpCuts)
  if (platformPreset) pushDirective('platform', platformPreset)
  if (aspectRatio) pushDirective('aspect-ratio', aspectRatio)
  if (multicam !== null) pushDirective('multicam', multicam)
  if (captionsEnabled !== null) pushDirective('captions', captionsEnabled)
  if (speedDirective !== null) pushDirective('speed', speedDirective)
  if (targetDuration !== null) pushDirective('target-duration', targetDuration)
  for (const ve of visualEffects) pushDirective('visual-effect', ve)
  for (const zt of zoomTargets) pushDirective('zoom-target', zt)
  for (const ref of contentReferences) pushDirective('content-ref', ref)
  for (const ad of audioDirectives) pushDirective('audio', ad)
  if (unmatchedPhrases.length > 0) {
    for (const up of unmatchedPhrases) pushDirective('unmatched', up)
  }

  if (/(?:my\s+)?face\s+(?:always\s+)?cent(?:er|re)/i.test(text) || /\balways\s+center\b/i.test(text)) {
    directives.push({ type: 'safe-frame-center', value: 'face', source: 'instruction' })
  }

  return {
    zoom,
    transitions,
    pacing,
    overlayFrequency,
    effects,
    framingStyle,
    visualEffects,
    jumpCuts,
    platformPreset,
    aspectRatio,
    zoomTargets,
    multicam,
    contentReferences,
    captionsEnabled,
    audioDirectives,
    speedDirective,
    targetDuration,
    safeFrameCenter: directives.some((d) => d.type === 'safe-frame-center') || null,
    parsedDirectives: directives,
    unmatchedPhrases,
  }
}

export function mergeOverrides<T extends string>(
  styleValue: T,
  overrideValue: T | null,
): T {
  return overrideValue ?? styleValue
}
