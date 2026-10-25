import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOptimalKeyOrder, recordKeySuccess, recordKeyFailure } from '@/lib/fleet'

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

export async function GET() {
  const keys = getAllGeminiKeys()
  return NextResponse.json({ totalKeys: keys.length })
}

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
  const { fileName, mimeType, fileSize, preferredKeyIndex } = body

  let uploadUrl = ''
  let assignedKey = keys[0]
  let assignedIndex = 0

  let clientOrigin =
    (typeof body?.clientOrigin === 'string' && body.clientOrigin ? body.clientOrigin.trim() : null) ||
    req.headers.get('origin') ||
    ''
  if (!clientOrigin && req.headers.get('referer')) {
    try {
      clientOrigin = new URL(req.headers.get('referer')!).origin
    } catch {}
  }
  if (!clientOrigin) {
    if (process.env.VERCEL_URL) {
      clientOrigin = `https://${process.env.VERCEL_URL}`
    } else if (process.env.NEXTAUTH_URL) {
      try {
        clientOrigin = new URL(process.env.NEXTAUTH_URL).origin
      } catch {}
    }
  }

  if (fileName && mimeType && typeof fileSize === 'number' && fileSize > 0) {
    const orderedKeys = getOptimalKeyOrder(preferredKeyIndex, keys)

    // Try healthy keys in optimal order to establish an authorized resumable session
    for (const { key: candidateKey, index: idx } of orderedKeys) {
      try {
        const startHeaders: Record<string, string> = {
          'x-goog-api-key': candidateKey,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json; charset=utf-8'
        }
        if (clientOrigin && clientOrigin !== '*') {
          startHeaders['Origin'] = clientOrigin
        }

        const targetHosts = host !== 'generativelanguage.googleapis.com'
          ? [host, 'generativelanguage.googleapis.com']
          : [host]

        let startRes: Response | null = null
        for (const targetHost of targetHosts) {
          try {
            const res = await fetch(`https://${targetHost}/upload/v1beta/files`, {
              method: 'POST',
              headers: startHeaders,
              body: JSON.stringify({
                file: {
                  displayName: fileName,
                  mimeType: mimeType
                }
              })
            })
            if (res.ok || targetHost === targetHosts[targetHosts.length - 1]) {
              startRes = res
              break
            }
          } catch (fetchErr) {
            if (targetHost === targetHosts[targetHosts.length - 1]) throw fetchErr
          }
        }

        if (startRes && startRes.ok) {
          const retrievedUrl = startRes.headers.get('x-goog-upload-url')
          if (retrievedUrl) {
            uploadUrl = retrievedUrl
            assignedKey = candidateKey
            assignedIndex = idx
            recordKeySuccess(idx)
            break
          }
        } else if (startRes) {
          const errText = await startRes.text().catch(() => '')
          recordKeyFailure(idx, new Error(`HTTP ${startRes.status}: ${errText.slice(0, 100)}`))
          console.warn(`Gemini key #${idx + 1} failed resumable session start (${startRes.status}):`, errText.slice(0, 200))
        }
      } catch (err) {
        recordKeyFailure(idx, err)
        console.warn(`Gemini key #${idx + 1} exception starting resumable session:`, err)
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
    keyIndex: assignedIndex,
    host,
    uploadUrl,
    totalKeys: keys.length,
    quota: {
      usedMinutes: quota.usedMinutes,
      limitMinutes: quota.limitMinutes,
      remainingMinutes: quota.remainingMinutes
    }
  })
}
