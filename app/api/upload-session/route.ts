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

function getNextGeminiKey(): string {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length) {
    const key = multi[keyIndex % multi.length]
    keyIndex = (keyIndex + 1) % multi.length
    return key
  }
  return (process.env.GEMINI_API_KEY || '').trim().replace(/["'\r\n]/g, '')
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Please sign in to transcribe files.' }, { status: 401 })
  }

  const apiKey = getNextGeminiKey()
  if (!apiKey || apiKey === 'AIzaSyYourGoogleApiKeyHere') {
    return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 })
  }

  const host = getGeminiApiHost()

  return NextResponse.json({
    apiKey,
    host
  })
}
