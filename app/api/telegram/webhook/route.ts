import { NextResponse } from 'next/server'
import {
  getBotCredentials,
  isChatIdAdmin,
  answerTelegramCallback,
  handleTelegramWelcome,
  handleTelegramTranscribeHelp,
  handleTelegramStatsCommand,
  handleTelegramHealthCommand,
  handleTelegramKeysCommand,
  handleTelegramUsersCommand,
  handleTelegramWebCommand,
  handleTelegramAudioUpload,
  sendTelegramDailyReport,
  sendTelegramResponse,
  sendTelegramMessage,
  deleteTelegramMessage,
  TelegramSenderInfo,
  getOrCreateTelegramUser
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
      last_name?: string
      username?: string
      language_code?: string
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
      last_name?: string
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
  let update: TelegramWebhookUpdate
  try {
    update = await req.json()
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  // Extract Chat ID & sender
  const isCallback = Boolean(update.callback_query)
  const incomingChatId = isCallback
    ? update.callback_query?.message?.chat?.id || update.callback_query?.from?.id
    : update.message?.chat?.id

  if (!incomingChatId) {
    // Unhandled update type (e.g. channel_post, my_chat_member)
    return NextResponse.json({ ok: true, ignored: true })
  }

  const sender: TelegramSenderInfo = {
    id: update.callback_query?.from?.id || update.message?.from?.id || incomingChatId,
    first_name: update.callback_query?.from?.first_name || update.message?.from?.first_name,
    last_name: update.message?.from?.last_name,
    username: update.callback_query?.from?.username || update.message?.from?.username,
    language_code: update.message?.from?.language_code
  }

  // Background registration: ensure sender is registered in Database
  getOrCreateTelegramUser(sender).catch((e) => console.error('[Webhook User Sync]', e))

  const isAdmin = isChatIdAdmin(incomingChatId)

  // Handle Callback Query (Inline Button Click)
  if (isCallback && update.callback_query) {
    const callback = update.callback_query
    const rawAction = (callback.data || '').trim().toLowerCase()

    // Immediately answer callback query to clear loading spinner on user device
    await answerTelegramCallback(callback.id)

    switch (rawAction) {
      case 'transcribe':
        await handleTelegramTranscribeHelp(incomingChatId)
        break
      case 'stats':
        if (isAdmin) {
          await handleTelegramStatsCommand(incomingChatId)
        } else {
          await answerTelegramCallback(callback.id, '🔒 Admin Access Required for platform metrics.', true)
        }
        break
      case 'health':
        if (isAdmin) {
          await handleTelegramHealthCommand(incomingChatId)
        } else {
          await answerTelegramCallback(callback.id, '🔒 Admin Access Required for system health probes.', true)
        }
        break
      case 'keys':
        if (isAdmin) {
          await handleTelegramKeysCommand(incomingChatId)
        } else {
          await answerTelegramCallback(callback.id, '🔒 Admin Access Required for Key Fleet.', true)
        }
        break
      case 'users':
        if (isAdmin) {
          await handleTelegramUsersCommand(incomingChatId)
        } else {
          await answerTelegramCallback(callback.id, '🔒 Admin Access Required for user management.', true)
        }
        break
      case 'report':
        if (isAdmin) {
          await sendTelegramDailyReport(undefined, true)
        } else {
          await answerTelegramCallback(callback.id, '🔒 Admin Access Required for report trigger.', true)
        }
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
      durationSeconds: msg.voice.duration,
      sender
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
      durationSeconds: msg.audio.duration,
      sender
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
      durationSeconds: msg.video.duration,
      sender
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
        fileSize: doc.file_size,
        sender
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
  const cleanCmd = text.toLowerCase().replace(/^\//, '').split('@')[0].trim()

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
    if (isAdmin) {
      await handleTelegramStatsCommand(incomingChatId)
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '🔒 <b>Admin Feature Restricted:</b> Platform statistics are reserved for administrators. You have full access to transcribe any voice note or audio file directly in this chat!'
      )
    }
  } else if (
    text.includes('System Health') ||
    cleanCmd === 'health' ||
    cleanCmd === 'ping'
  ) {
    if (isAdmin) {
      await handleTelegramHealthCommand(incomingChatId)
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '🔒 <b>Admin Feature Restricted:</b> System health probes are reserved for administrators.'
      )
    }
  } else if (
    text.includes('Key Fleet') ||
    cleanCmd === 'keys' ||
    cleanCmd === 'fleet' ||
    cleanCmd === 'gemini'
  ) {
    if (isAdmin) {
      await handleTelegramKeysCommand(incomingChatId)
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '🔒 <b>Admin Feature Restricted:</b> Key Fleet telemetry is reserved for administrators.'
      )
    }
  } else if (
    text.includes('Active Users') ||
    cleanCmd === 'users' ||
    cleanCmd === 'user' ||
    cleanCmd === 'accounts'
  ) {
    if (isAdmin) {
      await handleTelegramUsersCommand(incomingChatId)
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '🔒 <b>Admin Feature Restricted:</b> User account management is reserved for administrators.'
      )
    }
  } else if (
    text.includes('Run Daily Report') ||
    cleanCmd === 'report' ||
    cleanCmd === 'digest' ||
    cleanCmd === 'daily'
  ) {
    if (isAdmin) {
      const loading = await sendTelegramMessage(incomingChatId, '⏳ <i>Generating and dispatching 5:30 PM Daily Digest report...</i>', undefined, false)
      const result = await sendTelegramDailyReport(undefined, true)
      if (loading.messageId) {
        await deleteTelegramMessage(incomingChatId, loading.messageId)
      }
      if (!result.success) {
        await sendTelegramResponse(incomingChatId, `⚠️ <b>Report generation failed:</b>\n<code>${result.error}</code>`)
      }
    } else {
      await sendTelegramResponse(
        incomingChatId,
        '🔒 <b>Admin Feature Restricted:</b> Daily digest report trigger is reserved for administrators.'
      )
    }
  } else if (
    text.includes('Open Admin Web') ||
    text.includes('Open Web App') ||
    cleanCmd === 'web' ||
    cleanCmd === 'admin' ||
    cleanCmd === 'dashboard' ||
    cleanCmd === 'app'
  ) {
    await handleTelegramWebCommand(incomingChatId)
  } else {
    // /start, /help or unrecognized command -> send welcome card with 7-button reply keyboard
    await handleTelegramWelcome(incomingChatId)
  }

  return NextResponse.json({ ok: true })
}
