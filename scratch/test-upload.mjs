import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const singleMatch = envFile.match(/GEMINI_API_KEY=([^\r\n]+)/)

const allKeys = [
  ...(multiMatch ? multiMatch[1].split(',') : []),
  ...(singleMatch ? [singleMatch[1]] : [])
]
  .map(k => k.trim().replace(/["'\r\n]/g, ''))
  .filter(Boolean)

console.log(`Found ${allKeys.length} keys to test.`)

async function testAllKeys() {
  for (let i = 0; i < allKeys.length; i++) {
    const apiKey = allKeys[i]
    console.log(`\nTesting key #${i} (prefix: ${apiKey.slice(0, 8)}...)...`)
    try {
      const host = 'generativelanguage.googleapis.com'
      const fileName = 'snaptik_test.mp4'
      const mimeType = 'video/mp4'
      const dummySize = 100 * 1024
      const dummyBuffer = Buffer.alloc(dummySize, 'a')

      const startRes = await fetch('https://' + host + '/upload/v1beta/files', {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(dummySize),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          file: { displayName: fileName, mimeType }
        })
      })

      if (!startRes.ok) {
        console.error(`❌ Key #${i} START FAILED with status ${startRes.status}:`, await startRes.text())
        continue
      }

      const uploadUrl = startRes.headers.get('x-goog-upload-url')
      if (!uploadUrl) {
        console.error(`❌ Key #${i} missing upload URL!`)
        continue
      }

      const chunkRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': String(dummySize),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: dummyBuffer
      })

      if (!chunkRes.ok) {
        console.error(`❌ Key #${i} CHUNK FAILED with status ${chunkRes.status}:`, await chunkRes.text())
      } else {
        console.log(`✅ Key #${i} succeeded!`)
      }
    } catch (err) {
      console.error(`❌ Key #${i} exception:`, err.message)
    }
  }
}

testAllKeys().catch(console.error)
