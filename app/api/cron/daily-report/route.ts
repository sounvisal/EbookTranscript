import { NextResponse } from 'next/server'
import { sendTelegramDailyReport } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleDailyReport(req)
}

export async function POST(req: Request) {
  return handleDailyReport(req)
}

async function handleDailyReport(req: Request) {
  // Security check: if CRON_SECRET is set in Vercel, strictly verify authorization header
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized. Invalid or missing CRON_SECRET header.' },
      { status: 401 }
    )
  }

  const result = await sendTelegramDailyReport()

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Failed to dispatch daily report' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    message: '5:30 PM Daily Usage & Performance Report dispatched to Telegram successfully.',
    stats: result.stats
  })
}
