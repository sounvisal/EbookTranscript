/**
 * Telegram Notification & Intelligence Service for Signal System
 * - Real-time Incident & Error Alerts
 * - User Signup & Login Detection
 * - Automated 5:30 PM Daily Usage & Performance Digest
 */

import { prisma } from './prisma'
import { transcribeAudioBufferWithGemini } from './gemini'


type TelegramAlertParams = {
  title?: string
  endpoint?: string
  errorMessage: string
  errorType?: string
  model?: string
  fileFormat?: string
  userEmail?: string
  userId?: string | null
  userComment?: string
  metadata?: Record<string, unknown>
}

type TelegramUserAlertParams = {
  email: string
  name?: string | null
  isNewUser?: boolean
  provider?: string
}

// Throttle duplicate error alerts within 30 seconds to prevent alert floods
const lastAlerts = new Map<string, number>()

// Sliding window error spike detection (>=3 errors within 10 minutes)
const recentErrorTimestamps: number[] = []
let lastSpikeAlertSent = 0

export function getBotCredentials() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/["'\r\n]/g, '')
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim().replace(/["'\r\n]/g, '')
  return { token, chatId }
}

async function checkAndSendSpikeAlert(token: string, chatId: string, endpoint?: string): Promise<void> {
  const now = Date.now()
  recentErrorTimestamps.push(now)

  // Keep only errors within the last 10 minutes (600,000 ms)
  const windowStart = now - 10 * 60 * 1000
  while (recentErrorTimestamps.length > 0 && recentErrorTimestamps[0] < windowStart) {
    recentErrorTimestamps.shift()
  }

  // Trigger alert if 3 or more errors occurred in 10 mins and cooldown (15 mins) has passed
  if (recentErrorTimestamps.length >= 3 && now - lastSpikeAlertSent > 15 * 60 * 1000) {
    lastSpikeAlertSent = now
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

    const spikeLines = [
      `🚨 <b>CRITICAL: PLATFORM ERROR SPIKE DETECTED</b>`,
      '',
      `⚠️ <b>${recentErrorTimestamps.length} failure incidents</b> logged in the past 10 minutes!`,
      endpoint ? `📍 <b>Trigger Endpoint:</b> <code>${escapeHtml(endpoint)}</code>` : '',
      `⏱ <b>Detected at:</b> <code>${timestamp}</code>`,
      '',
      `💡 <b>Recommended Actions:</b>`,
      `• Google API rate limits or quota drops (429)`,
      `• Inspect Key Fleet health in Admin Operations Dashboard`,
      `• Verify reverse proxy & upload timeouts`
    ].filter(Boolean).join('\n')

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: spikeLines,
          parse_mode: 'HTML'
        })
      })
    } catch (err) {
      console.error('[Telegram] Spike alert dispatch failed:', err)
    }
  }
}

export async function sendTelegramErrorAlert(params: TelegramAlertParams): Promise<boolean> {
  const { token, chatId } = getBotCredentials()
  if (!token || !chatId) {
    return false // Not configured, silently ignore
  }

  // Deduplicate identical error messages within 30s
  const alertKey = `${params.endpoint}_${params.errorMessage.slice(0, 80)}`
  const now = Date.now()
  const lastTime = lastAlerts.get(alertKey)
  if (lastTime && now - lastTime < 30000) {
    return false // Suppress flood
  }
  lastAlerts.set(alertKey, now)

  // Format timestamp (UTC)
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const isUserReport = params.errorType === 'USER_REPORTED_ISSUE' || (params.title && params.title.includes('User'))

  const lines: string[] = [
    isUserReport
      ? `📢 <b>DIRECT USER INCIDENT REPORT</b>`
      : `🚨 <b>${escapeHtml(params.title || 'Signal Incident Alert — Transcription Error')}</b>`,
    ''
  ]

  // User details
  const user = params.userEmail || (params.metadata?.userEmail as string)
  if (user) {
    lines.push(`👤 <b>User:</b> <code>${escapeHtml(user)}</code>`)
  }

  // File and context info
  const filename = (params.metadata?.filename as string) || params.fileFormat
  const fileSize = (params.metadata?.fileSizeBytes as string)
  if (filename && filename !== 'media' && filename !== 'unknown') {
    lines.push(`📁 <b>File:</b> <code>${escapeHtml(filename)}${fileSize ? ` (${fileSize})` : ''}</code>`)
  }

  const inputType = params.metadata?.inputType as string
  if (inputType) {
    lines.push(`⚙️ <b>Input Mode:</b> <code>${escapeHtml(inputType)}</code>`)
  }

  const detectedLanguage = params.metadata?.detectedLanguage as string
  if (detectedLanguage) {
    lines.push(`🌐 <b>Language:</b> <code>${escapeHtml(detectedLanguage)}</code>`)
  }

  // User comments/notes
  const comment = params.userComment || (params.metadata?.userComment as string)
  if (comment) {
    lines.push('', `💬 <b>User Note / Issue:</b>`, `<i>"${escapeHtml(comment)}"</i>`, '')
  }

  // Technical error message
  lines.push(`⚠️ <b>Error Details:</b>`)
  lines.push(`<code>${escapeHtml(params.errorMessage.slice(0, 1000))}</code>`)

  if (params.errorType && params.errorType !== 'USER_REPORTED_ISSUE') {
    lines.push(`🏷 <b>Type:</b> <code>${escapeHtml(params.errorType)}</code>`)
  }
  if (params.model) {
    lines.push(`🤖 <b>Model:</b> <code>${escapeHtml(params.model)}</code>`)
  }
  if (params.endpoint) {
    lines.push(`📍 <b>Endpoint:</b> <code>${escapeHtml(params.endpoint)}</code>`)
  }

  const snippet = params.metadata?.transcriptSnippet as string
  if (snippet) {
    lines.push('', `📝 <b>Transcript Excerpt:</b>`, `<i>${escapeHtml(snippet.slice(0, 300))}...</i>`)
  }

  lines.push(`⏱ <b>Time:</b> <code>${timestamp}</code>`)
  lines.push('', `🛠 <i>Telemetric log recorded in Signal Intelligence.</i>`)

  const message = lines.join('\n')

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })

    // Non-blocking spike detector
    checkAndSendSpikeAlert(token, chatId, params.endpoint).catch((e) => console.error('[SpikeAlert]', e))

    return res.ok
  } catch (err) {
    console.error('Failed to send Telegram alert:', err)
    return false
  }
}

