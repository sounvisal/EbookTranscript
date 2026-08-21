import dotenv from 'dotenv'
dotenv.config()

import { uploadGeminiFile, waitForGeminiFile, streamGeminiTranscript, deleteGeminiFile } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
console.log('Testing key:', key ? key.slice(0, 10) + '...' : 'NONE')

async function test() {
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`)
      const res = await streamGeminiTranscript(key, {
        modelName: model,
        prompt: 'Return a JSON object with language: "English", text: "Hello world testing transcription", segments: [{"start":0,"end":2,"text":"Hello world testing transcription"}]',
        inlineData: Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary'),
        mimeType: 'audio/wav',
        onText: (txt) => {}
      })
      console.log(`Success on ${model}:`, res.slice(0, 100))
    } catch (e) {
      console.log(`Failed on ${model}:`, e.message)
    }
  }
}

test()
