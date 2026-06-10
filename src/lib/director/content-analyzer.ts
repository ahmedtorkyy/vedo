import type { ContentAnalysis, HookInfo } from './types'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  tutorial: [
    'how to', 'step', 'guide', 'learn', 'beginner', 'tutorial', 'follow along',
    'كيف', 'شرح', 'تعلم', 'درس', 'دورة', 'طريقة', 'خطوة',
  ],
  educational: [
    'explain', 'science', 'history', 'theory', 'research', 'study', 'analysis',
    'علم', 'تاريخ', 'نظرية', 'بحث', 'دراسة', 'تحليل', 'تعليم',
  ],
  entertainment: [
    'funny', 'challenge', 'prank', 'reaction', 'try not to laugh',
    'مضحك', 'تحدي', 'مقلب', 'تفاعل', 'ضحك',
  ],
  vlog: [
    'vlog', 'daily', 'day in the life', 'weekend', 'travel',
    'يوميات', 'يوم في', 'رحلة', 'سفر', 'روتين',
  ],
  podcast: [
    'welcome back', 'episode', 'conversation', 'discuss', 'interview',
    'حوار', 'نقاش', 'مقابلة', 'حديث', 'لقاء', 'حلقة',
  ],
  cooking: [
    'recipe', 'ingredients', 'cook', 'bake', 'kitchen', 'delicious', 'taste',
    'وصفة', 'مقادير', 'طبخ', 'مطبخ', 'لذيذ', 'طعم', 'اكل',
  ],
  'food-review': [
    'restaurant review', 'food review', 'dish review', 'taste test',
    'cuisine', 'dining', 'meal', 'eating review', 'تقييم مطعم', 'مراجعة اكل',
  ],
  'tech-review': [
    'tech review', 'smartphone review', 'laptop review', 'gadget review',
    'camera review', 'app review', 'software review', 'benchmark',
    'مراجعة تقنية', 'تقييم هاتف', 'مواصفات',
  ],
  'product-review': [
    'product review', 'honest review of', 'amazon review', 'buying guide',
    'unboxing review', 'review of the', 'purchase review', 'quality review',
    'مراجعة منتج', 'تقييم منتج', 'جودة المنتج',
  ],
  'general-review': [
    'review', 'rating', 'first look', 'my thoughts', 'overview',
    'worth it', 'compared', 'reviewer', 'reviewing',
    'مراجعة', 'تقييم', 'انطباع',
  ],
  gaming: [
    'gameplay', 'walkthrough', 'lets play', 'gaming', 'stream',
    'لعبة', 'تسريح', 'جيمينج', 'بث', 'ستريم',
  ],
  tech: [
    'specs', 'features', 'performance', 'setup', 'device', 'gadget',
    'مواصفات', 'مميزات', 'اداء', 'تقنية', 'اجهزة', 'هاتف', 'كمبيوتر',
  ],
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

const IMPORTANT_WORDS = new Set([
  'important', 'crucial', 'key', 'essential', 'significant', 'best',
  'worst', 'amazing', 'incredible', 'unbelievable', 'shocking',
  'surprising', 'secret', 'warning', 'tip', 'trick', 'hack',
  'number one', 'top', 'recommend', 'guaranteed', 'finally',
  'breakthrough', 'exclusive', 'never', 'always', 'must',
  'مهم', 'ضروري', 'اساسي', 'افضل', 'اسوء', 'مذهل', 'سر', 'نصيحة',
])