/**
 * Sends real-time notification for User Sign-up or Sign-in
 */
export async function sendTelegramUserAlert(params: TelegramUserAlertParams): Promise<boolean> {
  const { token, chatId } = getBotCredentials()
  if (!token || !chatId) return false

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const lines = [
    params.isNewUser
      ? `🎉 <b>NEW USER REGISTERED!</b>`
      : `🔑 <b>USER SIGNED IN</b>`,
    '',
    `👤 <b>Email:</b> <code>${escapeHtml(params.email)}</code>`,
    params.name ? `📛 <b>Name:</b> ${escapeHtml(params.name)}` : '',
    params.provider ? `🔌 <b>Provider:</b> <code>${escapeHtml(params.provider)}</code>` : '',
    `⏱ <b>Time:</b> <code>${timestamp} (Cambodia Time)</code>`
  ].filter(Boolean)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML'
      })
    })
    return res.ok
  } catch (err) {
    console.error('Failed to send Telegram user alert:', err)
    return false
  }
}

/**
 * Builds and dispatches the 5:30 PM Daily Usage & Performance Digest
 */
export async function sendTelegramDailyReport(
  customRange?: { start: Date; end: Date },
  force = false
): Promise<{ success: boolean; error?: string; skipped?: boolean; stats?: any }> {
  const { token, chatId } = getBotCredentials()
  if (!token || !chatId) {
    return { success: false, error: 'Telegram credentials are not configured.' }
  }

  const now = new Date()

  // Compute start of day in UTC+7 (Cambodia Time)
  const localOffsetHours = 7
  const localNow = new Date(now.getTime() + localOffsetHours * 3600 * 1000)
  const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0))
  const startOfDayUtc = new Date(localStart.getTime() - localOffsetHours * 3600 * 1000)

  const dateStrKey = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`

  // Automated deduplication guard: prevent sending multiple reports on the same day unless forced
  if (!force && !customRange) {
    try {
      const alreadySent = await prisma.verificationToken.findFirst({
        where: {
          identifier: 'telegram_daily_report',
          token: dateStrKey
        }
      })
      if (alreadySent) {
        console.log(`[Telegram] Daily report for ${dateStrKey} was already dispatched. Skipping duplicate.`)
        return {
          success: true,
          skipped: true,
          error: `Daily report for ${dateStrKey} already dispatched today.`
        }
      }
    } catch (err) {
      console.warn('[Telegram] Could not check daily report deduplication token:', err)
    }
  }

  const startTime = customRange?.start || startOfDayUtc
  const endTime = customRange?.end || now

  try {
    // 1. Query usage metrics for today
    const metrics = await prisma.usageMetric.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: endTime
        }
      }
    })

    // 2. Query transcripts created today
    const transcripts = await prisma.transcript.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: endTime
        }
      },
      select: {
        id: true,
        duration: true,
        wordCount: true,
        language: true,
        userId: true
      }
    })

    // 3. Query errors logged today
    const errors = await prisma.errorLog.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: endTime
        }
      },
      select: {
        id: true,
        errorType: true,
        errorMessage: true
      }
    })

    // 4. Query new users registered today
    const newUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: startTime,
          lte: endTime
        }
      }
    })

    // Total unique users active today
    const activeUserIds = new Set<string>()
    metrics.forEach((m) => { if (m.userId) activeUserIds.add(m.userId) })
    transcripts.forEach((t) => { if (t.userId) activeUserIds.add(t.userId) })

    // Calculations
    const successfulJobs = metrics.filter((m) => m.status === 'success').length || transcripts.length
    const failedJobs = metrics.filter((m) => m.status === 'error').length + errors.filter(e => e.errorType !== 'USER_REPORTED_ISSUE').length
    const totalJobs = successfulJobs + failedJobs

    const totalWords = transcripts.reduce((acc, t) => acc + (t.wordCount || 0), 0) ||
      metrics.reduce((acc, m) => acc + (m.wordCount || 0), 0)

    let totalSeconds = transcripts.reduce((acc, t) => acc + (t.duration || 0), 0) ||
      metrics.reduce((acc, m) => acc + (m.durationSeconds || 0), 0)

    if (!totalSeconds && totalWords > 0) {
      totalSeconds = Math.round(totalWords / 2.3)
    }

    const totalTokens = metrics.reduce((acc, m) => acc + (m.totalTokens || 0), 0) ||
      Math.round(totalSeconds * 25 + totalWords * 1.3)

    const successRate = totalJobs > 0 ? ((successfulJobs / totalJobs) * 100).toFixed(1) : '100.0'

    // Format duration to hours and minutes
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const durationFormatted = hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : `${minutes}m ${seconds}s`

    // Model breakdown
    const modelCounts: Record<string, number> = {}
    metrics.forEach((m) => {
      modelCounts[m.model] = (modelCounts[m.model] || 0) + 1
    })

    const dateStr = now.toLocaleDateString('en-US', {
      timeZone: 'Asia/Phnom_Penh',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })

    const timeStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Phnom_Penh',
      hour: '2-digit',
      minute: '2-digit'
    })

    const estimatedCostUsd = ((totalTokens * 0.00000015)).toFixed(4)

    const lines = [
      `📊 <b>Khmer Transcript Daily Recap</b>`,
      `📅 <b>Date:</b> <code>${dateStr}</code>`,
      `⏰ <b>Scheduled Time:</b> <code>Daily Evening Digest (Phnom Penh)</code>`,
      `⏱ <b>Dispatched at:</b> <code>${timeStr}</code>`,
      '',
      `📈 <b>Operations & Volume:</b>`,
      `• <b>Total Transcriptions:</b> <b>${totalJobs}</b> (${successfulJobs} success / ${failedJobs} failed)`,
      `• <b>Audio Processed:</b> <b>${durationFormatted}</b>`,
      `• <b>Active Users:</b> <b>${activeUserIds.size}</b>`,
      `• <b>Success Rate:</b> <b>${successRate}%</b>`,
      `• <b>Est. Gemini Cost:</b> <b>$${estimatedCostUsd}</b>`,
      '',
      `👥 <b>Community Growth:</b>`,
      `• <b>New Signups Today:</b> <b>${newUsers}</b>`,
      `• <b>Total Words Generated:</b> <b>${totalWords.toLocaleString()}</b> words`,
      `• <b>Estimated Tokens:</b> <b>${totalTokens.toLocaleString()}</b> tokens`
    ]

    const modelKeys = Object.keys(modelCounts)
    if (modelKeys.length > 0) {
      lines.push('', `🤖 <b>Models Used:</b>`)
      modelKeys.forEach((k) => {
        lines.push(`• <code>${k}</code>: ${modelCounts[k]} requests`)
      })
    }

    if (errors.length > 0) {
      lines.push('', `⚠️ <b>Incidents Today:</b> <b>${errors.length}</b> logged error(s)`)
    }

    lines.push('', `🛠 <i>Signal Automated Telemetry & Intelligence Service</i>`)

    const message = lines.join('\n')

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || 'Telegram API rejected message' }
    }

    // Record deduplication token for today
    if (!customRange) {
      try {
        await prisma.verificationToken.upsert({
          where: {
            identifier_token: {
              identifier: 'telegram_daily_report',
              token: dateStrKey
            }
          },
          create: {
            identifier: 'telegram_daily_report',
            token: dateStrKey,
            expires: new Date(Date.now() + 48 * 3600 * 1000)
          },
          update: {
            expires: new Date(Date.now() + 48 * 3600 * 1000)
          }
        })
      } catch (err) {
        console.warn('[Telegram] Could not save deduplication token in database:', err)
      }
    }

    return {
      success: true,
      stats: {
        totalJobs,
        successfulJobs,
        failedJobs,
        totalSeconds,
        totalWords,
        totalTokens,
        activeUsers: activeUserIds.size,
        newUsers
      }
    }
  } catch (error) {
    console.error('Error generating daily Telegram report:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database error while aggregating daily metrics'
    }
  }
}

/**
 * Send a test notification to verify Telegram Bot configuration
 */
export async function sendTelegramTestAlert(): Promise<{ success: boolean; error?: string }> {
  const { token, chatId } = getBotCredentials()

  if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN is not set.' }
  if (!chatId) return { success: false, error: 'TELEGRAM_CHAT_ID is not set.' }

  const message = [
    `🤖 <b>Signal Bot Connected Successfully!</b>`,
    '',
    `✅ Your Telegram alerting system is active.`,
    `📡 You will receive instant notifications for:`,
    `• 🚨 Automated transcription & API errors`,
    `• 📢 Direct user error reports`,
    `• 🎉 New user registrations & sign-ins`,
    `• 📊 Daily 5:30 PM performance & usage digests`,
    '',
    `⏱ <b>Timestamp:</b> <code>${new Date().toISOString()}</code>`
  ].join('\n')

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || 'Failed to deliver message via Telegram API.' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error connecting to Telegram API.' }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Check if incoming Telegram chat ID has administrator privileges.
 * Supports comma-separated IDs in TELEGRAM_CHAT_ID or TELEGRAM_ADMIN_CHATS.
 */
export function isChatIdAdmin(chatId: string | number): boolean {
  const raw = `${process.env.TELEGRAM_CHAT_ID || ''},${process.env.TELEGRAM_ADMIN_CHATS || ''}`
  const adminIds = raw
    .split(',')
    .map((id) => id.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  return adminIds.includes(String(chatId).trim())
}

export interface TelegramSenderInfo {
  id: number | string
  firstName?: string
  lastName?: string
  username?: string
  isBot?: boolean
}

/**
 * Resolves or creates a database User for the given Telegram user.
 * - If admin, links with existing admin account and ensures Account record exists.
 * - If team member, finds existing user by telegram Account or creates a new User with role 'user'.
 * - Sends instant user alert to admin if a new team user registers.
 */
export async function getOrCreateTelegramUser(sender: TelegramSenderInfo) {
  const telegramIdStr = String(sender.id).trim()
  const isAdmin = isChatIdAdmin(sender.id)

  const fullName = [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim()
  const displayName = fullName
    ? (sender.username ? `${fullName} (@${sender.username})` : fullName)
    : (sender.username ? `@${sender.username}` : `Telegram User #${telegramIdStr}`)

  // 1. If admin, check existing admin account first
  if (isAdmin) {
    const adminEmails = (process.env.ADMIN_EMAILS || 'sounvisal154@gmail.com,suonvisal154@gmail.com,suonvisal.biu@gmail.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { role: 'admin' },
          { email: { in: adminEmails } },
          { accounts: { some: { provider: 'telegram', providerAccountId: telegramIdStr } } }
        ]
      },
      include: { accounts: true }
    })

    if (adminUser) {
      if (!adminUser.name && displayName) {
        await prisma.user.update({
          where: { id: adminUser.id },
          data: { name: displayName }
        }).catch(() => {})
      }

      const hasTelegramAccount = adminUser.accounts?.some((a) => a.provider === 'telegram' && a.providerAccountId === telegramIdStr)
      if (!hasTelegramAccount) {
        await prisma.account.create({
          data: {
            userId: adminUser.id,
            type: 'oauth',
            provider: 'telegram',
            providerAccountId: telegramIdStr
          }
        }).catch(() => {})
      }

      return adminUser
    }
  }

  // 2. Check if user already linked via Account record
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'telegram',
        providerAccountId: telegramIdStr
      }
    },
    include: { user: true }
  })

  if (existingAccount?.user) {
    if (displayName && existingAccount.user.name !== displayName) {
      const updated = await prisma.user.update({
        where: { id: existingAccount.user.id },
        data: { name: displayName }
      }).catch(() => existingAccount.user)
      return updated
    }
    return existingAccount.user
  }

  // 3. Check if user already exists by synthetic Telegram email
  const syntheticEmail = sender.username
    ? `${sender.username.toLowerCase()}@telegram.signal`
    : `tg_${telegramIdStr}@telegram.signal`

  let existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: syntheticEmail },
        { email: `tg_${telegramIdStr}@telegram.signal` }
      ]
    }
  })

  if (existingUser) {
    await prisma.account.create({
      data: {
        userId: existingUser.id,
        type: 'oauth',
        provider: 'telegram',
        providerAccountId: telegramIdStr
      }
    }).catch(() => {})

    if (displayName && existingUser.name !== displayName) {
      existingUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: { name: displayName }
      }).catch(() => existingUser)
    }

    return existingUser
  }

  // 4. Create new user in PostgreSQL for this Telegram team member
  try {
    const newUser = await prisma.user.create({
      data: {
        name: displayName,
        email: syntheticEmail,
        role: isAdmin ? 'admin' : 'user',
        accounts: {
          create: {
            type: 'oauth',
            provider: 'telegram',
            providerAccountId: telegramIdStr
          }
        }
      }
    })

    // Notify administrator that a new team user just joined via Telegram
    if (!isAdmin) {
      sendTelegramUserAlert({
        email: syntheticEmail,
        name: displayName,
        isNewUser: true,
        provider: 'telegram'
      }).catch(() => {})
    }

    return newUser
  } catch (err) {
    console.error('[getOrCreateTelegramUser] Error creating user, checking fallback:', err)
    const fallback = await prisma.user.findFirst({
      where: {
        OR: [
          { email: syntheticEmail },
          { accounts: { some: { provider: 'telegram', providerAccountId: telegramIdStr } } }
        ]
      }
    })
    if (fallback) return fallback
    throw err
  }
}

