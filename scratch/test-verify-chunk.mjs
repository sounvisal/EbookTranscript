import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const key = multiMatch ? multiMatch[1].split(',')[0].trim() : ''

async function verify() {
  const host = 'generativelanguage.googleapis.com'
  const fileName = 'test_finalize.mp4'
  const mimeType = 'video/mp4'
  const fileSize = 5 * 1024 * 1024 // 5 MB

  console.log('Testing 5MB single chunk with upload, finalize...')
  const startRes = await fetch('https://' + host + '/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ file: { displayName: fileName, mimeType } })
  })

  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  console.log('Got uploadUrl:', Boolean(uploadUrl))

  const chunkRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: Buffer.alloc(fileSize, 0x77)
  })

  console.log('Finalize status:', chunkRes.status)
  const text = await chunkRes.text()
  console.log('Finalize response:', text.slice(0, 150))
}

verify().catch(console.error)
