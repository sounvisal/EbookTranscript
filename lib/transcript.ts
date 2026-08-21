export type TranscriptSegment = {
  start: number
  end?: number
  text: string
}

type TranscriptSegmentInput = {
  start?: unknown
  end?: unknown
  text?: unknown
}

type StructuredTranscriptPayload = {
  language?: unknown
  text?: unknown
  transcript?: unknown
  segments?: TranscriptSegmentInput[]
}

type ParsedStructuredTranscript = {
  language?: string
  text?: string
  segments: TranscriptSegment[]
}

const WORDS_PER_SECOND = 2.6
const MAX_WORDS_PER_SEGMENT = 34
const MIN_SEGMENT_SECONDS = 2.5
const TIMESTAMP_VALUE = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?'
const TIMESTAMP_LINE_PATTERN = new RegExp(
  `^\\s*(?:[\\[{(]\\s*)?(${TIMESTAMP_VALUE})(?:\\s*[\\]})])?\\s*(.*)$`
)
const BRACKETED_TIMESTAMP_PATTERN = new RegExp(
  `(^|\\n)\\s*[\\[{(]\\s*${TIMESTAMP_VALUE}\\s*[\\]})]\\s*`,
  'g'
)
const BARE_TIMESTAMP_PATTERN = new RegExp(
  `(^|\\n)\\s*${TIMESTAMP_VALUE}\\s+`,
  'g'
)

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function looksLikeJsonStructure(text: string) {
  const trimmed = stripJsonFence(text)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return true
  }
  return /"(?:segments|transcript|text|language|start|end)"\s*:/i.test(trimmed)
}

function getJsonObjectCandidates(value: string) {
  const cleanedValue = stripJsonFence(value)
  const candidates = [cleanedValue]
  const firstBrace = cleanedValue.indexOf('{')
  const lastBrace = cleanedValue.lastIndexOf('}')
  const firstBracket = cleanedValue.indexOf('[')
  const lastBracket = cleanedValue.lastIndexOf(']')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleanedValue.slice(firstBrace, lastBrace + 1))
  }

  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(cleanedValue.slice(firstBracket, lastBracket + 1))
  }

  return Array.from(new Set(candidates)).filter((candidate) => (
    (candidate.startsWith('{') && candidate.endsWith('}')) ||
    (candidate.startsWith('[') && candidate.endsWith(']'))
  ))
}

function cleanLooseJsonScalar(value: string) {
  return value.trim().replace(/^"|"$/g, '')
}

function decodeLooseJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
  }
}

function getPlainTextValue(payload: StructuredTranscriptPayload) {
  if (typeof payload.text === 'string') {
    return stripTimestampMarkers(payload.text)
  }

  if (typeof payload.transcript === 'string') {
    return stripTimestampMarkers(payload.transcript)
  }

  return ''
}