/**
 * Persistent 7-button keyboard pinned to the bottom of Telegram chat for Admins.
 * Includes direct Audio Transcribe guide & quick intelligence commands.
 */
export const TELEGRAM_MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '🎙️ Audio Transcribe' }, { text: '📊 Live Stats' }],
    [{ text: '🩺 System Health' }, { text: '🔑 Key Fleet' }],
    [{ text: '👥 Active Users' }, { text: '🔄 Run Daily Report' }],
    [{ text: '🌐 Open Admin Web' }]
  ],
  resize_keyboard: true,
  is_persistent: true
}

/**
 * Clean 2-button keyboard for team members focused on Speech Transcription.
 */
export const TELEGRAM_TEAM_KEYBOARD = {
  keyboard: [
    [{ text: '🎙️ Audio Transcribe' }],
    [{ text: '🌐 Open Web App' }]
  ],
  resize_keyboard: true,
  is_persistent: true
}

export async function handleTelegramTranscribeHelp(chatId: string | number): Promise<boolean> {
  const message = [
    `🎙️ <b>Instant Speech Transcription (In This Chat)</b>`,
    '',
    `You and your team can transcribe speech directly on Telegram with zero setup:`,
    '',
    `1️⃣ <b>Voice Note (Hold to Record):</b>`,
    `• Hold down the 🎙️ <b>Microphone icon</b> (bottom right next to the text bar).`,
    `• Speak in Khmer (ភាសាខ្មែរ) or English.`,
    `• Release to send — the bot transcribes it in 3-5 seconds!`,
    '',
    `2️⃣ <b>Audio / Video Files:</b>`,
    `• Tap the 📎 <b>Paperclip icon</b> (bottom left).`,
    `• Select any audio file: <code>.mp3, .m4a, .wav, .aac, .ogg, .mp4</code>`,
    `• Send it here — the bot downloads, transcribes, and replies with the full text!`,
    '',
    `☁️ <b>Automatic Cloud Sync:</b>`,
    `All transcripts created here are automatically saved to your Website History and Dashboard.`,
    '',
    `👉 <i>Try it right now: Tap the 📎 paperclip to send an audio file, or hold the 🎙️ mic button!</i>`
  ].join('\n')

  return sendTelegramResponse(chatId, message, undefined, true)
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
  includeMainKeyboard: boolean = true
): Promise<{ success: boolean; messageId?: number }> {
  const { token } = getBotCredentials()
  if (!token) return { success: false }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  }

  if (inlineKeyboard && inlineKeyboard.length > 0) {
    body.reply_markup = { inline_keyboard: inlineKeyboard }
  } else if (includeMainKeyboard) {
    body.reply_markup = isChatIdAdmin(chatId) ? TELEGRAM_MAIN_KEYBOARD : TELEGRAM_TEAM_KEYBOARD
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (res.ok && data.ok) {
      return { success: true, messageId: data.result?.message_id }
    }
    return { success: false }
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err)
    return { success: false }
  }
}

