import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'
import { parseStructuredTranscriptText } from '../lib/transcript.ts'

async function testContinuation() {
  const apiKey = process.env.GEMINI_API_KEY
  console.log('Testing continuation prompt starting from 38.0s...')
  
  const contPrompt = [
    'You are continuing the transcription of this audio media. Total duration is 360 seconds.',
    'Speech from 0 to 38.0 seconds has already been transcribed.',
    'Now listen carefully and transcribe ALL remaining spoken dialogue and speech from 38.0 seconds to the very end (360.0 seconds).',
    'Do not stop at music interludes, sound effects, or pauses. Transcribe all remaining speech verbatim.',
    'Format strictly as JSON:',
    '{"language":"English","segments":[{"start":38.0,"end":45.2,"text":"..."}]}',
    'Crucial: start and end must be numbers in seconds (e.g. 75.4, NOT formatted with colons).'
  ].join(' ')

  const res = await streamGeminiTranscript(apiKey, {
    modelName: 'gemini-2.5-flash',
    prompt: contPrompt,
    mimeType: 'audio/mpeg',
    fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/dxzk54nno8zj',
    onText: () => {}
  })

  console.log('Continuation response length:', res.length)
  const parsed = parseStructuredTranscriptText(res)
  console.log('Parsed segments in continuation:', parsed?.segments?.length)
  if (parsed?.segments?.length) {
    console.log('First segment:', parsed.segments[0])
    console.log('Last segment:', parsed.segments[parsed.segments.length - 1])
  }
}

testContinuation().catch(console.error)
