import { prisma } from '@/lib/prisma'
import { getAdminJobs } from '@/lib/adminJobs'
import { changeOperation, getOperationsSettings, resetUserQuota } from '@/lib/operations'
import { answerTelegramCallback, isChatIdAdmin, sendTelegramResponse, editTelegramMessage } from '@/lib/telegram'

export function isTelegramOperator(chatId: number | string, senderId: number | string) {
  const allowed = [process.env.TELEGRAM_CHAT_ID, process.env.ADMIN_CHAT_IDS, process.env.TELEGRAM_ADMIN_USER_IDS]
    .flatMap(value => (value || '').split(',')).map(value => value.trim()).filter(value => /^\d+$/.test(value))
  return (isChatIdAdmin(chatId) || String(chatId) === String(senderId)) && allowed.includes(String(senderId))
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const getCambodiaTimeStr = () => {
  const local = new Date(Date.now() + 7 * 3600000)
  return local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const mainMenu = [
  [{ text: '🤖 Switch Model', callback_data: 'ops:model' }, { text: '📦 Live Queue', callback_data: 'ops:queue' }],
  [{ text: '🛡️ Safe Mode', callback_data: 'ops:safe_mode' }, { text: '🔄 Reset Quota', callback_data: 'ops:reset_quota' }],
  [{ text: '📊 Live Stats', callback_data: 'stats' }, { text: '🩺 System Health', callback_data: 'health' }]
]

export async function handleTelegramOperations(input: {
  chatId: number
  senderId: number
  updateId: number
  text?: string
  callback?: { id: string; data?: string; message?: { message_id: number } }
}) {
  const raw = input.callback?.data?.startsWith('ops:')
    ? input.callback.data.slice(4).replace(':', ' ')
    : input.text?.trim() || ''

  const [head, ...args] = raw.split(/\s+/)
  const command = head.replace(/^\//, '').split('@')[0].toLowerCase()
  const isMenu = raw === '⚙️ Operations'

  if (!isMenu && !['ops', 'model', 'safe_mode', 'reset_quota', 'queue'].includes(command)) {
    return false
  }

  if (input.callback) {
    await answerTelegramCallback(input.callback.id)
  }

  if (!isTelegramOperator(input.chatId, input.senderId)) {
    await sendTelegramResponse(input.chatId, '🔒 <b>Admin Access Restricted:</b> This command requires an authorized administrator.', undefined, false)
    return true
  }

  const actor = { id: `telegram:${input.senderId}`, commandId: String(input.updateId) }
  const messageId = input.callback?.message?.message_id

  const respond = async (message: string, keyboard = mainMenu) => {
    if (messageId) {
      const edited = await editTelegramMessage(input.chatId, messageId, message, keyboard)
      if (edited) return true
    }
    return sendTelegramResponse(input.chatId, message, keyboard, false)
  }

  try {
    if (command === 'model') {
      let switchFeedback = ''
      if (args.length) {
        if (args.length !== 1) throw new Error('Usage: /model 2.5-flash, /model 2.5-flash-lite, or /model auto')
        const model = args[0] === 'auto' ? 'auto' : args[0].startsWith('gemini-') ? args[0] : `gemini-${args[0]}`
        await changeOperation('model', model, actor)
        switchFeedback = `✅ <b>Model changed to:</b> <code>${model === 'auto' ? 'Auto-Router' : model}</code>\n\n`
      }

      const settings = await getOperationsSettings()
      const current = settings.model

      const modelMenu = [
        [
          { text: current === 'gemini-2.5-flash' ? '✅ 2.5 Flash (Active)' : '⚡ 2.5 Flash', callback_data: 'ops:model:2.5-flash' },
          { text: current === 'gemini-2.5-flash-lite' ? '✅ 2.5 Flash Lite (Active)' : '⚡ 2.5 Flash Lite', callback_data: 'ops:model:2.5-flash-lite' }
        ],
        [
          { text: current === 'auto' ? '✅ Auto Fleet Router (Active)' : '🔄 Enable Auto Fleet Router', callback_data: 'ops:model:auto' }
        ],
        [
          { text: '🔙 Server Operations', callback_data: 'ops:ops' }
        ]
      ]

      const message = [
        `${switchFeedback}🤖 <b>AI MODEL CONTROLLER</b>`,
        `⏱ <i>As of: ${getCambodiaTimeStr()} (Cambodia Time)</i>`,
        '',
        `<b>Current Model:</b> <code>${escape(current)}</code>`,
        current === 'auto'
          ? '<i>Adaptive Auto-Router dynamically selects the lowest-latency model in the fleet.</i>'
          : `<i>All new transcriptions are strictly pinned to <b>${escape(current)}</b>.</i>`,
        '',
        '💡 <i>Tap an option below to switch on the fly:</i>'
      ].join('\n')

      await respond(message, modelMenu)

    } else if (command === 'safe_mode') {
      let modeFeedback = ''
      if (args.length) {
        if (args.length !== 1 || !['on', 'off'].includes(args[0].toLowerCase())) {
          throw new Error('Usage: /safe_mode on or /safe_mode off')
        }
        const turnOn = args[0].toLowerCase() === 'on'
        await changeOperation('safeMode', turnOn, actor)
        modeFeedback = turnOn
          ? '🛑 <b>Safe Mode ENGAGED!</b> New transcription starts are now paused.\n\n'
          : '🟢 <b>Safe Mode DISENGAGED!</b> Normal transcription processing resumed.\n\n'
      }

      const settings = await getOperationsSettings()
      const isSafe = settings.safeMode

      const safeModeMenu = [
        [
          isSafe
            ? { text: '🟢 Turn OFF Safe Mode (Resume)', callback_data: 'ops:safe_mode:off' }
            : { text: '🛑 Turn ON Safe Mode (Pause New Work)', callback_data: 'ops:safe_mode:on' }
        ],
        [
          { text: '🔙 Server Operations', callback_data: 'ops:ops' }
        ]
      ]

      const message = [
        `${modeFeedback}🛡️ <b>SYSTEM SAFE MODE CONTROLLER</b>`,
        `⏱ <i>As of: ${getCambodiaTimeStr()} (Cambodia Time)</i>`,
        '',
        `<b>Status:</b> ${isSafe ? '🛑 <code>SAFE MODE ACTIVE (PAUSED)</code>' : '🟢 <code>NORMAL (ACTIVE)</code>'}`,
        '',
        '<b>When Safe Mode is ON:</b>',
        '• New transcription starts on web and Telegram are paused.',
        '• In-flight background jobs are allowed to finish safely.',
        '• History, exports, and admin dashboard remain accessible.',
        '',
        '💡 <i>Use during Google API maintenance or outage spikes.</i>'
      ].join('\n')

      await respond(message, safeModeMenu)

    } else if (command === 'reset_quota') {
      if (args.length) {
        if (args.length !== 1) throw new Error('Usage: /reset_quota user@email.com')
        const targetEmail = args[0].trim()
        const user = await prisma.user.findFirst({
          where: { email: { equals: targetEmail, mode: 'insensitive' } },
          select: { id: true, email: true }
        })
        if (!user) throw new Error(`User "${targetEmail}" was not found.`)
        const resetCount = await resetUserQuota(user.id, actor)

        const message = [
          `✅ <b>QUOTA RESET SUCCESSFUL</b>`,
          '',
          `👤 <b>User:</b> <code>${escape(user.email || targetEmail)}</code>`,
          `🔄 <b>Records Cleared:</b> <code>${resetCount} request(s)</code>`,
          `⏱ <b>Date:</b> Today (UTC+7 day cycle)`,
          '',
          `<i>The user can now start new transcriptions immediately. Saved history is preserved.</i>`
        ].join('\n')

        await respond(message, [
          [{ text: '🔄 Reset Another User', callback_data: 'ops:reset_quota' }],
          [{ text: '🔙 Server Operations', callback_data: 'ops:ops' }]
        ])
      } else {
        // Query recent active users who have usage today
        const now = new Date()
        const localDay = new Date(now.getTime() + 7 * 3600000)
        const startOfDay = new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate()) - 7 * 3600000)

        const recentActiveUsers = await prisma.user.findMany({
          where: {
            metrics: {
              some: {
                createdAt: { gte: startOfDay },
                status: 'success'
              }
            }
          },
          select: {
            id: true,
            email: true,
            _count: {
              select: {
                metrics: {
                  where: { createdAt: { gte: startOfDay }, status: 'success' }
                }
              }
            }
          },
          take: 4
        }).catch(() => [])

        const quotaMenu = [
          ...recentActiveUsers
            .filter(u => u.email)
            .map(u => [
              {
                text: `🔄 Reset ${u.email!.split('@')[0]} (${u._count.metrics} runs)`,
                callback_data: `ops:reset_quota ${u.email}`
              }
            ]),
          [{ text: '🔙 Server Operations', callback_data: 'ops:ops' }]
        ]

        const message = [
          `🔄 <b>RESET USER DAILY QUOTA (UTC+7)</b>`,
          `⏱ <i>As of: ${getCambodiaTimeStr()} (Cambodia Time)</i>`,
          '',
          'Tap an active user below to reset their usage for today, or send:',
          '<code>/reset_quota user@email.com</code>',
          '',
          recentActiveUsers.length > 0
            ? '<b>Active Users Today:</b>'
            : '<i>No users have exceeded or recorded usage today yet.</i>'
        ].join('\n')

        await respond(message, quotaMenu)
      }

    } else if (command === 'queue') {
      const jobs = await getAdminJobs()

      if (!jobs.available) {
        await respond([
          `📦 <b>LIVE PROCESSING QUEUE</b>`,
          '',
          `⚠️ <i>Background queue schema is not yet enabled on this database.</i>`,
          `Streaming requests from the browser process directly.`
        ].join('\n'), [
          [{ text: '🔄 Check Again', callback_data: 'ops:queue' }],
          [{ text: '🔙 Server Operations', callback_data: 'ops:ops' }]
        ])
        return true
      }

      const runningCount = jobs.counts.running || 0
      const queuedCount = jobs.counts.queued || 0
      const interruptedCount = jobs.counts.interrupted || 0
      const failedCount = jobs.counts.failed || 0

      const activeItems = jobs.items
        .filter(j => j.status === 'running' || j.status === 'queued')
        .slice(0, 3)

      const activeList = activeItems.length > 0
        ? '\n<b>Current Active Jobs:</b>\n' + activeItems.map(j => {
            const time = j.elapsedSeconds ? `${j.elapsedSeconds}s` : 'just started'
            const user = j.user?.email ? j.user.email.split('@')[0] : 'user'
            return `• <code>${escape(j.fileName.slice(0, 24))}</code> (${j.status}, ${time}, by ${user})`
          }).join('\n')
        : ''

      const isIdle = runningCount === 0 && queuedCount === 0

      const message = [
        `📦 <b>LIVE BACKGROUND PROCESSING QUEUE</b>`,
        `⏱ <i>As of: ${getCambodiaTimeStr()} (Cambodia Time)</i>`,
        '',
        isIdle
          ? '🟢 <b>Status:</b> <code>Idle (No files waiting)</code>'
          : `⚡ <b>Status:</b> <code>${runningCount} processing, ${queuedCount} queued</code>`,
        '',
        `⚡ <b>Processing:</b> <code>${runningCount}</code>`,
        `📋 <b>Queued:</b> <code>${queuedCount}</code>`,
        `⏸ <b>Interrupted:</b> <code>${interruptedCount}</code>`,
        `❌ <b>Failed Today:</b> <code>${failedCount}</code>`,
        activeList,
        '',
        '💡 <i>Tap Refresh Queue below to poll live progress.</i>'
      ].join('\n')

      await respond(message, [
        [{ text: '🔄 Refresh Queue', callback_data: 'ops:queue' }],
        [{ text: '🔙 Server Operations', callback_data: 'ops:ops' }]
      ])

    } else {
      // Default /ops and ⚙️ Operations overview
      const settings = await getOperationsSettings()
      const jobs = await getAdminJobs().catch(() => ({ counts: {} as Record<string, number> }))
      const counts = (jobs.counts || {}) as Record<string, number>
      const runningCount = counts.running || 0
      const queuedCount = counts.queued || 0

      const modelName = settings.model === 'auto' ? 'Auto-Router' : settings.model
      const safeState = settings.safeMode ? '🛑 Active (Paused)' : '🟢 Normal (Active)'
      const queueSummary = runningCount > 0 || queuedCount > 0
        ? `${runningCount} running, ${queuedCount} queued`
        : 'Idle (0 in queue)'

      const message = [
        `🎛️ <b>SERVER OPERATIONS CONTROL CENTER</b>`,
        `⏱ <i>As of: ${getCambodiaTimeStr()} (Cambodia Time)</i>`,
        '',
        `🤖 <b>Active AI Model:</b> <code>${escape(modelName)}</code>`,
        `🛡️ <b>Safe Mode:</b> <code>${safeState}</code>`,
        `📦 <b>Background Queue:</b> <code>${queueSummary}</code>`,
        `⚡ <b>Platform State:</b> <code>All Systems Healthy</code>`,
        '',
        '<i>Choose an interactive operation below:</i>'
      ].join('\n')

      await respond(message, mainMenu)
    }

  } catch (error) {
    console.error('[Telegram Operations]', error)
    const errText = error instanceof Error ? error.message : 'Please try again.'
    await respond([
      `⚠️ <b>Operation Notice:</b>`,
      `<code>${escape(errText)}</code>`,
      '',
      `<i>Tap Operations Menu below to return.</i>`
    ].join('\n'), [
      [{ text: '🔙 Operations Menu', callback_data: 'ops:ops' }]
    ])
  }

  return true
}