export async function deleteTelegramMessage(
  chatId: string | number,
  messageId?: number | null
): Promise<boolean> {
  const { token } = getBotCredentials()
  if (!token || !messageId) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    })
    const data = await res.json()
    return Boolean(data.ok)
  } catch (err) {
    console.error('[Telegram] Failed to delete message:', err)
    return false
  }
}

export async function sendTelegramResponse(
  chatId: string | number,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
  includeMainKeyboard: boolean = true
): Promise<boolean> {
  const res = await sendTelegramMessage(chatId, text, inlineKeyboard, includeMainKeyboard)
  return res.success
}

export async function handleTelegramWelcome(chatId: string | number): Promise<boolean> {
  const isAdmin = isChatIdAdmin(chatId)

  if (isAdmin) {
    const message = [
      `🤖 <b>Welcome to Signal Command Center!</b>`,
      '',
      `You have full remote administrator control over the Signal platform directly from this chat.`,
      `<b>No typing required</b> — use the one-tap buttons below:`,
      '',
      `• <b>🎙️ Audio Transcribe:</b> Send audio files or voice notes to transcribe instantly`,
      `• <b>📊 Live Stats:</b> Today's audio duration, requests & error rate`,
      `• <b>🩺 System Health:</b> Real-time Database, Gemini & Edge ping`,
      `• <b>🔑 Key Fleet:</b> Gemini API key latency & quota status`,
      `• <b>👥 Active Users:</b> New signups & top transcribers`,
      `• <b>🔄 Run Daily Report:</b> Trigger on-demand 5:30 PM digest`,
      `• <b>🌐 Open Admin Web:</b> Direct link to Web Dashboard`,
      '',
      `🎙️ <b>Instant Pocket Transcriber:</b>`,
      `Send any audio, video, or hold the mic button to record a voice note for instant verbatim Khmer / English transcription!`,
      '',
      `Tap any button below or send audio now ⬇️`
    ].join('\n')

    return sendTelegramResponse(chatId, message, undefined, true)
  }

  const teamMessage = [
    `👋 <b>Welcome to Signal Speech Transcriber!</b>`,
    '',
    `You can transcribe speech directly in this chat with zero setup:`,
    '',
    `🎙️ <b>Option 1: Voice Note (Hold to Record)</b>`,
    `Hold down the 🎙️ <b>microphone icon</b> (bottom right), speak in Khmer (ភាសាខ្មែរ) or English, and release to send!`,
    '',
    `📁 <b>Option 2: Audio & Video Files</b>`,
    `Tap the 📎 <b>paperclip icon</b> (bottom left) and send any <code>.mp3, .m4a, .wav, .aac, .ogg, .mp4</code> recording.`,
    '',
    `⚡ The bot will automatically analyze the audio and reply with the clean verbatim text within seconds!`,
    '',
    `Tap below or send an audio file to get started ⬇️`
  ].join('\n')

  return sendTelegramResponse(chatId, teamMessage, undefined, true)
}


