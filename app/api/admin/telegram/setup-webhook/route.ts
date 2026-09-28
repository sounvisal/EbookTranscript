import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { getBotCredentials, handleTelegramWelcome } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!isUserAdmin(session?.user?.email, session?.user?.role)) {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 })
  }

  const { token, chatId } = getBotCredentials()
  if (!token) {
    return NextResponse.json({
      configured: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in environment variables.'
    }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json()

    // Also get Bot profile info
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const meData = await meRes.json().catch(() => ({}))

    return NextResponse.json({
      configured: true,
      bot: meData.ok ? meData.result : null,
      adminChatIdConfigured: Boolean(chatId),
      webhook: data.ok ? data.result : null
    })
  } catch (err) {
    return NextResponse.json({
      configured: false,
      error: err instanceof Error ? err.message : 'Failed to query Telegram API.'
    }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isUserAdmin(session?.user?.email, session?.user?.role)) {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 })
  }

  const { token, chatId } = getBotCredentials()
  if (!token) {
    return NextResponse.json({
      error: 'TELEGRAM_BOT_TOKEN is not configured.'
    }, { status: 400 })
  }

  let customUrl: string | undefined
  try {
    const body = await req.json()
    if (body.url) customUrl = body.url
  } catch {
    // Body optional
  }

  // Derive target webhook URL
  const origin = (process.env.NEXTAUTH_URL || 'https://ebook-transcript.vercel.app').replace(/\/$/, '')
  const webhookUrl = customUrl || `${origin}/api/telegram/webhook`

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
      })
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      return NextResponse.json({
        success: false,
        error: data.description || 'Failed to register webhook with Telegram API.'
      }, { status: 400 })
    }

    // Proactively send welcome keyboard to admin so buttons appear immediately on their device
    if (chatId) {
      handleTelegramWelcome(chatId).catch((err) =>
        console.error('[Telegram Setup] Initial welcome push failed:', err)
      )
    }

    return NextResponse.json({
      success: true,
      webhookUrl,
      result: data.result,
      message: `Webhook successfully configured to ${webhookUrl}! Interactive buttons delivered to admin chat.`
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Network error configuring Telegram webhook.'
    }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!isUserAdmin(session?.user?.email, session?.user?.role)) {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 })
  }

  const { token } = getBotCredentials()
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`)
    const data = await res.json()
    return NextResponse.json({
      success: data.ok,
      result: data.result,
      description: data.description
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete webhook.'
    }, { status: 500 })
  }
}
