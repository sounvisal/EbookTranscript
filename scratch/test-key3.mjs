import dotenv from 'dotenv'
dotenv.config()

import { streamGeminiTranscript } from '../lib/gemini.ts'

const testKey = 'AQ.Ab8RN6JN3OVLZJoAHCckvzbtxI827ZHZ7vwnc6nEXcGN73YODA'

async function test() {
  const models = ['gemini-3.6-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`)
      const res = await streamGeminiTranscript(testKey, {
        modelName: model,
        prompt: 'Return JSON: {"language":"English","text":"Test key 3","segments":[{"start":0,"end":1,"text":"Test key 3"}]}',
        inlineData: Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary'),
        mimeType: 'audio/wav',
        onText: () => {}
      })
      console.log(`✅ Success on ${model}:`, res)
    } catch (err) {
      console.error(`❌ Failed on ${model}:`, err.message)
    }
  }
}

test()
