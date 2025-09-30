/**
 * Response validation and quality checks for LLM outputs
 * Ensures responses are appropriate length and quality
 */

export interface ValidationResult {
  isValid: boolean
  issues: string[]
  shouldTruncate: boolean
  suggestedMaxLength?: number
}

export interface ResponseMetrics {
  length: number
  wordCount: number
  paragraphs: number
  hasCode: boolean
  codeBlockCount: number
  estimatedReadTime: number // in seconds
}

const MAX_RESPONSE_LENGTH = 4000 // characters
const MAX_WORD_COUNT = 800 // words
const IDEAL_RESPONSE_LENGTH = 2000 // characters
const MAX_PARAGRAPHS = 15

/**
 * Analyze response metrics
 */
export function analyzeResponse(response: string): ResponseMetrics {
  const length = response.length
  const words = response.trim().split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length
  const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0).length
  const hasCode = /```[\s\S]*?```|`[^`]+`/.test(response)
  const codeBlockCount = (response.match(/```[\s\S]*?```/g) || []).length

  // Estimate read time: ~200 words per minute
  const estimatedReadTime = Math.ceil(wordCount / 200 * 60)

  return {
    length,
    wordCount,
    paragraphs,
    hasCode,
    codeBlockCount,
    estimatedReadTime
  }
}

/**
 * Validate response quality and length
 */
export function validateResponse(response: string, userQuery: string): ValidationResult {
  const issues: string[] = []
  const metrics = analyzeResponse(response)
  let shouldTruncate = false
  let suggestedMaxLength: number | undefined

  // Check for empty response
  if (!response || response.trim().length === 0) {
    issues.push('Empty response')
    return { isValid: false, issues, shouldTruncate: false }
  }

  // Check for response that's just an error message
  if (response.toLowerCase().includes('i cannot') ||
      response.toLowerCase().includes('i apologize') ||
      response.toLowerCase().includes('error:')) {
    issues.push('Response appears to be an error or refusal')
  }

  // Check length
  if (metrics.length > MAX_RESPONSE_LENGTH) {
    issues.push(`Response too long (${metrics.length} chars, max ${MAX_RESPONSE_LENGTH})`)
    shouldTruncate = true
    suggestedMaxLength = IDEAL_RESPONSE_LENGTH
  }

  // Check word count
  if (metrics.wordCount > MAX_WORD_COUNT) {
    issues.push(`Too many words (${metrics.wordCount}, max ${MAX_WORD_COUNT})`)
    if (!shouldTruncate) {
      shouldTruncate = true
      suggestedMaxLength = IDEAL_RESPONSE_LENGTH
    }
  }

  // Check paragraph count
  if (metrics.paragraphs > MAX_PARAGRAPHS && !metrics.hasCode) {
    issues.push(`Too many paragraphs (${metrics.paragraphs}, max ${MAX_PARAGRAPHS})`)
  }

  // Check for repetition (same sentence repeated)
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 20)
  const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()))
  const repetitionRate = 1 - (uniqueSentences.size / sentences.length)

  if (repetitionRate > 0.3) {
    issues.push('Response contains significant repetition')
  }

  // Check relevance (basic keyword matching)
  const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const responseWords = response.toLowerCase().split(/\s+/)
  const matchedWords = queryWords.filter(qw => responseWords.some(rw => rw.includes(qw)))
  const relevanceScore = matchedWords.length / Math.max(queryWords.length, 1)

  if (relevanceScore < 0.2 && queryWords.length > 0) {
    issues.push('Response may not be relevant to query')
  }

  const isValid = issues.length === 0 || (issues.length === 1 && shouldTruncate)

  return {
    isValid,
    issues,
    shouldTruncate,
    suggestedMaxLength
  }
}

/**
 * Intelligently truncate response while preserving meaning
 */
export function truncateResponse(response: string, maxLength: number): string {
  if (response.length <= maxLength) {
    return response
  }

  // Try to truncate at paragraph boundary
  const paragraphs = response.split(/\n\n+/)
  let truncated = ''

  for (const para of paragraphs) {
    if (truncated.length + para.length + 4 <= maxLength) {
      truncated += para + '\n\n'
    } else {
      break
    }
  }

  // If we got a decent amount, return it
  if (truncated.length > maxLength * 0.7) {
    return truncated.trim() + '\n\n[Response truncated for brevity]'
  }

  // Otherwise, truncate at sentence boundary
  const sentences = response.split(/([.!?]+\s+)/)
  truncated = ''

  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i] + (sentences[i + 1] || '')
    if (truncated.length + sentence.length <= maxLength) {
      truncated += sentence
    } else {
      break
    }
  }

  if (truncated.length > 100) {
    return truncated.trim() + '\n\n[Response truncated for brevity]'
  }

  // Last resort: hard truncate at word boundary
  const words = response.split(/\s+/)
  truncated = ''

  for (const word of words) {
    if (truncated.length + word.length + 1 <= maxLength - 50) {
      truncated += word + ' '
    } else {
      break
    }
  }

  return truncated.trim() + '...\n\n[Response truncated]'
}

/**
 * Get quality score (0-100)
 */
export function getQualityScore(response: string, userQuery: string): number {
  const validation = validateResponse(response, userQuery)
  const metrics = analyzeResponse(response)

  let score = 100

  // Penalize issues
  score -= validation.issues.length * 15

  // Penalize extreme lengths
  if (metrics.length > MAX_RESPONSE_LENGTH) {
    score -= 20
  } else if (metrics.length > IDEAL_RESPONSE_LENGTH) {
    score -= 10
  }

  // Bonus for ideal length
  if (metrics.length >= 200 && metrics.length <= IDEAL_RESPONSE_LENGTH) {
    score += 10
  }

  // Bonus for good structure
  if (metrics.paragraphs >= 2 && metrics.paragraphs <= 8) {
    score += 5
  }

  return Math.max(0, Math.min(100, score))
}