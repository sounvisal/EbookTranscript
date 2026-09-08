import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const key = multiMatch ? multiMatch[1].split(',')[0].trim() : ''

async function checkCors() {
  const host = 'generativelanguage.googleapis.com'
  const fileName = 'cors_test.mp4'
  const mimeType = 'video/mp4'
  const fileSize = 1024

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
  console.log('Got uploadUrl:', uploadUrl?.slice(0, 80) + '...')

  // Test OPTIONS preflight
  const optionsRes = await fetch(uploadUrl, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://sounvisal.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-length,x-goog-upload-command,x-goog-upload-offset'
    }
  })

  console.log('OPTIONS status:', optionsRes.status)
  console.log('OPTIONS headers:', Object.fromEntries(optionsRes.headers.entries()))

  // Test POST with Origin
  const postRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Origin': 'https://sounvisal.com',
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: Buffer.alloc(fileSize, 0x55)
  })

  console.log('POST status:', postRes.status)
  console.log('POST Access-Control-Allow-Origin:', postRes.headers.get('access-control-allow-origin'))
}

checkCors().catch(console.error)
