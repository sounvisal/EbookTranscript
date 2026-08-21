import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { sendTelegramTestAlert } from '@/lib/telegram'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!isUserAdmin(session?.user?.email, session?.user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const result = await sendTelegramTestAlert()
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to send test alert.' }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: 'Test message sent to Telegram!' })
}
