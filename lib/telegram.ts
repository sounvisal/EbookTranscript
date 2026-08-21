/**
 * Telegram Alert Notification Service for Signal Intelligence System
 * Sends automated real-time incident alerts to your Telegram chat/channel.
 */

type TelegramAlertParams = {
  title?: string
  endpoint?: string
  errorMessage: string
  errorType?: string
  model?: string
  fileFormat?: string
  userEmail?: string
  userId?: string | null
  metadata?: Record<string, unknown>
}

// Throttle duplicate error alerts within 30 seconds to prevent alert floods
const lastAlerts = new Map<string, number>()

export async function sendTelegramErrorAlert(params: TelegramAlertParams): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/["'\r\n]/g, '')
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim().replace(/["'\r\n]/g, '')

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

  const message = [
    `🚨 <b>${escapeHtml(params.title || 'Signal Incident Alert — Transcription Error')}</b>`,
    '',
    `⚠️ <b>Error:</b> <code>${escapeHtml(params.errorMessage.slice(0, 300))}</code>`,
    params.errorType ? `🏷 <b>Type:</b> <code>${escapeHtml(params.errorType)}</code>` : '',
    params.endpoint ? `📍 <b>Endpoint:</b> <code>${escapeHtml(params.endpoint)}</code>` : '',
    params.model ? `🤖 <b>Model:</b> <code>${escapeHtml(params.model)}</code>` : '',
    params.fileFormat ? `📁 <b>Format:</b> <code>${escapeHtml(params.fileFormat)}</code>` : '',
    params.userEmail ? `👤 <b>User:</b> <code>${escapeHtml(params.userEmail)}</code>` : '',
    `⏱ <b>Time:</b> <code>${timestamp}</code>`,
    '',
    `🛠 <i>Check telemetry in Admin Dashboard for more details.</i>`
  ]
    .filter(Boolean)
    .join('\n')

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
 * Send a test notification to verify Telegram Bot configuration
 */
export async function sendTelegramTestAlert(): Promise<{ success: boolean; error?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/["'\r\n]/g, '')
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim().replace(/["'\r\n]/g, '')

  if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN is not set.' }
  if (!chatId) return { success: false, error: 'TELEGRAM_CHAT_ID is not set.' }

  const message = [
    `🤖 <b>Signal Bot Connected Successfully!</b>`,
    '',
    `✅ Your Telegram alerting system is active.`,
    `📡 You will now receive instant notifications if any transcription fails or API error occurs in production.`,
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
