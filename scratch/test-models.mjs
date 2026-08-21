import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY

async function test() {
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-pro']
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`)
      const res = await streamGeminiTranscript(key, {
        modelName: model,
        prompt: 'Return a JSON object with language: "English", text: "Hello", segments: [{"start":0,"end":1,"text":"Hello"}]',
        inlineData: Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary'),
        mimeType: 'audio/wav',
        onText: () => {}
      })
      console.log(`✅ Success on ${model}:`, res.slice(0, 80))
    } catch (e) {
      console.log(`❌ Failed on ${model}:`, e.message.slice(0, 150))
    }
  }
}

test()
