import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
console.log('Testing key:', key ? key.slice(0, 10) + '...' : 'NONE')

async function run() {
  try {
    const prompt = [
      'Transcribe all spoken words and audio verbatim from start to finish without skipping, truncating, summarizing, or omitting any part of the recording.',
      'Detect the spoken language automatically (e.g. Khmer, English, etc.).',
      'Format the output strictly as JSON with this exact shape:',
      '{"language":"auto","text":"Full continuous transcript here","segments":[{"start":0.0,"end":4.2,"text":"spoken phrase"}]}',
      'Ensure "text" contains the complete full transcript text.'
    ].join(' ')

    console.log('Testing text generation with streamGeminiTranscript...')
    let received = ''
    const res = await streamGeminiTranscript(key, {
      modelName: 'gemini-2.5-flash-lite',
      prompt: 'Say: Hello world, welcome to transcription in JSON format with language and segments',
      inlineData: Buffer.from('test dummy'),
      mimeType: 'text/plain',
      onText: (t) => { received = t }
    })
    console.log('Result:\n', res)
  } catch (err) {
    console.error('Error:', err)
  }
}

run()
