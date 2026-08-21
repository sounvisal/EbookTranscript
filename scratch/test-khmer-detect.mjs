import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY

const KHMER_ENGLISH_PROMPT = [
  'You are a high-accuracy multilingual audio transcription system specialized in automatic language detection, particularly Khmer (ភាសាខ្មែរ), English, and bilingual speech.',
  'Listen carefully to the entire audio from 0:00 to the end.',
  '1. AUTOMATIC LANGUAGE DETECTION: Automatically detect the spoken language. If the audio is in Khmer, set language to "Khmer". If in English, set language to "English". If the speaker mixes Khmer and English (code-switching), set language to "Khmer / English". For other languages (Chinese, Thai, Vietnamese, French, etc.), detect and set accordingly.',
  '2. VERBATIM ACCURACY: Transcribe every spoken word accurately in the original script. For Khmer speech, output clean Khmer script (អក្សរខ្មែរ). For English speech, output English. For mixed speech, write Khmer words in Khmer and English loanwords/technical terms in English.',
  '3. COMPLETE TRANSCRIPTION: Do not summarize or skip words, even with background music or sound effects.',
  'Format strictly as JSON:',
  '{"language":"Khmer","text":"អត្ថបទពេញលេញ...","segments":[{"start":0.0,"end":3.5,"text":"ឃ្លាទីមួយ"}]}'
].join(' ')

async function testPrompt() {
  console.log('Testing Khmer prompt on gemini-3.6-flash...')
  try {
    const res = await streamGeminiTranscript(key, {
      modelName: 'gemini-3.6-flash',
      prompt: KHMER_ENGLISH_PROMPT,
      inlineData: Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary'),
      mimeType: 'audio/wav'
    })
    console.log('Output:', res)
  } catch (err) {
    console.log('Error:', err.message)
  }
}

testPrompt()
