import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const GOOGLE_UPLOAD_HOST = 'generativelanguage.googleapis.com'

export function parseGoogleUploadUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.origin === `https://${GOOGLE_UPLOAD_HOST}`
      && url.pathname === '/upload/v1beta/files'
      && !url.username && !url.password && !url.hash ? url : null
  } catch {
    return null
  }
}

type UploadSession = {
  userId: string
  fileName: string
  displayName: string
  mimeType: string
  fileSize: number
  purpose: 'transcription' | 'report'
  uploadUrl: string
  keyFingerprint: string
  expiresAt: number
}

export function geminiKeyFingerprint(key: string) {
  return createHash('sha256').update(key).digest('base64url')
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update('signal-upload-v1:').update(payload).digest()
}

export function createUploadToken(session: Omit<UploadSession, 'expiresAt'>, secret: string) {
  const payload = Buffer.from(JSON.stringify({
    ...session,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000
  })).toString('base64url')
  return `${payload}.${sign(payload, secret).toString('base64url')}`
}

export function readUploadToken(token: unknown, userId: string): UploadSession | null {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret || typeof token !== 'string' || token.length > 8192) return null

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const actual = Buffer.from(signature, 'base64url')
  const expected = sign(payload, secret)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadSession
    if (session.userId !== userId || session.expiresAt <= Date.now() || !parseGoogleUploadUrl(session.uploadUrl)) {
      return null
    }
    return session
  } catch {
    return null
  }
}
