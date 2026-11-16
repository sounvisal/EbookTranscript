import assert from 'node:assert/strict'
import { buildWordTimeline, splitTranscriptWords } from '../lib/transcriptSync.ts'
import { normalizeTranscriptSegments, parseStructuredTranscriptText, serializeTranscriptForStorage, getPlainTranscriptText } from '../lib/transcript.ts'

const text = 'Hello beautiful world.'
const segment = { start: 0, end: 4, text, words: [
  { text: 'Hello', start: 0, end: 0.4 }, { text: 'beautiful', start: 1.2, end: 2.4 }, { text: 'world', start: 3, end: 3.8 }
] }
const timeline = buildWordTimeline(segment, text)
assert.equal(timeline.estimated, false)
assert.equal(timeline.tokens.map(token => token.text).join(''), text)
assert.equal(timeline.tokens.find(token => token.start <= 0.8 && token.end > 0.8), undefined, 'do not highlight silence between supplied words')
assert.equal(timeline.tokens.find(token => token.start <= 1.8 && token.end > 1.8).text, 'beautiful')
const khmer = 'សួស្តីអ្នកទាំងអស់គ្នា ខ្ញុំចូលចិត្តរៀនភាសាខ្មែរ។'
const parts = splitTranscriptWords(khmer)
assert.equal(parts.map(part => part.text).join(''), khmer)
assert.ok(parts.filter(part => part.word).length > khmer.split(' ').length, 'Khmer words must not be split only on spaces')
const estimated = buildWordTimeline({ start: 2, end: 9, text: khmer }, khmer, 7)
assert.equal(estimated.estimated, true)
assert.ok(estimated.tokens.filter(token => token.end !== undefined).every(token => token.end <= 7), 'never highlight into the next sentence')
assert.equal(buildWordTimeline({ ...segment, words: segment.words.slice(1) }, text).estimated, true, 'reject stale word mappings after edits')
const stored = serializeTranscriptForStorage(text, [segment])
assert.equal(getPlainTranscriptText(stored), getPlainTranscriptText(text))
assert.deepEqual(parseStructuredTranscriptText(stored).segments, normalizeTranscriptSegments([segment]))
assert.equal(serializeTranscriptForStorage('Different corrected text', [segment]), 'Different corrected text', 'do not retain timing for different text')
console.log('Passed Khmer word boundaries, supplied word timestamps and pauses, timing bounds, and storage round trip.')
