import { prisma } from '@/lib/prisma'
import { getAdminJobs } from '@/lib/adminJobs'
import { changeOperation, getOperationsSettings, resetUserQuota } from '@/lib/operations'
import { answerTelegramCallback, isChatIdAdmin, sendTelegramResponse } from '@/lib/telegram'

export function isTelegramOperator(chatId: number | string, senderId: number | string) {
  const allowed = [process.env.TELEGRAM_CHAT_ID, process.env.ADMIN_CHAT_IDS, process.env.TELEGRAM_ADMIN_USER_IDS]
    .flatMap(value => (value || '').split(',')).map(value => value.trim()).filter(value => /^\d+$/.test(value))
  return (isChatIdAdmin(chatId) || String(chatId) === String(senderId)) && allowed.includes(String(senderId))
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const menu = [
  [{ text: 'Model', callback_data: 'ops:model' }, { text: 'Queue', callback_data: 'ops:queue' }],
  [{ text: 'Safe Mode', callback_data: 'ops:safe_mode' }, { text: 'Reset quota', callback_data: 'ops:reset_quota' }]
]

export async function handleTelegramOperations(input: { chatId: number; senderId: number; updateId: number; text?: string; callback?: { id: string; data?: string } }) {
  const raw = input.callback?.data?.startsWith('ops:') ? input.callback.data.slice(4).replace(':', ' ') : input.text?.trim() || ''
  const [head, ...args] = raw.split(/\s+/)
  const command = head.replace(/^\//, '').split('@')[0].toLowerCase()
  const isMenu = raw === '⚙️ Operations'
  if (!isMenu && !['ops', 'model', 'safe_mode', 'reset_quota', 'queue'].includes(command)) return false
  if (input.callback) await answerTelegramCallback(input.callback.id)
  if (!isTelegramOperator(input.chatId, input.senderId)) {
    await sendTelegramResponse(input.chatId, '🔒 This command requires an authorized administrator.', undefined, false)
    return true
  }
  const actor = { id: `telegram:${input.senderId}`, commandId: String(input.updateId) }
  const send = (message: string, keyboard = menu) => sendTelegramResponse(input.chatId, message, keyboard, false)
  try {
    if (command === 'model') {
      if (args.length) {
        if (args.length !== 1) throw new Error('Usage: /model 2.5-flash, /model 2.5-flash-lite, or /model auto')
        const model = args[0] === 'auto' ? 'auto' : args[0].startsWith('gemini-') ? args[0] : `gemini-${args[0]}`
        await changeOperation('model', model, actor)
      }
      const settings = await getOperationsSettings()
      await send(`<b>Transcription model:</b> ${escape(settings.model)}\nApplies to new work. Auto uses the configured adaptive routing.`, [
        [{ text: '2.5 Flash', callback_data: 'ops:model:2.5-flash' }, { text: '2.5 Flash Lite', callback_data: 'ops:model:2.5-flash-lite' }],
        [{ text: 'Automatic', callback_data: 'ops:model:auto' }, { text: 'Operations', callback_data: 'ops:ops' }]
      ])
    } else if (command === 'safe_mode') {
      if (args.length) {
        if (args.length !== 1 || !['on', 'off'].includes(args[0].toLowerCase())) throw new Error('Usage: /safe_mode on or /safe_mode off')
        await changeOperation('safeMode', args[0].toLowerCase() === 'on', actor)
      }
      const settings = await getOperationsSettings()
      await send(`<b>Safe Mode: ${settings.safeMode ? 'ON' : 'OFF'}</b>\nSafe Mode pauses new transcription starts. Accepted background jobs can finish.`, [
        [{ text: 'Pause new work', callback_data: 'ops:safe_mode:on' }, { text: 'Resume new work', callback_data: 'ops:safe_mode:off' }],
        [{ text: 'Operations', callback_data: 'ops:ops' }]
      ])
    } else if (command === 'reset_quota') {
      if (!args.length) await send('Send <code>/reset_quota user@email.com</code> to reset that user’s transcription usage for today (UTC+7).')
      else {
        if (args.length !== 1) throw new Error('Usage: /reset_quota user@email.com')
        const user = await prisma.user.findFirst({ where: { email: { equals: args[0], mode: 'insensitive' } }, select: { id: true, email: true } })
        if (!user) throw new Error('User not found.')
        await resetUserQuota(user.id, actor)
        await send(`Quota reset for <b>${escape(user.email || args[0])}</b>. Saved transcripts are preserved.`)
      }
    } else if (command === 'queue') {
      const jobs = await getAdminJobs()
      await send(jobs.available
        ? `<b>Background jobs</b>\nProcessing: ${jobs.counts.running || 0}\nQueued: ${jobs.counts.queued || 0}\nInterrupted: ${jobs.counts.interrupted || 0}\nFailed (unexpired): ${jobs.counts.failed || 0}\n\nBrowser uploads and streaming requests are not included.`
        : 'Background job data is unavailable. The jobs database migration is required; this does not mean the queue is empty.')
    } else {
      const settings = await getOperationsSettings()
      await send(`<b>Server operations</b>\nModel: ${escape(settings.model)}\nSafe Mode: ${settings.safeMode ? 'ON — new work paused' : 'OFF'}\nChoose a control below.`)
    }
  } catch (error) {
    console.error('[Telegram Operations]', error)
    await send(`Operation could not complete: ${escape(error instanceof Error ? error.message : 'Please try again.')}`)
  }
  return true
}
