import type { TranscriptSegment } from './transcript'

export type SyncToken = { text: string; start?: number; end?: number }

export function splitTranscriptWords(text: string): Array<{ text: string; word: boolean }> {
  if (typeof Intl.Segmenter === 'function') {
    const locale = /[\u1780-\u17ff]/.test(text) ? 'km' : 'en'
    return Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(text),
      part => ({ text: part.segment, word: Boolean(part.isWordLike) }))
  }
  return (text.match(/\s+|[^\s]+/gu) || []).map(text => ({ text, word: Boolean(text.trim()) }))
}

/** Sentence timing cannot provide exact word alignment. Keep estimates explicit. */
export function buildWordTimeline(segment: TranscriptSegment, body: string, nextStart?: number) {
  const end = Math.max(segment.start, Math.min(
    segment.end ?? nextStart ?? segment.start + 5,
    nextStart !== undefined && nextStart > segment.start ? nextStart : Infinity
  ))
  const parts = splitTranscriptWords(body)
  const spoken = parts.filter(part => part.word)
  const words = segment.words
  const sameWord = (a: string, b: string) => a.normalize('NFKC').replace(/[\p{P}\s]/gu, '').toLowerCase()
    === b.normalize('NFKC').replace(/[\p{P}\s]/gu, '').toLowerCase()
  const measured = Boolean(words?.length && words.length === spoken.length && words.every((word, i) =>
    sameWord(word.text, spoken[i].text) && Number.isFinite(word.start) && Number.isFinite(word.end)
    && word.start >= segment.start && word.end <= end && word.end > word.start
    && (i === 0 || word.start >= words[i - 1].end)))
  const graphemes = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('km', { granularity: 'grapheme' }) : null
  const weights = spoken.map(part => Math.pow(Math.max(1,
    graphemes ? Array.from(graphemes.segment(part.text)).length : Array.from(part.text).length), 0.65))
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  let index = 0
  let elapsed = 0
  const tokens: SyncToken[] = parts.map(part => {
    if (!part.word) return { text: part.text }
    const word = measured ? words![index] : undefined
    const start = word?.start ?? segment.start + (elapsed / total) * (end - segment.start)
    elapsed += weights[index++]
    return { text: part.text, start, end: word?.end ?? segment.start + (elapsed / total) * (end - segment.start) }
  })
  return { tokens, end, estimated: !measured }
}
