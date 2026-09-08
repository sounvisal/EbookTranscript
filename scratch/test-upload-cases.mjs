import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const key = multiMatch ? multiMatch[1].split(',')[0].trim() : ''

async function testUploadProxy() {
  const host = 'generativelanguage.googleapis.com'
  const fileName = 'snaptik_7654842012251917598_v3.mp4'
  const mimeType = 'video/mp4'
  // Exactly 2.99 MB
  const fileSize = Math.floor(2.99 * 1024 * 1024)
  const fileBuffer = Buffer.alloc(fileSize, 0x55)

  console.log(`Starting session for file size: ${fileSize} bytes (~2.99 MB)...`)
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
    body: JSON.stringify({
      file: { displayName: fileName, mimeType }
    })
  })

  console.log('Start status:', startRes.status)
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  console.log('Upload URL length:', uploadUrl?.length)

  // Test Case A: single slice with 'upload, finalize'
  console.log('\nTest Case A: Sending entire 2.99MB in 1 chunk with command "upload, finalize"...')
  const chunkRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: fileBuffer
  })

  console.log('Chunk status:', chunkRes.status)
  const chunkText = await chunkRes.text()
  console.log('Chunk response:', chunkText.slice(0, 200))
}

testUploadProxy().catch(console.error)