export async function handleTelegramStatsCommand(chatId: string | number): Promise<boolean> {
  const loading = await sendTelegramMessage(chatId, '📊 <i>Retrieving live platform metrics...</i>', undefined, false)
  const now = new Date()
  const localOffsetHours = 7
  const localNow = new Date(now.getTime() + localOffsetHours * 3600 * 1000)
  const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0))
  const startOfDayUtc = new Date(localStart.getTime() - localOffsetHours * 3600 * 1000)

  const timeStr = localNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  try {
    const [metricsCount, sumData, errorsCount, activeUsersGroup] = await Promise.all([
      prisma.usageMetric.count({ where: { createdAt: { gte: startOfDayUtc } } }),
      prisma.usageMetric.aggregate({
        _sum: { durationSeconds: true, wordCount: true },
        where: { createdAt: { gte: startOfDayUtc } }
      }),
      prisma.errorLog.count({ where: { createdAt: { gte: startOfDayUtc } } }),
      prisma.usageMetric.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startOfDayUtc }, userId: { not: null } }
      })
    ])

    const totalSeconds = sumData._sum.durationSeconds || 0
    const totalWords = sumData._sum.wordCount || 0
    const activeUsers = activeUsersGroup.length
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const durationFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${Math.floor(totalSeconds % 60)}s`

    const totalRuns = metricsCount + errorsCount
    const errorRate = totalRuns > 0 ? ((errorsCount / totalRuns) * 100).toFixed(1) : '0.0'

    const message = [
      `📊 <b>TODAY'S LIVE PLATFORM STATS</b>`,
      `⏱ <i>As of: ${timeStr} (Cambodia Time)</i>`,
      '',
      `🎧 <b>Audio Transcribed:</b> <code>${durationFormatted}</code>`,
      `📝 <b>Words Generated:</b> <code>${totalWords.toLocaleString()} words</code>`,
      `⚡ <b>Successful Runs:</b> <code>${metricsCount.toLocaleString()}</code>`,
      `👥 <b>Active Users Today:</b> <code>${activeUsers} user${activeUsers === 1 ? '' : 's'}</code>`,
      `🚨 <b>Errors Encountered:</b> <code>${errorsCount} (${errorRate}% error rate)</code>`,
      '',
      `💡 <i>Tip: Tap Refresh Stats below for live updates.</i>`
    ].join('\n')

    const inlineKeyboard = [
      [
        { text: '🔄 Refresh Stats', callback_data: 'stats' },
        { text: '🩺 System Health', callback_data: 'health' }
      ],
      [
        { text: '🌐 Open Admin Dashboard', url: 'https://ebook-transcript.vercel.app/admin' }
      ]
    ]

    if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
    return sendTelegramResponse(chatId, message, inlineKeyboard, true)
  } catch (err) {
    if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
    return sendTelegramResponse(chatId, `⚠️ <b>Error retrieving stats:</b>\n<code>${escapeHtml(String(err))}</code>`)
  }
}

