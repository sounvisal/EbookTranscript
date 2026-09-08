import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const key = multiMatch ? multiMatch[1].split(',')[0].trim() : ''

console.log('Testing /upload/v1beta/files with header ONLY (no query param key)...')

const boundary = '----GeminiBoundary12345'
const metadata = JSON.stringify({
  file: {
    mimeType: 'video/mp4',
    displayName: 'test.mp4'
  }
})

const preamble = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`
const epilogue = `\r\n--${boundary}--`

const fullBody = Buffer.concat([
  Buffer.from(preamble, 'utf-8'),
  Buffer.alloc(1024, 0x11),
  Buffer.from(epilogue, 'utf-8')
])

// Test 1: Header ONLY
const res1 = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
  method: 'POST',
  headers: {
    'x-goog-api-client': 'transcript-client/1.0',
    'x-goog-api-key': key,
    'X-Goog-Upload-Protocol': 'multipart',
    'Content-Type': `multipart/related; boundary=${boundary}`
  },
  body: fullBody
})

console.log('Test 1 (Header only) status:', res1.status)
console.log('Test 1 response:', await res1.text())

// Test 2: Query param key
const res2 = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
  method: 'POST',
  headers: {
    'x-goog-api-client': 'transcript-client/1.0',
    'X-Goog-Upload-Protocol': 'multipart',
    'Content-Type': `multipart/related; boundary=${boundary}`
  },
  body: fullBody
})

console.log('\nTest 2 (Query param key) status:', res2.status)
console.log('Test 2 response:', (await res2.text()).slice(0, 100))
