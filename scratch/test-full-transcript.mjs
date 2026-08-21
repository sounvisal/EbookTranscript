import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'
import { parseStructuredTranscriptText, getPlainTranscriptText } from '../lib/transcript.ts'

const key = process.env.GEMINI_API_KEY

async function testPrompt() {
  const prompt = [
    'You are a professional verbatim transcription system.',
    'Listen to the audio and transcribe ALL spoken words verbatim from 0:00 to the very end.',
    'Detect the spoken language automatically.',
    'Format output strictly as JSON with this exact schema:',
    '{"language":"auto","text":"Full continuous transcript of all spoken words from start to finish","segments":[{"start":0.0,"end":4.5,"text":"verbatim spoken text"}]}',
    'Do not omit or skip any words.'
  ].join(' ')

  console.log('Testing full transcription prompt with fallback models...')
  const dummyBuffer = Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary')
  
  for (const model of ['gemini-2.5-flash', 'gemini-flash-latest']) {
    try {
      console.log(`Trying ${model}...`)
      const res = await streamGeminiTranscript(key, {
        modelName: model,
        prompt,
        inlineData: dummyBuffer,
        mimeType: 'audio/wav'
      })
      console.log(`Raw output from ${model}:`, res)
      const structured = parseStructuredTranscriptText(res)
      console.log('Parsed structured:', structured)
      const plain = getPlainTranscriptText(res, structured?.segments)
      console.log('Plain text output:', plain)
      break
    } catch (e) {
      console.log(`${model} failed:`, e.message)
    }
  }
}

testPrompt().catch(console.error)
