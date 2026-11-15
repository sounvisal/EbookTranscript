import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOptimalKeyOrder, recordKeySuccess, recordKeyFailure } from '@/lib/fleet'

import { GEMINI_UNAVAILABLE, getConfiguredKeys } from '@/lib/geminiConfig'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { createUploadToken, geminiKeyFingerprint, parseGoogleUploadUrl } from '@/lib/uploadSession'
import { checkUserQuota } from '@/lib/quota'

function getGeminiApiHost(): string {
  const raw = process.env.GEMINI_API_HOST || 'generativelanguage.googleapis.com'
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/["'\r\n]/g, '')
    || 'generativelanguage.googleapis.com'
}

export async function GET() {
  const keys = getConfiguredKeys()
  return NextResponse.json({ totalKeys: keys.length })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to transcribe files.' }, { status: 401 })
  }

  const keys = getConfiguredKeys()
  const secret = process.env.NEXTAUTH_SECRET
  if (!keys.length || !secret) {
    return NextResponse.json({ error: GEMINI_UNAVAILABLE }, { status: 503 })
  }

  // Verify daily usage quota
  const quota = await checkUserQuota(session.user.id, session.user.email, session.user.role)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error || 'Daily usage quota reached.' }, { status: 429 })
  }

  const host = getGeminiApiHost()
  const body = await req.json().catch(() => ({}))
  const { fileName, mimeType, fileSize, preferredKeyIndex } = body ?? {}
  const purpose = body?.purpose ?? 'transcription'
  if ((purpose !== 'transcription' && purpose !== 'report')
    || typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255
    || typeof mimeType !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType)
    || (purpose === 'transcription' && !/^(audio|video)\//i.test(mimeType))
    || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_MEDIA_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Invalid upload name, type, or size.' }, { status: 400 })
  }
  const providerFileName = `files/${randomUUID()}`

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
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              file: {
                name: providerFileName,
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
        if (retrievedUrl && parseGoogleUploadUrl(retrievedUrl)) {
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

  return NextResponse.json({
    keyIndex: assignedIndex,
    host,
    uploadUrl,
    uploadToken: createUploadToken({
      userId: session.user.id,
      fileName: providerFileName,
      displayName: fileName,
      mimeType,
      fileSize,
      purpose,
      uploadUrl,
      keyFingerprint: geminiKeyFingerprint(assignedKey)
    }, secret),
    totalKeys: keys.length,
    quota: {
      usedMinutes: quota.usedMinutes,
      limitMinutes: quota.limitMinutes,
      remainingMinutes: quota.remainingMinutes
    }
  })
}
