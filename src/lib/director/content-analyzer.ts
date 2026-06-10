import type { ContentAnalysis, HookInfo } from './types'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  tutorial: ['how to', 'step', 'guide', 'learn', 'beginner', 'tutorial', 'follow along'],
  review: ['review', 'unboxing', 'first look', 'honest', 'worth it', 'compared'],
  educational: ['explain', 'science', 'history', 'theory', 'research', 'study', 'analysis'],
  entertainment: ['funny', 'challenge', 'prank', 'reaction', 'try not to laugh'],
  vlog: ['vlog', 'daily', 'day in the life', 'weekend', 'travel'],
  podcast: ['welcome back', 'episode', 'conversation', 'discuss', 'interview'],
  cooking: ['recipe', 'ingredients', 'cook', 'bake', 'kitchen', 'delicious', 'taste'],
  gaming: ['gameplay', 'walkthrough', 'lets play', 'gaming', 'stream'],
  tech: ['specs', 'review', 'features', 'benchmark', 'performance', 'setup'],
}

const HOOK_PATTERNS = [
  /^what('s| is) up/i,
  /^hey /i,
  /^hello /i,
  /^welcome /i,
  /^today /i,
  /^(so |)today /i,
  /^(in )?this video/i,
  /^have you ever/i,
  /^the (one|thing|moment)/i,
  /^i (can'|couldn'|will)/i,
  /^you (won't |are |'re )/i,
  /^this is (the |a )/i,
  /^let('s| me)/i,
  /check this (out|)/i,
  /^(so |)here('s| is)/i,
  /^number one/i,
  /^(the )?first thing/i,
]

export function analyzeContent(
  segments: { start: number; end: number; text: string }[],
  duration: number,
  clipFileName?: string,
): ContentAnalysis {
  const fullText = segments.map((s) => s.text.trim()).join(' ').toLowerCase()
  const allText = segments.map((s) => s.text)

  const topic = inferTopic(fullText, clipFileName)
  const category = inferCategory(fullText)
  const keywords = extractKeywords(fullText, 15)
  const structure = analyzeStructure(segments, duration, fullText)
  const importantMoments = detectImportantMoments(segments, fullText, keywords)
  const emotionalMoments = detectEmotionalMoments(segments)
  const keySubjects = extractSubjects(fullText)
  const keyObjects = extractObjects(fullText, keywords)

  return {
    topic,
    category,
    keywords,
    structure,
    importantMoments,
    emotionalMoments,
    keySubjects,
    keyObjects,
  }
}

function inferTopic(text: string, fileName?: string): string {
  const fileNameTopic = fileName
    ? fileName.replace(/\.\w+$/, '').replace(/[_-]/g, ' ').trim()
    : ''

  if (fileNameTopic && fileNameTopic.length > 3 && fileNameTopic.length < 60) {
    return fileNameTopic
  }

  const sentences = text.split(/[.!?]+/).filter(Boolean)
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim()
    if (firstSentence.length < 100) {
      return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1)
    }
  }

  return 'Untitled Video'
}

function inferCategory(text: string): string {
  let bestCategory = 'general'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = text.match(regex)
      if (matches) score += matches.length * (kw.length > 5 ? 3 : 1)
    }
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestCategory
}

function extractKeywords(text: string, count: number): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'he',
    'she', 'his', 'her', 'not', 'so', 'if', 'as', 'just', 'like', 'really',
    'actually', 'basically', 'literally', 'very', 'get', 'got', 'gonna',
    'want', 'going', 'go', 'know', 'think', 'say', 'see', 'come', 'make',
  ])

  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w.toLowerCase()))

  const freq: Record<string, { word: string; count: number }> = {}
  for (const word of words) {
    const lower = word.toLowerCase()
    if (!freq[lower]) freq[lower] = { word, count: 0 }
    freq[lower].count++
  }

  return Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map((f) => f.word)
}

