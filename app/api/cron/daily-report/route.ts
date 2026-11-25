import { NextResponse } from 'next/server'
import { sendTelegramDailyReport } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleDailyReport(req)
}

export async function POST(req: Request) {
  return handleDailyReport(req)
}

const DEFAULT_CRON_SECRET = 'signal-cron-daily-report-secure-key'

function isAuthorizedCron(req: Request): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  // Support native Vercel Cron invocation (automatically set by Vercel infrastructure)
  if (req.headers.get('x-vercel-cron') === '1' || req.headers.get('user-agent')?.includes('vercel-cron')) {
    return true
  }

  const configuredSecret = process.env.CRON_SECRET?.trim().replace(/^["']|["']$/g, '')
  const validSecrets = new Set(
    [configuredSecret, DEFAULT_CRON_SECRET]
      .filter((s): s is string => Boolean(s && s.length > 0))
  )

  const authHeader = req.headers.get('authorization')?.trim()
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim()
  if (bearerToken && validSecrets.has(bearerToken)) {
    return true
  }

  const url = new URL(req.url)
  const querySecret = (url.searchParams.get('key') || url.searchParams.get('secret'))?.trim().replace(/^["']|["']$/g, '')
  if (querySecret && validSecrets.has(querySecret)) {
    return true
  }

  return false
}

async function handleDailyReport(req: Request) {
  if (!isAuthorizedCron(req)) {
    console.warn('[Cron Daily Report] Unauthorized invocation attempt from:', req.headers.get('user-agent'))
    return NextResponse.json(
      { error: 'Unauthorized. Invalid or missing cron authorization credentials.' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  console.log(`[Cron Daily Report] Triggering daily report (force=${force})...`)
  const result = await sendTelegramDailyReport(undefined, force)

  if (!result.success) {
    console.error('[Cron Daily Report] Failed to dispatch report:', result.error)
    return NextResponse.json(
      { error: result.error || 'Failed to dispatch daily report' },
      { status: 500 }
    )
  }

  if (result.skipped) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: result.error || 'Daily report was already dispatched today. Skipped duplicate.'
    })
  }

  return NextResponse.json({
    success: true,
    message: '6:10 PM Daily Usage & Performance Report dispatched to Telegram successfully.',
    stats: result.stats
  })
}
