import { NextResponse } from 'next/server'
import {
  getBotCredentials,
  answerTelegramCallback,
  handleTelegramWelcome,
  handleTelegramStatsCommand,
  handleTelegramHealthCommand,
  handleTelegramKeysCommand,
  handleTelegramUsersCommand,
  handleTelegramWebCommand,
  sendTelegramDailyReport,
  sendTelegramResponse
} from '@/lib/telegram'

export const dynamic = 'force-dynamic'

interface TelegramWebhookUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      is_bot: boolean
      first_name?: string
      username?: string
    }
    chat?: {
      id: number
      type: string
    }
    date: number
    text?: string
  }
  callback_query?: {
    id: string
    from: {
      id: number
      first_name?: string
      username?: string
    }
    message?: {
      message_id: number
      chat?: {
        id: number
      }
    }
    data?: string
  }
}

export async function GET() {
  const { token, chatId } = getBotCredentials()
  return NextResponse.json({
    status: 'online',
    service: 'Signal Telegram Command Center Webhook',
    configured: Boolean(token && chatId),
    timestamp: new Date().toISOString()
  })
}

export async function POST(req: Request) {
  const { chatId: allowedChatId } = getBotCredentials()

  let update: TelegramWebhookUpdate
  try {
    update = await req.json()
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  // Extract Chat ID & payload
  const isCallback = Boolean(update.callback_query)
  const incomingChatId = isCallback
    ? update.callback_query?.message?.chat?.id || update.callback_query?.from?.id
    : update.message?.chat?.id

  if (!incomingChatId) {
    // Unhandled update type (e.g. channel_post, my_chat_member)
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Strict Security Authorization: Only configured admin TELEGRAM_CHAT_ID can interact
  const incomingChatIdStr = String(incomingChatId).trim()
  const expectedChatIdStr = String(allowedChatId).trim()

  if (!expectedChatIdStr || incomingChatIdStr !== expectedChatIdStr) {
    console.warn(`[Telegram Webhook] Unauthorized attempt from chatId: ${incomingChatIdStr}`)
    if (isCallback && update.callback_query) {
      await answerTelegramCallback(update.callback_query.id, '⛔ Access Denied: Unauthorized admin chat.', true)
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '⛔ <b>Access Denied:</b> This bot is strictly configured for the Signal Platform Administrator.',
        undefined,
        false
      )
    }
    return NextResponse.json({ ok: true, status: 'unauthorized_ignored' })
  }

  // Handle Callback Query (Inline Button Click)
  if (isCallback && update.callback_query) {
    const callback = update.callback_query
    const rawAction = (callback.data || '').trim().toLowerCase()

    // Immediately answer callback query to clear loading spinner on user device
    await answerTelegramCallback(callback.id)

    switch (rawAction) {
      case 'stats':
        await handleTelegramStatsCommand(incomingChatId)
        break
      case 'health':
        await handleTelegramHealthCommand(incomingChatId)
        break
      case 'keys':
        await handleTelegramKeysCommand(incomingChatId)
        break
      case 'users':
        await handleTelegramUsersCommand(incomingChatId)
        break
      case 'report':
        await sendTelegramDailyReport(undefined, true)
        break
      default:
        await handleTelegramWelcome(incomingChatId)
        break
    }

    return NextResponse.json({ ok: true, action: rawAction })
  }

  // Handle Standard Message (Text or Persistent Bottom Reply Keyboard Button)
  const text = (update.message?.text || '').trim()

  // Match normalized commands
  const cleanCmd = text.toLowerCase().replace(/^\//, '').trim()

  if (
    text.includes('Live Stats') ||
    cleanCmd === 'stats' ||
    cleanCmd === 'status'
  ) {
    await handleTelegramStatsCommand(incomingChatId)
  } else if (
    text.includes('System Health') ||
    cleanCmd === 'health' ||
    cleanCmd === 'ping'
  ) {
    await handleTelegramHealthCommand(incomingChatId)
  } else if (
    text.includes('Key Fleet') ||
    cleanCmd === 'keys' ||
    cleanCmd === 'fleet' ||
    cleanCmd === 'gemini'
  ) {
    await handleTelegramKeysCommand(incomingChatId)
  } else if (
    text.includes('Active Users') ||
    cleanCmd === 'users' ||
    cleanCmd === 'user' ||
    cleanCmd === 'accounts'
  ) {
    await handleTelegramUsersCommand(incomingChatId)
  } else if (
    text.includes('Run Daily Report') ||
    cleanCmd === 'report' ||
    cleanCmd === 'digest' ||
    cleanCmd === 'daily'
  ) {
    await sendTelegramResponse(incomingChatId, '⏳ <i>Generating and dispatching 5:30 PM Daily Digest report...</i>')
    const result = await sendTelegramDailyReport(undefined, true)
    if (!result.success) {
      await sendTelegramResponse(incomingChatId, `⚠️ <b>Report generation failed:</b>\n<code>${result.error}</code>`)
    }
  } else if (
    text.includes('Open Admin Web') ||
    cleanCmd === 'web' ||
    cleanCmd === 'admin' ||
    cleanCmd === 'dashboard'
  ) {
    await handleTelegramWebCommand(incomingChatId)
  } else {
    // /start, /help or unrecognized command -> send welcome card with persistent 6-button keyboard
    await handleTelegramWelcome(incomingChatId)
  }

  return NextResponse.json({ ok: true })
}