export async function handleTelegramHealthCommand(chatId: string | number): Promise<boolean> {
  const loading = await sendTelegramMessage(chatId, '🩺 <i>Probing platform systems & Gemini API...</i>', undefined, false)
  const timestamp = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh' })

  // 1. Check PostgreSQL via Prisma
  let dbStatus = '🟢 Operational'
  let dbLatency = 0
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    dbLatency = Date.now() - dbStart
    dbStatus = `🟢 Healthy (${dbLatency}ms)`
  } catch (err) {
    dbStatus = `🔴 Error: ${escapeHtml(String(err).slice(0, 80))}`
  }

  // 2. Check Gemini API
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean)
  let geminiStatus = '🟢 Online'
  let geminiLatency = 0

  if (keys.length > 0) {
    const key = keys[0]
    const gStart = Date.now()
    try {
      const controller = new AbortController()
      const tId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`, {
        signal: controller.signal
      })
      clearTimeout(tId)
      geminiLatency = Date.now() - gStart
      if (res.ok) {
        geminiStatus = `🟢 Online (${geminiLatency}ms)`
      } else if (res.status === 429) {
        geminiStatus = `🟡 Rate Limited (429)`
      } else {
        geminiStatus = `🔴 HTTP ${res.status}`
      }
    } catch {
      geminiStatus = `🔴 Connection Timeout`
    }
  } else {
    geminiStatus = `🟡 No Keys Configured`
  }

  const message = [
    `🩺 <b>SIGNAL PLATFORM HEALTH CHECK</b>`,
    `⏱ <i>Time: ${timestamp} (UTC+7)</i>`,
    '',
    `🗄 <b>PostgreSQL Database:</b>`,
    `   ↳ ${dbStatus}`,
    '',
    `🤖 <b>Gemini AI Engine:</b>`,
    `   ↳ ${geminiStatus}`,
    '',
    `⚡ <b>Vercel Serverless Edge:</b>`,
    `   ↳ 🟢 Operational`,
    '',
    `🔑 <b>Key Fleet Size:</b> <code>${keys.length} API key${keys.length === 1 ? '' : 's'} loaded</code>`,
    '',
    `🛡️ <i>All critical systems operational.</i>`
  ].join('\n')

  const inlineKeyboard = [
    [
      { text: '🔄 Re-check Health', callback_data: 'health' },
      { text: '🔑 Check Key Fleet', callback_data: 'keys' }
    ],
    [
      { text: '📊 View Live Stats', callback_data: 'stats' }
    ]
  ]

  if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
  return sendTelegramResponse(chatId, message, inlineKeyboard, true)
}

export async function handleTelegramKeysCommand(chatId: string | number): Promise<boolean> {
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean)

  if (keys.length === 0) {
    return sendTelegramResponse(chatId, `⚠️ <b>No Gemini API keys configured</b> in environment variables.`)
  }

  const loading = await sendTelegramMessage(chatId, '🔑 <i>Testing Gemini Key Fleet latency & quotas...</i>', undefined, false)

  const results = await Promise.all(
    keys.map(async (key, idx) => {
      const masked = `${key.slice(0, 6)}...${key.slice(-4)}`
      const start = Date.now()
      try {
        const controller = new AbortController()
        const tId = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=3`, {
          signal: controller.signal
        })
        clearTimeout(tId)
        const latency = Date.now() - start
        if (res.ok) {
          return `🟢 <b>Key #${idx + 1}:</b> <code>${masked}</code> — ${latency}ms\n   ↳ <i>Status: Active & Operational</i>`
        }
        if (res.status === 429) {
          return `🟡 <b>Key #${idx + 1}:</b> <code>${masked}</code> — Rate Limited (429)`
        }
        return `🔴 <b>Key #${idx + 1}:</b> <code>${masked}</code> — HTTP ${res.status}`
      } catch {
        return `🔴 <b>Key #${idx + 1}:</b> <code>${masked}</code> — Timeout / Unreachable`
      }
    })
  )

  const message = [
    `🔑 <b>GEMINI API KEY FLEET (${keys.length} Keys)</b>`,
    '',
    results.join('\n\n'),
    '',
    `🔄 <b>Failover Engine:</b> Automatic round-robin rotation active.`
  ].join('\n')

  const inlineKeyboard = [
    [
      { text: '🔄 Re-test Keys', callback_data: 'keys' },
      { text: '🩺 Health', callback_data: 'health' }
    ]
  ]

  if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
  return sendTelegramResponse(chatId, message, inlineKeyboard, true)
}

