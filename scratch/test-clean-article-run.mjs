import { formatCleanArticle, getPlainTranscriptText } from '../lib/transcript.ts'

const sampleSpeechSegments = [
  { start: 0, text: "hey guys welcome back to the channel" },
  { start: 2.5, text: "in today's video we're going to explore" },
  { start: 5.1, text: "how modern AI audio models work under the hood." },
  { start: 8.8, text: "when you upload an audio or video file" },
  { start: 12.0, text: "the neural network detects every single spoken phoneme" },
  { start: 16.0, text: "and converts it directly into natural written language." },
  { start: 20.5, text: "it works across dozens of languages seamlessly" },
  { start: 24.0, text: "including Khmer, English, Chinese, and many more." },
  { start: 28.5, text: "make sure to hit like and subscribe for more tutorials." }
]

console.log('--- CLEAN ARTICLE OUTPUT ---')
console.log(getPlainTranscriptText('', sampleSpeechSegments))
