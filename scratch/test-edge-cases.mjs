import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const key = multiMatch ? multiMatch[1].split(',')[0].trim() : ''

async function testCases() {
  const host = 'generativelanguage.googleapis.com'
  const fileName = 'snaptik_7654842012251917598_v3.mp4'
  const mimeType = 'video/mp4'
  const declaredSize = 3000000

  const startSession = async () => {
    const res = await fetch('https://' + host + '/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(declaredSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ file: { displayName: fileName, mimeType } })
    })
    return res.headers.get('x-goog-upload-url')
  }

  // Case 1: Sending wrong length (e.g. declared 3000000, but sent 2900000 with finalize)
  console.log('Case 1: Sending fewer bytes than declared with finalize...')
  const url1 = await startSession()
  const res1 = await fetch(url1, {
    method: 'POST',
    headers: {
      'Content-Length': '2000000',
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: Buffer.alloc(2000000, 0x55)
  })
  console.log('Case 1 status:', res1.status, await res1.text())

  // Case 2: Multi-chunk (3.5MB slices on a 5MB file)
  console.log('\nCase 2: 2 chunks for 5MB file...')
  const size5MB = 5 * 1024 * 1024
  const resSession2 = await fetch('https://' + host + '/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size5MB),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ file: { displayName: fileName, mimeType } })
  })
  const url2 = resSession2.headers.get('x-goog-upload-url')
  const chunk1Size = Math.floor(3.5 * 1024 * 1024)
  const chunk2Size = size5MB - chunk1Size

  // Chunk 1
  const chunk1Res = await fetch(url2, {
    method: 'POST',
    headers: {
      'Content-Length': String(chunk1Size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload'
    },
    body: Buffer.alloc(chunk1Size, 0x11)
  })
  console.log('Chunk 1 status:', chunk1Res.status, await chunk1Res.text())

  // Chunk 2
  const chunk2Res = await fetch(url2, {
    method: 'POST',
    headers: {
      'Content-Length': String(chunk2Size),
      'X-Goog-Upload-Offset': String(chunk1Size),
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: Buffer.alloc(chunk2Size, 0x22)
  })
  console.log('Chunk 2 status:', chunk2Res.status, (await chunk2Res.text()).slice(0, 100))
}

testCases().catch(console.error)
