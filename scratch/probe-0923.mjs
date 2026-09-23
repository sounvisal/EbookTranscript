import dotenv from 'dotenv'
dotenv.config()
import { streamGeminiTranscript } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
const fileUri = 'https://generativelanguage.googleapis.com/v1beta/files/dxzk54nno8zj'

async function inspectAudio() {
  const models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']
  const probePrompt = 'Listen carefully to this entire audio recording from 0:00 to 6:00. Describe in detail: 1) What is spoken between 0:00 and 0:40? 2) What language is spoken, and what is said from 0:40 to 6:00? 3) Transcribe what is spoken after 0:40.'

  for (const model of models) {
    try {
      console.log(`Probing with ${model}...`)
      const probe = await streamGeminiTranscript(key, {
        modelName: model,
        prompt: probePrompt,
        fileUri,
        mimeType: 'audio/mpeg'
      })

      console.log(`\n--- AUDIO PROBE ANALYSIS (${model}) ---`)
      console.log(probe)
      return
    } catch (err) {
      console.log(`${model} failed:`, err.message)
    }
  }
}

inspectAudio().catch(console.error)
