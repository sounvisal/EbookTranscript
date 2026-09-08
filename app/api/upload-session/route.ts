import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function getGeminiApiHost(): string {
  const raw = process.env.GEMINI_API_HOST || 'generativelanguage.googleapis.com'
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/["'\r\n]/g, '')
    || 'generativelanguage.googleapis.com'
}

let keyIndex = 0

function getAllGeminiKeys(): string[] {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length) {
    return multi
  }
  const single = (process.env.GEMINI_API_KEY || '').trim().replace(/["'\r\n]/g, '')
  return single && single !== 'AIzaSyYourGoogleApiKeyHere' ? [single] : []
}

import { checkUserQuota } from '@/lib/quota'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to transcribe files.' }, { status: 401 })
  }

  // Verify daily usage quota
  const quota = await checkUserQuota(session.user.id, session.user.email, session.user.role)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error || 'Daily usage quota reached.' }, { status: 429 })
  }

  const keys = getAllGeminiKeys()
  if (!keys.length) {
    return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 })
  }

  const host = getGeminiApiHost()
  const body = await req.json().catch(() => ({}))
  const { fileName, mimeType, fileSize } = body

  let uploadUrl = ''
  let assignedKey = keys[0]
  let assignedIndex = 0

  if (fileName && mimeType && typeof fileSize === 'number' && fileSize > 0) {
    // Try up to keys.length times to establish an authorized resumable session
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const idx = (keyIndex + attempt) % keys.length
      const candidateKey = keys[idx]

      try {
        const startRes = await fetch(`https://${host}/upload/v1beta/files`, {
          method: 'POST',
          headers: {
            'x-goog-api-key': candidateKey,
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(fileSize),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: JSON.stringify({
            file: {
              displayName: fileName,
              mimeType: mimeType
            }
          })
        })

        if (startRes.ok) {
          const retrievedUrl = startRes.headers.get('x-goog-upload-url')
          if (retrievedUrl) {
            uploadUrl = retrievedUrl
            assignedKey = candidateKey
            assignedIndex = idx
            keyIndex = (idx + 1) % keys.length
            break
          }
        } else {
          const errText = await startRes.text().catch(() => '')
          console.warn(`Gemini key #${idx} failed resumable session start (${startRes.status}):`, errText.slice(0, 200))
        }
      } catch (err) {
        console.warn(`Gemini key #${idx} exception starting resumable session:`, err)
      }
    }

    if (!uploadUrl) {
      return NextResponse.json(
        { error: 'Unable to initialize Google media upload session. Please try again in a few moments.' },
        { status: 502 }
      )
    }
  }

  return NextResponse.json({
    apiKey: assignedKey,
    keyIndex: assignedIndex,
    host,
    uploadUrl,
    quota: {
      usedMinutes: quota.usedMinutes,
      limitMinutes: quota.limitMinutes,
      remainingMinutes: quota.remainingMinutes
    }
  })
}
