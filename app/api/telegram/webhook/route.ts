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
  handleTelegramAudioUpload,
  handleTelegramTranscribeHelp,
  sendTelegramDailyReport,
  sendTelegramResponse
} from '@/lib/telegram'


export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    caption?: string
    voice?: {
      file_id: string
      duration: number
      mime_type?: string
      file_size?: number
    }
    audio?: {
      file_id: string
      duration: number
      file_name?: string
      mime_type?: string
      title?: string
      file_size?: number
    }
    video?: {
      file_id: string
      duration: number
      file_name?: string
      mime_type?: string
      file_size?: number
    }
    document?: {
      file_id: string
      file_name?: string
      mime_type?: string
      file_size?: number
    }
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

  const msg = update.message

  // 1. Direct Voice Note Dictation (e.g. user holds mic button in Telegram)
  if (msg?.voice) {
    await handleTelegramAudioUpload({
      chatId: incomingChatId,
      fileId: msg.voice.file_id,
      fileName: `voice-note-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.ogg`,
      mimeType: msg.voice.mime_type || 'audio/ogg',
      fileSize: msg.voice.file_size,
      durationSeconds: msg.voice.duration
    })
    return NextResponse.json({ ok: true, type: 'voice' })
  }

  // 2. Direct Audio File Upload (.mp3, .m4a, .wav, .aac, etc.)
  if (msg?.audio) {
    await handleTelegramAudioUpload({
      chatId: incomingChatId,
      fileId: msg.audio.file_id,
      fileName: msg.audio.file_name || `audio-${Date.now()}.mp3`,
      mimeType: msg.audio.mime_type || 'audio/mpeg',
      fileSize: msg.audio.file_size,
      durationSeconds: msg.audio.duration
    })
    return NextResponse.json({ ok: true, type: 'audio' })
  }

  // 3. Direct Video File Upload (.mp4, .mov, etc.)
  if (msg?.video) {
    await handleTelegramAudioUpload({
      chatId: incomingChatId,
      fileId: msg.video.file_id,
      fileName: msg.video.file_name || `video-${Date.now()}.mp4`,
      mimeType: msg.video.mime_type || 'video/mp4',
      fileSize: msg.video.file_size,
      durationSeconds: msg.video.duration
    })
    return NextResponse.json({ ok: true, type: 'video' })
  }

  // 4. File Uploaded as Document Attachment
  if (msg?.document) {
    const doc = msg.document
    const docName = (doc.file_name || '').toLowerCase()
    const isMedia =
      doc.mime_type?.startsWith('audio/') ||
      doc.mime_type?.startsWith('video/') ||
      /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|mov|webm|mkv)$/i.test(docName)

    if (isMedia) {
      await handleTelegramAudioUpload({
        chatId: incomingChatId,
        fileId: doc.file_id,
        fileName: doc.file_name || `media-${Date.now()}.mp3`,
        mimeType: doc.mime_type || 'audio/mpeg',
        fileSize: doc.file_size
      })
      return NextResponse.json({ ok: true, type: 'document_media' })
    } else {
      await sendTelegramResponse(
        incomingChatId,
        [
          `⚠️ <b>Unsupported file format:</b>`,
          `Please send an audio or video file (e.g. <code>.mp3, .m4a, .wav, .aac, .ogg, .mp4</code>) or a voice note.`,
          '',
          `💡 <i>Voice notes can be recorded by holding the mic button in Telegram.</i>`
        ].join('\n')
      )
      return NextResponse.json({ ok: true, type: 'document_unsupported' })
    }
  }

  // Handle Standard Message (Text or Persistent Bottom Reply Keyboard Button)
  const text = (msg?.text || '').trim()


  // Match normalized commands
  const cleanCmd = text.toLowerCase().replace(/^\//, '').trim()

  if (
    text.includes('Audio Transcribe') ||
    cleanCmd === 'transcribe' ||
    cleanCmd === 'audio' ||
    cleanCmd === 'voice'
  ) {
    await handleTelegramTranscribeHelp(incomingChatId)
  } else if (
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