const EMOTIONAL_WORDS: Record<string, string[]> = {
  excitement: ['amazing', 'incredible', 'awesome', 'wow', 'love', 'best', 'perfect', 'fantastic', 'رائع', 'مذهل', 'جميل'],
  surprise: ['wow', 'unbelievable', 'shocking', 'surprising', 'no way', 'really', 'what', 'مستحيل', 'صدمة', 'حقا'],
  frustration: ['ugh', 'frustrating', 'annoying', 'terrible', 'worst', 'hate', 'awful', 'سيء', 'مزعج', 'اخطأ'],
  humor: ['funny', 'hilarious', 'laugh', 'joke', 'crazy', 'ridiculous', 'مضحك', 'هزار', 'جنون'],
  seriousness: ['important', 'serious', 'critical', 'urgent', 'essential', 'must', 'مهم', 'خطير', 'عاجل'],
}

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
  const keySubjects = extractSubjects(segments, fullText)
  const keyObjects = extractObjects(fullText, keywords, segments)

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
  const isReviewRelated =
    /\b(review|rating|unboxing|first.look|مراجعة|تقييم)\b/i.test(text)

  let bestCategory = 'general'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category.endsWith('-review') && !isReviewRelated) continue

    let score = 0
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = text.match(regex)
      if (matches) score += matches.length * (kw.length > 5 ? 3 : 1)
    }

    if (!category.endsWith('-review') && isReviewRelated) {
      score *= 0.5
    }

    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  if (bestScore === 0 && isReviewRelated) {
    return 'general-review'
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
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))

  const freq: Record<string, { word: string; count: number }> = {}
  for (const word of words) {
    const lower = word.toLowerCase()
    if (!freq[lower]) freq[lower] = { word, count: 0 }
    freq[lower].count++
  }

  const bigrams: Record<string, { phrase: string; count: number }> = {}
  for (let i = 0; i < words.length - 1; i++) {
    const pair = (words[i] + ' ' + words[i + 1]).toLowerCase()
    if (!stopWords.has(words[i].toLowerCase()) || !stopWords.has(words[i + 1].toLowerCase())) {
      if (!bigrams[pair]) bigrams[pair] = { phrase: words[i] + ' ' + words[i + 1], count: 0 }
      bigrams[pair].count++
    }
  }

  const topWords = Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, count)

  const topBigrams = Object.values(bigrams)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((b) => b.phrase)

  const result = topWords.map((f) => f.word)
  for (const bg of topBigrams) {
    const bgLower = bg.toLowerCase()
    if (!result.some((w) => bgLower.includes(w.toLowerCase()))) {
      result.push(bg)
    }
  }

  return result.slice(0, count)
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

  for (const seg of segments) {
    const text = seg.text.toLowerCase()
    for (const word of IMPORTANT_WORDS) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      if (regex.test(text)) {
        moments.push({
          time: seg.start,
          description: text.slice(0, 80).trim(),
          confidence: word.length > 4 ? 0.7 : 0.5,
        })
        break
      }
    }
  }

  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const matches = [...fullText.matchAll(regex)]
    if (matches.length === 1) {
      const lastSeg = segments[segments.length - 1]
      if (lastSeg) {
        const approxTime = ((matches[0].index ?? 0) / fullText.length) * lastSeg.end
        const seg = segments.find(
          (s) => s.start <= approxTime && s.end >= approxTime,
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
  }

  return moments.sort((a, b) => a.time - b.time)
}

function detectEmotionalMoments(
  segments: { start: number; end: number; text: string }[],
): ContentAnalysis['emotionalMoments'] {
  const moments: ContentAnalysis['emotionalMoments'] = []

  for (const seg of segments) {
    const text = seg.text.toLowerCase()
    for (const [emotion, words] of Object.entries(EMOTIONAL_WORDS)) {
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

const PROPER_NOUN_PATTERNS = [
  /(?:this is|meet|introducing|welcome|here's|here is|say hello to) (\w+(?:\s\w+)?)/i,
  /(?:my name is|i'm|i am) (\w+(?:\s\w+)?)/i,
  /(?:check out|try|use|get) (?:the |a |an )?(\w+(?:\s\w+)?)/i,
  /(?:have you (?:tried|seen|used|heard of) )(\w+(?:\s\w+)?)/i,
  /(?:the best|the worst|the most) (\w+(?:\s\w+)?)/i,
]

const KNOWN_ENTITY_PATTERNS = [
  /(?:iPhone|iPad|Mac|Windows|Android|Samsung|Google|Apple|Microsoft|Amazon|Netflix|Spotify|PlayStation|Xbox|Nintendo)/gi,
  /(?:React|Node|Python|JavaScript|TypeScript|Docker|Kubernetes|AWS|Vue|Angular)/gi,
  /(?:YouTube|TikTok|Instagram|Twitter|Facebook|Snapchat|Reddit|Discord)/gi,
  /(?:Tesla|Toyota|Honda|BMW|Mercedes|Ford|Nike|Adidas|Puma)/gi,
  /(?:[A-Z][a-z]+ (?:Pro|Max|Ultra|Air|Mini|Plus|X|S|XL|LTE|5G|HD|4K))/g,
]

const ARABIC_STOP_WORDS = new Set([
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'كان', 'هذا', 'هذه',
  'ذلك', 'تلك', 'هو', 'هي', 'هم', 'هن', 'انا', 'نحن', 'ان', 'إن',
  'ما', 'لا', 'لم', 'لن', 'هل', 'قد', 'لقد', 'اذا', 'إذا', 'لكن',
  'او', 'أو', 'ثم', 'بعد', 'قبل', 'فوق', 'تحت', 'بين', 'خلال', 'دون',
  'حتى', 'عند', 'حول', 'كما', 'مثل', 'غير', 'سوى', 'كل', 'بعض', 'اي',
  'أي', 'ايضا', 'أيضا', 'لذلك', 'لأن', 'حيث', 'بينما', 'الذي', 'التي',
  'الذين', 'اللذين', 'اللواتي', 'اللائي', 'فهو', 'فهي', 'فهم', 'فهن',
  'كانت', 'كانوا', 'تكون', 'يكون', 'ليست', 'ليس', 'هل', 'مازال', 'مازالت',
  'مازالوا', 'انها', 'انه', 'انهم', 'انهما', 'انكما', 'انكن',
])

function extractSubjects(
  segments: { start: number; end: number; text: string }[],
  fullText: string,
): string[] {
  const subjects: string[] = []

  const knownEntities: string[] = []
  for (const pattern of KNOWN_ENTITY_PATTERNS) {
    const matches = [...fullText.matchAll(pattern)]
    for (const m of matches) {
      const entity = m[0].trim()
      if (entity.length > 2) knownEntities.push(entity)
    }
  }

  for (const pattern of PROPER_NOUN_PATTERNS) {
    for (const seg of segments) {
      const matches = [...seg.text.matchAll(pattern)]
      for (const m of matches) {
        const candidate = (m[1] ?? '').trim()
        if (
          candidate.length > 2 &&
          !/^(the|a|an|this|that|it|and|or|so|for|in|on|at|to)$/i.test(candidate) &&
          !ARABIC_STOP_WORDS.has(candidate)
        ) {
          subjects.push(candidate)
        }
      }
    }
  }

  const sentences = fullText.split(/[.!?]+/).filter(Boolean)
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/)
    if (words.length < 3) continue

    const firstWord = words[0].replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
    const secondWord = words[1]?.replace(/[^a-zA-Z\u0600-\u06FF]/g, '')

    if (firstWord.length > 2) {
      const isEnglishCapital = /^[A-Z]/.test(firstWord)
      const isArabic = /^[\u0600-\u06FF]/.test(firstWord)

      const isSkipWord = /^(the|a|an|so|and|but|or|if|when|while|because|however|therefore)$/i.test(firstWord)
      const isArabicSkip = ARABIC_STOP_WORDS.has(firstWord)

      if (isEnglishCapital && !isSkipWord && !isArabic) {
        subjects.push(firstWord)
        if (secondWord && secondWord.length > 2 && /^[a-z]/.test(secondWord) === false) {
          subjects.push(firstWord + ' ' + secondWord)
        }
      }

      if (isArabic && !isArabicSkip && !isSkipWord) {
        const freq = sentences.filter((s) => s.toLowerCase().includes(firstWord.toLowerCase())).length
        if (freq >= 2) {
          subjects.push(firstWord)
          if (secondWord && secondWord.length > 2 && !ARABIC_STOP_WORDS.has(secondWord)) {
            subjects.push(firstWord + ' ' + secondWord)
          }
        }
      }
    }

    const capitalizedWords = words
      .filter((w) => /^[A-Z][a-z]/.test(w) && w.length > 2)
      .slice(0, 3)
    for (const cw of capitalizedWords) {
      const cleaned = cw.replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
      if (cleaned.length > 2) subjects.push(cleaned)
    }
  }

  const bigramFreq: Record<string, { phrase: string; count: number }> = {}
  for (let i = 0; i < sentences.length; i++) {
    const ws = sentences[i].trim().split(/\s+/)
    for (let j = 0; j < ws.length - 1; j++) {
      const w1 = ws[j].replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
      const w2 = ws[j + 1].replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
      if (
        w1.length > 2 && w2.length > 2 &&
        !ARABIC_STOP_WORDS.has(w1) && !ARABIC_STOP_WORDS.has(w2)
      ) {
        const pair = (w1 + ' ' + w2).toLowerCase()
        if (!bigramFreq[pair]) bigramFreq[pair] = { phrase: w1 + ' ' + w2, count: 0 }
        bigramFreq[pair].count++
      }
    }
  }

  const frequentBigrams = Object.values(bigramFreq)
    .filter((b) => b.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((b) => b.phrase)

  const allCandidates = [...knownEntities, ...subjects, ...frequentBigrams]
  const freq: Record<string, number> = {}
  for (const s of allCandidates) {
    const lower = s.toLowerCase()
    freq[lower] = (freq[lower] ?? 0) + 1
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => {
      const multiWordBest = allCandidates.find(
        (c) => c.toLowerCase() === word && c.includes(' '),
      )
      if (multiWordBest) return multiWordBest
      const entityBest = allCandidates.find(
        (c) => c.toLowerCase() === word && knownEntities.some((e) => e.toLowerCase() === word),
      )
      if (entityBest) return entityBest
      return allCandidates.find((c) => c.toLowerCase() === word) ?? word
    })
}

function extractObjects(
  text: string,
  keywords: string[],
  segments: { start: number; end: number; text: string }[],
): string[] {
  const objects: string[] = []

  const patterns = [
    /(?:the|a|an|this|that) (\w+(?:\s\w+)?) (?:is|was|has|looks|feels|costs|measures|weighs)/gi,
    /(?:check (?:out|this) )(\w+(?:\s\w+)?)/gi,
    /(?:here('s| is) )(?:the|a|an) (\w+(?:\s\w+)?)/gi,
    /(?:let me show you )(?:the|a|an) (\w+(?:\s\w+)?)/gi,
    /(?:this is )(?:the|a|an) (\w+(?:\s\w+)?)/gi,
    /(?:it (?:has|comes with|includes|features) )(?:a |an |the )?(\w+(?:\s\w+)?)/gi,
    /(?:you (?:get|have|need|can use) )(?:a |an |the )?(\w+(?:\s\w+)?)/gi,
    /(?:it('s| is) (?:made of|powered by|built with) )(\w+(?:\s\w+)?)/gi,
  ]

  for (const p of patterns) {
    const matches = [...text.matchAll(p)]
    for (const m of matches) {
      const obj = (m[1] ?? m[2] ?? '').replace(/[^a-zA-Z0-9\s\u0600-\u06FF]/g, '').trim()
      if (obj.length > 2 && !/^(the|a|an|this|that|it|and|or|for|but)$/i.test(obj)) {
        objects.push(obj)
      }
    }
  }

  if (segments.length > 0) {
    for (const seg of segments.slice(0, 20)) {
      for (const pattern of KNOWN_ENTITY_PATTERNS) {
        const matches = [...seg.text.matchAll(pattern)]
        for (const m of matches) {
          objects.push(m[0])
        }
      }
    }
  }

  const freq: Record<string, number> = {}
  for (const obj of objects) {
    const lower = obj.toLowerCase()
    freq[lower] = (freq[lower] ?? 0) + 1
  }

  const uniqueObjects = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([_, __], i, arr) => {
      const original = [...new Set(objects)][i]
      return original
    })
    .filter(Boolean)

  const all = [...uniqueObjects, ...keywords.filter((k) => !uniqueObjects.includes(k))]
  return [...new Set(all)].slice(0, 10)
}

export function detectHooks(
  segments: { start: number; end: number; text: string }[],
  maxStartTime?: number,
): HookInfo[] {
  const hooks: HookInfo[] = []

  for (const seg of segments) {
    if (maxStartTime !== undefined && seg.start > maxStartTime) break

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
