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

function getNextGeminiKeyInfo(): { apiKey: string; keyIndex: number } {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length) {
    const idx = keyIndex % multi.length
    const key = multi[idx]
    keyIndex = (keyIndex + 1) % multi.length
    return { apiKey: key, keyIndex: idx }
  }
  const single = (process.env.GEMINI_API_KEY || '').trim().replace(/["'\r\n]/g, '')
  return { apiKey: single, keyIndex: 0 }
}

import { checkUserQuota } from '@/lib/quota'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to transcribe files.' }, { status: 401 })
  }

  // Verify daily usage quota
  const quota = await checkUserQuota(session.user.id, session.user.email, session.user.role)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error || 'Daily usage quota reached.' }, { status: 429 })
  }

  const { apiKey, keyIndex: assignedIndex } = getNextGeminiKeyInfo()
  if (!apiKey || apiKey === 'AIzaSyYourGoogleApiKeyHere') {
    return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 })
  }

  const host = getGeminiApiHost()

  return NextResponse.json({
    apiKey,
    keyIndex: assignedIndex,
    host,
    quota: {
      usedMinutes: quota.usedMinutes,
      limitMinutes: quota.limitMinutes,
      remainingMinutes: quota.remainingMinutes
    }
  })
}