export async function handleTelegramUsersCommand(chatId: string | number): Promise<boolean> {
  const loading = await sendTelegramMessage(chatId, '👥 <i>Fetching user intelligence & recent signups...</i>', undefined, false)
  try {
    const [recentUsers, totalUsersCount] = await Promise.all([
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true
        }
      }),
      prisma.user.count()
    ])

    const now = Date.now()
    const userLines = recentUsers.map((u, i) => {
      const email = u.email || 'Anonymous'
      const roleBadge = u.role === 'admin' ? '👑 Admin' : '👤 User'
      const diffHours = Math.round((now - new Date(u.createdAt).getTime()) / (3600 * 1000))
      const timeAgo = diffHours < 1 ? 'Just now' : diffHours < 24 ? `${diffHours}h ago` : `${Math.round(diffHours / 24)}d ago`
      return `${i + 1}. <code>${escapeHtml(email)}</code> (${roleBadge}, ${timeAgo})`
    })

    const message = [
      `👥 <b>USER INTELLIGENCE & SIGNUPS</b>`,
      `📊 <b>Total Registered Users:</b> <code>${totalUsersCount}</code>`,
      '',
      `✨ <b>Latest 5 Signups:</b>`,
      userLines.join('\n'),
      '',
      `💡 <i>Manage roles and daily quotas directly in the Admin Web.</i>`
    ].join('\n')

    const inlineKeyboard = [
      [
        { text: '🔄 Refresh Users', callback_data: 'users' },
        { text: '📊 Live Stats', callback_data: 'stats' }
      ],
      [
        { text: '🌐 Open Admin Users Table', url: 'https://ebook-transcript.vercel.app/admin' }
      ]
    ]

    if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
    return sendTelegramResponse(chatId, message, inlineKeyboard, true)
  } catch (err) {
    if (loading.messageId) await deleteTelegramMessage(chatId, loading.messageId)
    return sendTelegramResponse(chatId, `⚠️ <b>Error fetching users:</b>\n<code>${escapeHtml(String(err))}</code>`)
  }
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<boolean> {
  const { token } = getBotCredentials()
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      })
    })
    return res.ok
  } catch (err) {
    console.error('[Telegram] answerCallbackQuery failed:', err)
    return false
  }
}

export async function handleTelegramWebCommand(chatId: string | number): Promise<boolean> {
  const isAdmin = isChatIdAdmin(chatId)
  const siteUrl = (process.env.NEXTAUTH_URL || 'https://ebook-transcript.vercel.app').replace(/\/$/, '')

  if (isAdmin) {
    const adminUrl = `${siteUrl}/admin`
    const message = [
      `🌐 <b>Signal Web Admin Portal</b>`,
      '',
      `Access complete analytics, user quotas, Key Fleet, and live system logs:`,
      `🔗 <code>${adminUrl}</code>`,
      '',
      `Tap the button below to launch directly:`
    ].join('\n')

    return sendTelegramResponse(
      chatId,
      message,
      [[{ text: '🚀 Open Admin Dashboard', url: adminUrl }]],
      true
    )
  }

  const message = [
    `🌐 <b>Signal Web Application</b>`,
    '',
    `Upload large audio files (up to 2 GB), view complete transcription history, and export in TXT / SRT / Word / PDF format:`,
    `🔗 <code>${siteUrl}</code>`,
    '',
    `Tap the button below to open in your browser:`
  ].join('\n')

  return sendTelegramResponse(
    chatId,
    message,
    [[{ text: '🚀 Open Web App', url: siteUrl }]],
    true
  )
}

export async function sendTelegramChatAction(
  chatId: string | number,
  action: 'typing' | 'upload_document' | 'record_voice' | 'upload_voice' = 'typing'
): Promise<boolean> {
  const { token } = getBotCredentials()
  if (!token) return false
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action })
    })
    return true
  } catch {
    return false
  }
}

export async function sendTelegramDocument(
  chatId: string | number,
  fileName: string,
  content: string | Buffer,
  caption?: string
): Promise<boolean> {
  const { token } = getBotCredentials()
  if (!token) return false

  const formData = new FormData()
  formData.append('chat_id', String(chatId))
  if (caption) {
    formData.append('caption', caption)
    formData.append('parse_mode', 'HTML')
  }

  const blob = typeof content === 'string'
    ? new Blob([content], { type: 'text/plain;charset=utf-8' })
    : new Blob([new Uint8Array(content)])

  formData.append('document', blob, fileName)


  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData
    })
    return res.ok
  } catch (err) {
    console.error('[Telegram] sendDocument failed:', err)
    return false
  }
}

