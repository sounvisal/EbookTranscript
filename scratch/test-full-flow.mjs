import dotenv from 'dotenv'
dotenv.config()

import { uploadGeminiFile, waitForGeminiFile, streamGeminiTranscript, deleteGeminiFile } from '../lib/gemini.ts'

const key = process.env.GEMINI_API_KEY
console.log('Testing full flow with key:', key ? key.slice(0, 10) + '...' : 'NONE')

async function testFullFlow() {
  try {
    console.log('1. Uploading file to Gemini...')
    const uploadRes = await uploadGeminiFile(key, {
      buffer: Buffer.from('RIFF$ \x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00 \x00\x00' + '\x00'.repeat(1000), 'binary'),
      mimeType: 'audio/wav',
      displayName: 'test-flow.wav'
    })
    console.log('2. Upload complete:', uploadRes.file.name, uploadRes.file.uri)

    console.log('3. Waiting for file to be ACTIVE...')
    const activeFile = await waitForGeminiFile(key, uploadRes.file.name)
    console.log('4. File is ACTIVE:', activeFile.state)

    console.log('5. Running streamGeminiTranscript...')
    const res = await streamGeminiTranscript(key, {
      modelName: 'gemini-2.5-flash',
      prompt: 'Transcribe this audio strictly as JSON: {"language":"English","text":"Test speech","segments":[{"start":0,"end":1,"text":"Test speech"}]}',
      fileUri: activeFile.uri,
      mimeType: activeFile.mimeType,
      onText: (txt) => {}
    })
    console.log('6. Transcription result:', res)

    console.log('7. Cleaning up uploaded file...')
    await deleteGeminiFile(key, uploadRes.file.name)
    console.log('8. Cleanup complete!')
  } catch (err) {
    console.error('Full flow failed:', err)
  }
}

testFullFlow()
