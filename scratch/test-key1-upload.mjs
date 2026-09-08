import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const keys = multiMatch ? multiMatch[1].split(',').map(k => k.trim()) : []
const key1 = keys[1] // Key 1: AQ.Ab8RN6L...

console.log('Testing Key 1 resumable upload session...')
const host = 'generativelanguage.googleapis.com'
const fileName = 'snaptik_test.mp4'
const mimeType = 'video/mp4'
const fileSize = 100 * 1024

const startRes = await fetch('https://' + host + '/upload/v1beta/files', {
  method: 'POST',
  headers: {
    'x-goog-api-key': key1,
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(fileSize),
    'X-Goog-Upload-Header-Content-Type': mimeType,
    'Content-Type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify({
    file: { displayName: fileName, mimeType }
  })
})

console.log('Start status:', startRes.status)
const uploadUrl = startRes.headers.get('x-goog-upload-url')
console.log('Upload URL:', uploadUrl)

if (uploadUrl) {
  const chunkRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: Buffer.alloc(fileSize, 0x33)
  })
  console.log('Chunk status:', chunkRes.status)
  console.log('Chunk response:', await chunkRes.text())
} else {
  console.log('Start error:', await startRes.text())
}
