import dotenv from 'dotenv'
dotenv.config()

import { uploadGeminiFile, waitForGeminiFile, streamGeminiTranscript, deleteGeminiFile } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
console.log('Testing key:', key ? key.slice(0, 10) + '...' : 'NONE')

// Create a small 1-second dummy audio buffer
const dummyBuffer = Buffer.alloc(1000, 0)

async function testUploadAndTranscribe() {
  try {
    console.log('Testing uploadGeminiFile...')
    const uploadRes = await uploadGeminiFile(key, {
      buffer: dummyBuffer,
      mimeType: 'audio/mp3',
      displayName: 'test.mp3'
    })
    console.log('Upload success:', uploadRes.file.name)
    
    console.log('Testing waitForGeminiFile...')
    const file = await waitForGeminiFile(key, uploadRes.file.name)
    console.log('File active:', file.uri)

    console.log('Cleaning up...')
    await deleteGeminiFile(key, uploadRes.file.name)
    console.log('Deleted successfully!')
  } catch (err) {
    console.error('Error:', err)
  }
}

testUploadAndTranscribe()
