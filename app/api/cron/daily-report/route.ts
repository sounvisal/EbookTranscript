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
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return false
  }

  const authHeader = req.headers.get('authorization')?.trim()
  if (authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  const url = new URL(req.url)
  const querySecret = url.searchParams.get('key') || url.searchParams.get('secret')
  return querySecret === cronSecret
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
