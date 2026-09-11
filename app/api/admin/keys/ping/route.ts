import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function getGeminiApiKeys(): string[] {
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

export type KeyDiagnosticResult = {
  index: number
  masked: string
  status: 'healthy' | 'warning' | 'rate_limited' | 'invalid' | 'error'
  latencyMs: number
  httpStatus: number
  message: string
  modelsCount?: number
  lastChecked: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  const keys = getGeminiApiKeys()
  if (keys.length === 0) {
    return NextResponse.json({
      success: true,
      keys: [],
      message: 'No GEMINI_API_KEYS or GEMINI_API_KEY configured in environment.'
    })
  }

  const diagnosticPromises = keys.map(async (key, index): Promise<KeyDiagnosticResult> => {
    const masked = `${key.slice(0, 6)}...${key.slice(-4)}`
    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=5`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'Signal-Admin-Ping/1.0' }
        }
      )
      clearTimeout(timeoutId)
      const latencyMs = Date.now() - startTime

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const modelsCount = Array.isArray(data.models) ? data.models.length : 0
        const status = latencyMs > 2500 ? 'warning' : 'healthy'
        return {
          index,
          masked,
          status,
          latencyMs,
          httpStatus: res.status,
          modelsCount,
          message: status === 'warning' ? `High latency (${latencyMs}ms)` : `Healthy response (${latencyMs}ms)`,
          lastChecked: new Date().toISOString()
        }
      }

      // Handle specific HTTP error codes
      if (res.status === 429) {
        return {
          index,
          masked,
          status: 'rate_limited',
          latencyMs,
          httpStatus: 429,
          message: 'Rate limit or free tier quota exhausted (429)',
          lastChecked: new Date().toISOString()
        }
      }

      if (res.status === 400 || res.status === 403) {
        const errJson = await res.json().catch(() => ({}))
        const apiErrMsg = errJson.error?.message || 'Invalid or revoked API key'
        return {
          index,
          masked,
          status: 'invalid',
          latencyMs,
          httpStatus: res.status,
          message: `Authentication failed: ${apiErrMsg}`,
          lastChecked: new Date().toISOString()
        }
      }

      return {
        index,
        masked,
        status: 'error',
        latencyMs,
        httpStatus: res.status,
        message: `Google API returned HTTP ${res.status}`,
        lastChecked: new Date().toISOString()
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime
      const isTimeout = err?.name === 'AbortError' || latencyMs >= 5900
      return {
        index,
        masked,
        status: 'error',
        latencyMs,
        httpStatus: 0,
        message: isTimeout ? 'Connection timed out (>6000ms)' : (err?.message || 'Network fetch failure'),
        lastChecked: new Date().toISOString()
      }
    }
  })

  const results = await Promise.all(diagnosticPromises)

  return NextResponse.json({
    success: true,
    keys: results,
    totalKeys: results.length,
    healthyCount: results.filter((k) => k.status === 'healthy').length,
    warningCount: results.filter((k) => k.status === 'warning').length,
    errorCount: results.filter((k) => k.status === 'error' || k.status === 'rate_limited' || k.status === 'invalid').length,
    timestamp: new Date().toISOString()
  })
}
