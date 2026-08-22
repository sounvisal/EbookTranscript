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
  // Optional security check: if CRON_SECRET is set in Vercel, verify it
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Vercel Cron automatically includes Authorization header when CRON_SECRET is set
    console.warn('Daily report cron invoked without matching CRON_SECRET')
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
