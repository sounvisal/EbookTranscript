import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const keys = multiMatch ? multiMatch[1].split(',').map(k => k.trim()) : []

for (let i = 0; i < keys.length; i++) {
  const key = keys[i]
  console.log(`\nTesting multipart upload with key #${i}: ${key.slice(0, 8)}...`)

const fileName = 'snaptik_test.mp4'
const mimeType = 'video/mp4'
const dummyBuffer = Buffer.alloc(100 * 1024, 'a')

const boundary = '----GeminiBoundary' + Math.random().toString(16).slice(2)
const metadata = JSON.stringify({
  file: {
    mimeType,
    displayName: fileName
  }
})

const preamble = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
const epilogue = `\r\n--${boundary}--`

const fullBody = Buffer.concat([
  Buffer.from(preamble, 'utf-8'),
  dummyBuffer,
  Buffer.from(epilogue, 'utf-8')
])

const res = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
  method: 'POST',
  headers: {
    'x-goog-api-client': 'transcript-client/1.0',
    'x-goog-api-key': key,
    'X-Goog-Upload-Protocol': 'multipart',
    'Content-Type': `multipart/related; boundary=${boundary}`,
    'Content-Length': String(fullBody.length)
  },
  body: fullBody
})

console.log('Multipart status:', res.status)
const text = await res.text()
console.log('Multipart response:', text)
}
