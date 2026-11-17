import { prisma } from '@/lib/prisma'
import { getConfiguredModels } from '@/lib/geminiConfig'

export const OPERATION_MODELS = ['auto', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const
export type OperationModel = typeof OPERATION_MODELS[number]
export type OperationActor = { id: string; email?: string | null; commandId?: string }

let cachedSettings: { data: { model: OperationModel; safeMode: boolean; configuredModels: string[]; updatedAt: string | null }; expiresAt: number } | null = null

export function invalidateOperationsSettingsCache() {
  cachedSettings = null
}

// Each setting is an audited, durable event in the existing administration log.
// This also works on deployments that have not added the background-job tables.
export async function getOperationsSettings() {
  const now = Date.now()
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.data
  }

  const [model, safeMode] = await Promise.all(['transcription.model', 'transcription.safe_mode'].map(targetId =>
    prisma.adminAuditLog.findFirst({ where: { action: 'SYSTEM_SETTING', targetId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  ))
  const parse = (value?: string | null) => {
    try { return value ? JSON.parse(value).value : undefined } catch { return undefined }
  }
  const configured = parse(model?.metadata)
  const data = {
    model: (OPERATION_MODELS.includes(configured) ? configured : 'auto') as OperationModel,
    safeMode: parse(safeMode?.metadata) === true,
    configuredModels: getConfiguredModels(),
    updatedAt: [model?.createdAt, safeMode?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]?.toISOString() || null
  }

  cachedSettings = { data, expiresAt: now + 5000 }
  return data
}

export class SafeModeError extends Error {
  constructor() { super('Transcription is temporarily paused by the administrator. Please try again later.') }
}

export async function assertTranscriptionEnabled() {
  if ((await getOperationsSettings()).safeMode) throw new SafeModeError()
}

export async function changeOperation(setting: 'model' | 'safeMode', value: unknown, actor: OperationActor) {
  if (setting === 'model' && !OPERATION_MODELS.includes(value as OperationModel)) throw new Error('Choose auto, 2.5-flash, or 2.5-flash-lite.')
  if (setting === 'safeMode' && typeof value !== 'boolean') throw new Error('Safe Mode must be on or off.')
  const id = actor.commandId ? `telegram-ops:${actor.commandId}` : undefined
  try {
    await prisma.adminAuditLog.create({ data: {
      id, adminId: actor.id, adminEmail: actor.email, action: 'SYSTEM_SETTING',
      targetId: setting === 'model' ? 'transcription.model' : 'transcription.safe_mode',
      metadata: JSON.stringify({ value, source: actor.commandId ? 'telegram' : 'dashboard' })
    } })
  } catch (error) {
    if (!id || !await prisma.adminAuditLog.findUnique({ where: { id }, select: { id: true } })) throw error
  }
  invalidateOperationsSettingsCache()
  return getOperationsSettings()
}

export async function resetUserQuota(userId: string, actor: OperationActor) {
  const now = new Date()
  const localDay = new Date(now.getTime() + 7 * 3600000)
  const start = new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate()) - 7 * 3600000)
  const id = actor.commandId ? `telegram-ops:${actor.commandId}` : undefined
  try {
    return await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
      if (!target) throw new Error('User not found.')
      const audit = await tx.adminAuditLog.create({ data: {
        id, adminId: actor.id, adminEmail: actor.email, action: 'QUOTA_RESET', targetId: userId,
        metadata: JSON.stringify({ targetEmail: target.email })
      } })
      const updated = await tx.usageMetric.updateMany({
        where: { userId, createdAt: { gte: start }, status: 'success' }, data: { status: 'quota_reset' }
      })
      await tx.adminAuditLog.update({ where: { id: audit.id }, data: {
        metadata: JSON.stringify({ targetEmail: target.email, recordsReset: updated.count })
      } })
      return updated.count
    })
  } catch (error) {
    if (id && await prisma.adminAuditLog.findUnique({ where: { id }, select: { id: true } })) return 0
    throw error
  }
}
