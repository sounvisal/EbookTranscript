/**
 * Lightweight in-memory sliding-window rate limiter for serverless Next.js edge/Node handlers.
 */

type RateLimitRecord = {
  timestamps: number[]
}

const rateLimitStore = new Map<string, RateLimitRecord>()

// Clean up stale entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitStore.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < 3600 * 1000)
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier) || { timestamps: [] }

  // Retain only timestamps within the active sliding window
  const windowStart = now - windowMs
  record.timestamps = record.timestamps.filter((t) => t > windowStart)

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0]
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    rateLimitStore.set(identifier, record)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds
    }
  }

  record.timestamps.push(now)
  rateLimitStore.set(identifier, record)

  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    retryAfterSeconds: 0
  }
}

export function getClientIp(req: Request): string {
  const xForwardedFor = req.headers.get('x-forwarded-for')
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map((ip) => ip.trim())
    if (ips[0]) return ips[0]
  }

  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) return xRealIp.trim()

  const cfConnectingIp = req.headers.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp.trim()

  return '127.0.0.1'
}