function parseLooseStructuredTranscript(value: string): StructuredTranscriptPayload | null {
  const languageMatch = value.match(/"language"\s*:\s*"([^"]+)"/i)
  const segments: TranscriptSegmentInput[] = []

  // 1. Try matching complete object blocks { ... }
  const objectBlockPattern = /\{([^{}]+)\}/g
  let match: RegExpExecArray | null

  while ((match = objectBlockPattern.exec(value)) !== null) {
    const block = match[1]
    const textMatch = block.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/i)
    if (!textMatch) continue

    const text = decodeLooseJsonString(textMatch[1]).trim()
    if (!text) continue

    const startMatch = block.match(/"start"\s*:\s*("([^"]+)"|([0-9.]+))/i)
    const endMatch = block.match(/"end"\s*:\s*("([^"]+)"|([0-9.]+))/i)

    const rawStart = startMatch ? (startMatch[2] ?? startMatch[3]) : 0
    const rawEnd = endMatch ? (endMatch[2] ?? endMatch[3]) : undefined

    segments.push({
      start: cleanLooseJsonScalar(String(rawStart)),
      end: rawEnd !== undefined ? cleanLooseJsonScalar(String(rawEnd)) : undefined,
      text
    })
  }

  // 2. If no object blocks matched, try unclosed segment
  if (segments.length === 0) {
    const unclosedPattern = /\{\s*(?:[^{}]*?"text"\s*:\s*"((?:\\.|[^"\\])*)"[^{}]*?)/gi
    while ((match = unclosedPattern.exec(value)) !== null) {
      const block = match[0]
      const textMatch = block.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/i)
      if (!textMatch) continue

      const text = decodeLooseJsonString(textMatch[1]).trim()
      if (!text) continue

      const startMatch = block.match(/"start"\s*:\s*("([^"]+)"|([0-9.]+))/i)
      const endMatch = block.match(/"end"\s*:\s*("([^"]+)"|([0-9.]+))/i)

      segments.push({
        start: startMatch ? cleanLooseJsonScalar(startMatch[2] ?? startMatch[3]) : 0,
        end: endMatch ? cleanLooseJsonScalar(endMatch[2] ?? endMatch[3]) : undefined,
        text
      })
    }
  }

  // 3. If still empty, check for standalone "text" or "transcript" string field
  let topLevelText = ''
  if (segments.length === 0) {
    const topLevelTextMatch = value.match(/"(?:text|transcript)"\s*:\s*"((?:\\.|[^"\\])*)"/i)
    if (topLevelTextMatch) {
      topLevelText = decodeLooseJsonString(topLevelTextMatch[1]).trim()
    }
  }

  if (!segments.length && !topLevelText) {
    return null
  }

  return {
    language: languageMatch?.[1] || 'auto',
    segments,
    text: topLevelText || undefined
  }
}

function toFiniteSeconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const parsedTimestamp = parseTimestampToSeconds(value)
  if (parsedTimestamp !== null) {
    return parsedTimestamp
  }

  const parsedDotTimestamp = parseDotSeparatedTimestampToSeconds(value)
  if (parsedDotTimestamp !== null) {
    return parsedDotTimestamp
  }

  const parsedNumber = Number.parseFloat(value)
  return Number.isFinite(parsedNumber) ? Math.max(0, parsedNumber) : null
}

function withSegmentEnds(segments: TranscriptSegment[]) {
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1]
    const estimatedDuration = Math.max(MIN_SEGMENT_SECONDS, countWords(segment.text) / WORDS_PER_SECOND)
    const nextStart = nextSegment?.start
    const end =
      typeof segment.end === 'number' && segment.end > segment.start
        ? segment.end
        : typeof nextStart === 'number' && nextStart > segment.start
          ? nextStart
          : segment.start + estimatedDuration

    return { ...segment, end }
  })
}

function splitLongText(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const chunks: string[] = []

  paragraphs.forEach((paragraph) => {
    const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [paragraph]
    let currentChunk = ''
    let currentWordCount = 0

    sentences.forEach((sentence) => {
      const trimmedSentence = sentence.trim()
      if (!trimmedSentence) return

      const sentenceWordCount = countWords(trimmedSentence)
      if (currentChunk && currentWordCount + sentenceWordCount > MAX_WORDS_PER_SEGMENT) {
        chunks.push(currentChunk)
        currentChunk = trimmedSentence
        currentWordCount = sentenceWordCount
        return
      }

      currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence
      currentWordCount += sentenceWordCount
    })

    if (currentChunk) {
      chunks.push(currentChunk)
    }
  })

  return chunks
}

export function parseTimestampToSeconds(value: string) {
  const normalizedValue = value.trim().replace(',', '.')
  if (!/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?$/.test(normalizedValue)) {
    return null
  }

  const parts = normalizedValue.split(':')
  const secondsPart = Number.parseFloat(parts.pop() || '0')
  const minutes = Number.parseInt(parts.pop() || '0', 10)
  const hours = Number.parseInt(parts.pop() || '0', 10)

  if (![secondsPart, minutes, hours].every(Number.isFinite)) {
    return null
  }

  return Math.max(0, hours * 3600 + minutes * 60 + secondsPart)
}

function parseDotSeparatedTimestampToSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,3})\.(\d{1,2})\.(\d{1,3})$/)
  if (!match) {
    return null
  }

  const minutes = Number.parseInt(match[1], 10)
  const seconds = Number.parseInt(match[2], 10)
  const fraction = Number.parseFloat(`0.${match[3]}`)

  if (![minutes, seconds, fraction].every(Number.isFinite) || seconds >= 60) {
    return null
  }

  return Math.max(0, minutes * 60 + seconds + fraction)
}

export function stripTimestampMarkers(text: string) {
  return text
    .replace(BRACKETED_TIMESTAMP_PATTERN, '$1')
    .replace(BARE_TIMESTAMP_PATTERN, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractTimestampedSegments(text: string) {
  const lines = text.split(/\r?\n/)
  const segments: TranscriptSegment[] = []
  let currentSegment: TranscriptSegment | null = null

  for (const line of lines) {
    const match = line.match(TIMESTAMP_LINE_PATTERN)
    const timestampSeconds = match ? parseTimestampToSeconds(match[1]) : null

    if (timestampSeconds !== null) {
      if (currentSegment && currentSegment.text.trim()) {
        segments.push({ ...currentSegment, text: stripTimestampMarkers(currentSegment.text) })
      }

      currentSegment = {
        start: timestampSeconds,
        text: stripTimestampMarkers(match?.[2] || '')
      }
      continue
    }

    if (currentSegment) {
      currentSegment.text = currentSegment.text
        ? `${currentSegment.text}\n${line.trim()}`
        : line.trim()
    }
  }

  if (currentSegment && currentSegment.text.trim()) {
    segments.push({ ...currentSegment, text: stripTimestampMarkers(currentSegment.text) })
  }

  return withSegmentEnds(segments.filter((segment) => segment.text.trim()))
}

export function normalizeTranscriptSegments(inputSegments?: TranscriptSegmentInput[] | null) {
  if (!inputSegments?.length) {
    return []
  }

  const segments = inputSegments
    .map((segment) => {
      const start = toFiniteSeconds(segment.start)
      const end = toFiniteSeconds(segment.end)
      const text = typeof segment.text === 'string' ? stripTimestampMarkers(segment.text) : ''

      if (start === null || !text.trim()) {
        return null
      }

      return {
        start,
        ...(end !== null ? { end } : {}),
        text: text.trim()
      }
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment))

  return withSegmentEnds(segments)
}

export function parseStructuredTranscriptText(text: string): ParsedStructuredTranscript | null {
  const cleanedValue = stripJsonFence(text)
  const candidates = getJsonObjectCandidates(text)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        const segments = normalizeTranscriptSegments(parsed)
        if (segments.length) {
          return {
            language: 'auto',
            text: segments.map((segment) => segment.text).join('\n\n'),
            segments
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const payload = parsed as StructuredTranscriptPayload
        const segments = normalizeTranscriptSegments(Array.isArray(payload.segments) ? payload.segments : [])
        const plainText = getPlainTextValue(payload)
        const textFromSegments = segments.map((segment) => segment.text).join('\n\n')
        const language = typeof payload.language === 'string' && payload.language.trim()
          ? payload.language.trim()
          : undefined

        // Always choose the complete full text from segments if segments are present and longer
        const fullText = (segments.length > 0 && textFromSegments.length >= (plainText?.length || 0))
          ? textFromSegments
          : (plainText || textFromSegments)

        if (segments.length || fullText) {
          return {
            language,
            text: fullText,
            segments
          }
        }
      }
    } catch {
      // Try a looser parser below for model output that looks like JSON but is not valid JSON.
    }
  }

  const loosePayload = parseLooseStructuredTranscript(cleanedValue)
  if (!loosePayload) {
    return null
  }

  const segments = normalizeTranscriptSegments(loosePayload.segments)
  if (!segments.length && !loosePayload.text) {
    return null
  }

  return {
    language: typeof loosePayload.language === 'string' ? loosePayload.language : undefined,
    text: (typeof loosePayload.text === 'string' && loosePayload.text) ? loosePayload.text : segments.map((segment) => segment.text).join('\n\n'),
    segments
  }
}

export function getPlainTranscriptText(text: string, segments?: TranscriptSegmentInput[] | null) {
  const normalizedSegments = normalizeTranscriptSegments(segments)
  if (normalizedSegments.length) {
    return normalizedSegments.map((segment) => segment.text).join('\n\n')
  }

  const structuredTranscript = parseStructuredTranscriptText(text)
  if (structuredTranscript?.segments.length) {
    return structuredTranscript.segments.map((segment) => segment.text).join('\n\n')
  }

  if (structuredTranscript?.text) {
    return structuredTranscript.text
  }

  // If the text looks like a JSON structure/fragment but yielded no speech text,
  // do not return the raw JSON syntax. Return empty string.
  if (looksLikeJsonStructure(text)) {
    return ''
  }

  return stripTimestampMarkers(text)
}

export function buildDisplaySegments(text: string, segments?: TranscriptSegmentInput[] | null, duration?: number | null) {
  const normalizedSegments = normalizeTranscriptSegments(segments)
  if (normalizedSegments.length) {
    return normalizedSegments
  }

  const structuredTranscript = parseStructuredTranscriptText(text)
  if (structuredTranscript?.segments.length) {
    return structuredTranscript.segments
  }

  const timestampedSegments = extractTimestampedSegments(text)
  if (timestampedSegments.length) {
    return timestampedSegments
  }

  // If text looks like raw JSON with no valid segments, do not create display segments from JSON syntax
  if (looksLikeJsonStructure(text)) {
    const plainText = getPlainTranscriptText(text)
    if (!plainText.trim()) {
      return []
    }
    const chunks = splitLongText(plainText)
    if (!chunks.length) return []
    const totalWords = Math.max(1, chunks.reduce((sum, chunk) => sum + countWords(chunk), 0))
    const estimatedTotalDuration =
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? duration
        : Math.max(chunks.length * MIN_SEGMENT_SECONDS, totalWords / WORDS_PER_SECOND)

    let currentStart = 0
    const displaySegments = chunks.map((chunk) => {
      const segmentDuration = Math.max(
        MIN_SEGMENT_SECONDS,
        estimatedTotalDuration * (countWords(chunk) / totalWords)
      )
      const segment = {
        start: currentStart,
        end: currentStart + segmentDuration,
        text: chunk
      }
      currentStart += segmentDuration
      return segment
    })

    return withSegmentEnds(displaySegments)
  }

  const cleanText = stripTimestampMarkers(text)
  const chunks = splitLongText(cleanText)
  if (!chunks.length) {
    return []
  }

  const totalWords = Math.max(1, chunks.reduce((sum, chunk) => sum + countWords(chunk), 0))
  const estimatedTotalDuration =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : Math.max(chunks.length * MIN_SEGMENT_SECONDS, totalWords / WORDS_PER_SECOND)

  let currentStart = 0
  const displaySegments = chunks.map((chunk) => {
    const segmentDuration = Math.max(
      MIN_SEGMENT_SECONDS,
      estimatedTotalDuration * (countWords(chunk) / totalWords)
    )
    const segment = {
      start: currentStart,
      end: currentStart + segmentDuration,
      text: chunk
    }
    currentStart += segmentDuration
    return segment
  })

  return withSegmentEnds(displaySegments)
}

export function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function formatSrtTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000)

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(wholeSeconds).padStart(2, '0')
  ].join(':') + `,${String(milliseconds).padStart(3, '0')}`
}

export function formatVttTimestamp(seconds: number) {
  return formatSrtTimestamp(seconds).replace(',', '.')
}
