import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { sendTelegramDailyReport } from '@/lib/telegram'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!isUserAdmin(session?.user?.email, session?.user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const result = await sendTelegramDailyReport()
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to dispatch daily report.' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    message: '5:30 PM Daily Report sent to Telegram successfully!',
    stats: result.stats
  })
}
