import dotenv from 'dotenv'
dotenv.config()

import { generateGeminiText } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
console.log('Testing Gemini API key:', key ? key.slice(0, 12) + '...' : 'NONE')
console.log('Host:', process.env.GEMINI_API_HOST)

async function run() {
  try {
    const res = await generateGeminiText(key, {
      modelName: 'gemini-2.5-flash-lite',
      prompt: 'Say hello in 1 word'
    })
    console.log('Gemini Result:', res)
  } catch (err) {
    console.error('Gemini Error:', err.message)
  }
}

run()