function analyzeStructure(
  segments: { start: number; end: number; text: string }[],
  duration: number,
  fullText: string,
): ContentAnalysis['structure'] {
  const result: ContentAnalysis['structure'] = {
    hook: null,
    setup: null,
    mainContent: null,
    conclusion: null,
  }

  if (segments.length === 0) return result

  const firstText = segments[0].text.toLowerCase()
  const lastText = segments[segments.length - 1].text.toLowerCase()

  const isHook = HOOK_PATTERNS.some((p) => p.test(firstText))
  if (isHook && segments[0].end - segments[0].start < duration * 0.15) {
    result.hook = {
      start: segments[0].start,
      end: segments[0].end,
      confidence: 0.7,
    }
  }

  const conclusionPatterns = [
    /^(so |)that('s| is) (how|why|what)/i,
    /^(so |)in conclusion/i,
    /^(and |)that('s| was)/i,
    /^(so |)to (sum up|summarize|wrap up)/i,
    /^(thanks |thank you)/i,
    /^(and )?don't forget/i,
    /^(so |)overall/i,
    /^(if you )?enjoyed/i,
    /^(make sure to )?subscribe/i,
    /^i('ll| will) (see you|catch you)/i,
  ]
  const isConclusion = conclusionPatterns.some((p) => p.test(lastText))
  if (isConclusion) {
    result.conclusion = {
      start: segments[segments.length - 1].start,
      end: segments[segments.length - 1].end,
    }
  }

  result.mainContent = {
    start: result.hook?.end ?? segments[0].start,
    end: result.conclusion?.start ?? segments[segments.length - 1].end,
  }

  return result
}

function detectImportantMoments(
  segments: { start: number; end: number; text: string }[],
  fullText: string,
  keywords: string[],
): ContentAnalysis['importantMoments'] {
  const moments: ContentAnalysis['importantMoments'] = []
  const importantWords = new Set([
    'important', 'crucial', 'key', 'essential', 'significant', 'best',
    'worst', 'amazing', 'incredible', 'unbelievable', 'shocking',
    'surprising', 'secret', 'warning', 'tip', 'trick', 'hack',
    'number one', 'top', 'recommend', 'guaranteed', 'finally',
    'breakthrough', 'exclusive', 'never', 'always', 'must',
  ])

  for (const seg of segments) {
    const text = seg.text.toLowerCase()
    for (const word of importantWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      if (regex.test(text)) {
        moments.push({
          time: seg.start,
          description: text.slice(0, 80).trim(),
          confidence: word.length > 5 ? 0.7 : 0.5,
        })
        break
      }
    }
  }

  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const matches = [...fullText.matchAll(regex)]
    if (matches.length === 1) {
      const seg = segments.find(
        (s) => s.start <= (matches[0].index ?? 0) / fullText.length * (segments[segments.length - 1]?.end ?? 1) && s.end >= (matches[0].index ?? 0) / fullText.length * (segments[segments.length - 1]?.end ?? 1),
      )
      if (seg && !moments.some((m) => Math.abs(m.time - seg.start) < 1)) {
        moments.push({
          time: seg.start,
          description: `Key term: "${kw}"`,
          confidence: 0.5,
        })
      }
    }
  }

  return moments.sort((a, b) => a.time - b.time)
}

function detectEmotionalMoments(
  segments: { start: number; end: number; text: string }[],
): ContentAnalysis['emotionalMoments'] {
  const emotionalWords: Record<string, string[]> = {
    excitement: ['amazing', 'incredible', 'awesome', 'wow', 'love', 'best', 'perfect', 'fantastic'],
    surprise: ['wow', 'unbelievable', 'shocking', 'surprising', 'no way', 'really', 'what'],
    frustration: ['ugh', 'frustrating', 'annoying', 'terrible', 'worst', 'hate', 'awful'],
    humor: ['funny', 'hilarious', 'laugh', 'joke', 'crazy', 'ridiculous'],
    seriousness: ['important', 'serious', 'critical', 'urgent', 'essential', 'must'],
  }

  const moments: ContentAnalysis['emotionalMoments'] = []

  for (const seg of segments) {
    const text = seg.text.toLowerCase()
    for (const [emotion, words] of Object.entries(emotionalWords)) {
      for (const word of words) {
        if (text.includes(word)) {
          moments.push({
            time: seg.start,
            emotion: word.length > 5 ? 'strong-' + emotion : emotion,
            intensity: word.length > 5 ? 0.8 : 0.5,
          })
          break
        }
      }
    }
  }

  return moments.sort((a, b) => a.time - b.time)
}

function extractSubjects(text: string): string[] {
  const sentences = text.split(/[.!?]+/).filter(Boolean)
  const subjects: string[] = []

  for (const sentence of sentences.slice(0, 10)) {
    const words = sentence.trim().split(/\s+/)
    if (words.length >= 2) {
      const firstTwo = words.slice(0, 2).join(' ')
      if (!['the ', 'a ', 'an ', 'so ', 'and '].some((p) => firstTwo.toLowerCase().startsWith(p))) {
        const candidate = words[0].replace(/[^a-zA-Z]/g, '')
        if (candidate.length > 2) subjects.push(candidate)
      }
    }
  }

  const freq: Record<string, number> = {}
  for (const s of subjects) {
    const lower = s.toLowerCase()
    freq[lower] = (freq[lower] ?? 0) + 1
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)
}

function extractObjects(text: string, keywords: string[]): string[] {
  const objects: string[] = []
  const patterns = [
    /(?:the|a|an|this|that) (\w+ (?:is|was|has|looks|feels))/gi,
    /(?:check (?:out|this) )(\w+)/gi,
    /(?:here('s| is) )(?:the|a|an) (\w+)/gi,
    /(?:let me show you )(?:the|a|an) (\w+)/gi,
    /(?:this is )(?:the|a|an) (\w+)/gi,
  ]

  for (const p of patterns) {
    const matches = [...text.matchAll(p)]
    for (const m of matches) {
      const obj = (m[1] ?? m[2] ?? '').replace(/[^a-zA-Z\s]/g, '').trim()
      if (obj.length > 3) objects.push(obj)
    }
  }

  const uniqueObjects = [...new Set(objects)]
  const all = [...uniqueObjects, ...keywords.filter((k) => !uniqueObjects.includes(k))]
  return all.slice(0, 8)
}

export function detectHooks(
  segments: { start: number; end: number; text: string }[],
): HookInfo[] {
  const hooks: HookInfo[] = []

  for (const seg of segments) {
    const text = seg.text.trim()
    if (!text) continue

    for (const pattern of HOOK_PATTERNS) {
      if (pattern.test(text)) {
        hooks.push({
          start: seg.start,
          end: seg.end,
          type: 'opening',
          confidence: 0.6,
          text: text.slice(0, 60),
        })
        break
      }
    }

    if (/(?:wow|omg|no way|unbelievable|oh my|holy)/i.test(text)) {
      hooks.push({
        start: seg.start,
        end: seg.end,
        type: 'reaction',
        confidence: 0.5,
        text: text.slice(0, 60),
      })
    }
  }

  return hooks.slice(0, 5)
}
