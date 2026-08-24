/**
 * Telegram Notification & Intelligence Service for Signal System
 * - Real-time Incident & Error Alerts
 * - User Signup & Login Detection
 * - Automated 5:30 PM Daily Usage & Performance Digest
 */

import { prisma } from './prisma'

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

function getBotCredentials() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/["'\r\n]/g, '')
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim().replace(/["'\r\n]/g, '')
  return { token, chatId }
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
export async function sendTelegramDailyReport(customRange?: { start: Date; end: Date }): Promise<{ success: boolean; error?: string; stats?: any }> {
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

    const lines = [
      `📊 <b>DAILY TRANSCRIPT & USAGE DIGEST</b>`,
      `📅 <b>Date:</b> <code>${dateStr}</code>`,
      `⏰ <b>Scheduled Time:</b> <code>5:30 PM (Cambodia Time)</code>`,
      `⏱ <b>Generated at:</b> <code>${timeStr}</code>`,
      '',
      `📈 <b>Performance & Volume:</b>`,
      `• <b>Total Transcripts:</b> <b>${totalJobs}</b> (${successfulJobs} success / ${failedJobs} failed)`,
      `• <b>Success Rate:</b> <b>${successRate}%</b>`,
      `• <b>Audio Processed:</b> <b>${durationFormatted}</b>`,
      `• <b>Total Words:</b> <b>${totalWords.toLocaleString()}</b> words`,
      `• <b>Est. Tokens:</b> <b>${totalTokens.toLocaleString()}</b> tokens`,
      '',
      `👥 <b>User Activity:</b>`,
      `• <b>Active Users Today:</b> <b>${activeUserIds.size}</b>`,
      `• <b>New Signups Today:</b> <b>${newUsers}</b>`
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
