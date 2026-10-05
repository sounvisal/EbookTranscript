import { NextResponse } from 'next/server'
import { sendTelegramDailyReport } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleDailyReport(req)
}

export async function POST(req: Request) {
  return handleDailyReport(req)
}

function isAuthorizedCron(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || 'signal-cron-daily-report-secure-key'
  const authHeader = req.headers.get('authorization')?.trim()

  // 1. Bearer Token match (configured CRON_SECRET or default secret)
  if (authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  // 2. Query parameter match (?key=... or ?secret=...)
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('key') || url.searchParams.get('secret')
  if (querySecret === cronSecret) {
    return true
  }

  // 3. Vercel Cron invocation (Vercel automatically sets x-vercel-cron header for scheduled crons)
  const isVercelCron =
    req.headers.get('x-vercel-cron') === '1' ||
    Boolean(req.headers.get('user-agent')?.toLowerCase().includes('vercel-cron'))
  if (isVercelCron) {
    return true
  }

  // 4. GitHub Actions workflow signature
  if (req.headers.get('x-signal-cron') === 'daily-digest') {
    return true
  }

  // 5. In local development environment, allow easy testing
  if (process.env.NODE_ENV === 'development') {
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
    message: '5:30 PM Daily Usage & Performance Report dispatched to Telegram successfully.',
    stats: result.stats
  })
}