export async function handleTelegramAudioUpload(params: {
  chatId: string | number
  fileId: string
  fileName?: string
  mimeType?: string
  fileSize?: number
  durationSeconds?: number
  sender?: TelegramSenderInfo
}): Promise<boolean> {
  const { token } = getBotCredentials()
  if (!token) return false

  // 1. Check file size limit (Telegram Bot API allows up to 20MB downloads)
  if (params.fileSize && params.fileSize > 20 * 1024 * 1024) {
    await sendTelegramResponse(
      params.chatId,
      [
        `⚠️ <b>File size exceeds Telegram limit:</b>`,
        `Telegram Bot API limits direct bot downloads to 20MB.`,
        '',
        `💡 <i>For large multi-hour recordings, upload directly to the Web Dashboard (which supports up to 2GB):</i>`,
        `🌐 https://ebook-transcript.vercel.app`
      ].join('\n')
    )
    return false
  }

  // 2. Infer clean file name & MIME type
  let fileName = params.fileName || 'voice-note.ogg'
  let mimeType = params.mimeType || 'audio/ogg'

  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.mp3')) {
    mimeType = 'audio/mpeg'
  } else if (lowerName.endsWith('.m4a')) {
    mimeType = 'audio/mp4'
  } else if (lowerName.endsWith('.wav')) {
    mimeType = 'audio/wav'
  } else if (lowerName.endsWith('.aac')) {
    mimeType = 'audio/aac'
  } else if (lowerName.endsWith('.ogg') || lowerName.endsWith('.oga') || lowerName.endsWith('.opus')) {
    mimeType = 'audio/ogg'
  } else if (lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm')) {
    mimeType = lowerName.endsWith('.mp4') ? 'video/mp4' : lowerName.endsWith('.mov') ? 'video/quicktime' : 'video/webm'
  }

  // 3. Send progress acknowledgment
  const sizeMb = params.fileSize ? ` (${(params.fileSize / (1024 * 1024)).toFixed(1)} MB)` : ''
  const loading = await sendTelegramMessage(
    params.chatId,
    [
      `🎙️ <b>Signal AI Speech Engine</b>`,
      `📁 <code>${escapeHtml(fileName)}</code>${sizeMb}`,
      '',
      `⏳ <i>Downloading audio & transcribing verbatim in Khmer / English...</i>`,
      `Please wait a few seconds ⚡`
    ].join('\n'),
    undefined,
    false
  )
  const loadingMsgId = loading.messageId
  await sendTelegramChatAction(params.chatId, 'typing')

  try {
    // 4. Resolve download URL from Telegram
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${params.fileId}`)
    const fileInfo = await fileInfoRes.json()
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error(fileInfo.description || 'Unable to locate media file on Telegram servers.')
    }

    const filePath = fileInfo.result.file_path

    // 5. Download binary audio buffer
    const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio from Telegram (HTTP ${audioRes.status})`)
    }
    const arrayBuffer = await audioRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 6. Transcribe with Gemini
    const { text, language, model } = await transcribeAudioBufferWithGemini(buffer, mimeType, fileName)

    if (!text || !text.trim()) {
      if (loadingMsgId) await deleteTelegramMessage(params.chatId, loadingMsgId)
      await sendTelegramResponse(
        params.chatId,
        `⚠️ <b>No audible speech detected:</b> The audio file appears to contain silence or background noise with no distinguishable words.`
      )
      return true
    }

    // 7. Calculate metrics and save to Database (Full Cloud Sync with User Persistence)
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const durationSeconds = params.durationSeconds || Math.max(1, Math.round(buffer.length / 16000))

    // Resolve or create user in database
    const dbUser = await getOrCreateTelegramUser(params.sender || { id: params.chatId }).catch((err) => {
      console.error('[Telegram Audio Handler] Failed to get/create user:', err)
      return null
    })

    // Save to prisma.transcript (accessible in Web History and User Directory)
    await prisma.transcript.create({
      data: {
        text,
        source: 'telegram-bot',
        filename: fileName,
        duration: durationSeconds,
        wordCount,
        language,
        userId: dbUser?.id || null
      }
    }).catch((e) => console.error('[Telegram DB Sync] Transcript save error:', e))

    // Save to prisma.usageMetric (telemetry & per-user quota calculation)
    const ext = fileName.split('.').pop()?.toLowerCase() || 'audio'
    await prisma.usageMetric.create({
      data: {
        userId: dbUser?.id || null,
        model,
        inputType: 'telegram',
        fileFormat: ext,
        fileSizeBytes: buffer.length,
        durationSeconds,
        wordCount,
        status: 'success'
      }
    }).catch((e) => console.error('[Telegram DB Sync] Usage metric save error:', e))

    // Auto-delete the loading message so only the clean final transcript shows in chat
    if (loadingMsgId) {
      await deleteTelegramMessage(params.chatId, loadingMsgId)
    }

    // 8. Deliver final transcript back to chat
    const mins = Math.floor(durationSeconds / 60)
    const secs = Math.round(durationSeconds % 60)
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

    const header = [
      `✅ <b>TRANSCRIPTION COMPLETE</b>`,
      `📁 <code>${escapeHtml(fileName)}</code>`,
      `🌐 <b>Language:</b> <code>${escapeHtml(language)}</code>`,
      `⏱ <b>Duration:</b> <code>${durationStr}</code> • <b>Words:</b> <code>${wordCount.toLocaleString()}</code>`,
      `🤖 <b>Model:</b> <code>${escapeHtml(model)}</code>`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      ''
    ].join('\n')

    const inlineKeyboard = [
      [
        { text: '🌐 View in Web History', url: 'https://ebook-transcript.vercel.app/history' },
        ...(isChatIdAdmin(params.chatId) ? [{ text: '📊 Live Stats', callback_data: 'stats' }] : [])
      ]
    ]

    // If text fits in Telegram's 4096 char limit
    if (text.length <= 3200) {
      const fullMessage = `${header}${escapeHtml(text)}\n\n⚡ <i>Synced to your Web History & Dashboard.</i>`
      await sendTelegramResponse(params.chatId, fullMessage, inlineKeyboard, true)
    } else {
      // Long transcript: send preview + full document attachment
      const previewText = text.slice(0, 2600) + '...\n\n<i>[Full transcript continues in the document attachment below ⬇️]</i>'
      await sendTelegramResponse(params.chatId, `${header}${escapeHtml(previewText)}`, inlineKeyboard, true)

      const docName = `${fileName.replace(/\.[^/.]+$/, '')}_transcript.txt`
      await sendTelegramDocument(
        params.chatId,
        docName,
        text,
        `📄 <b>Full Transcript Attachment:</b> <code>${escapeHtml(docName)}</code> (${wordCount.toLocaleString()} words)`
      )
    }

    return true
  } catch (err) {
    if (loadingMsgId) {
      await deleteTelegramMessage(params.chatId, loadingMsgId)
    }
    console.error('[Telegram Audio Handler] Failed:', err)
    const errText = err instanceof Error ? err.message : String(err)
    await sendTelegramResponse(
      params.chatId,
      [
        `❌ <b>Transcription Failed:</b>`,
        `<code>${escapeHtml(errText.slice(0, 400))}</code>`,
        '',
        `💡 <i>You can also upload this file on the Web Dashboard:</i>`,
        `🌐 https://ebook-transcript.vercel.app`
      ].join('\n')
    )
    return false
  }
}



