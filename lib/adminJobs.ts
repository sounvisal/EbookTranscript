import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getDatabaseCapabilities } from '@/lib/databaseCapabilities'
import { dispatchTranscription, JOB_LEASE_MS, MAX_JOB_ATTEMPTS } from '@/lib/transcriptionJobs'
import { assertTranscriptionEnabled, type OperationActor } from '@/lib/operations'

export const JOB_FILTERS = ['all', 'running', 'queued', 'failed', 'complete', 'interrupted', 'expired'] as const
export type JobFilter = typeof JOB_FILTERS[number]

function statusWhere(status: JobFilter, now: Date): Prisma.TranscriptionJobWhereInput {
  const cutoff = new Date(now.getTime() - JOB_LEASE_MS)
  switch (status) {
    case 'running': return { status: 'running', startedAt: { gt: cutoff }, expiresAt: { gt: now } }
    case 'interrupted': return { status: 'running', startedAt: { lte: cutoff }, expiresAt: { gt: now } }
    case 'expired': return { status: { not: 'complete' }, expiresAt: { lte: now } }
    case 'queued': case 'failed': return { status, expiresAt: { gt: now } }
    case 'complete': return { status }
    default: return {}
  }
}

export async function getAdminJobs({ status = 'all', search = '', page = 1, id }: { status?: JobFilter; search?: string; page?: number; id?: string } = {}) {
  if (!(await getDatabaseCapabilities()).jobs) return { available: false, items: [], total: 0, counts: {}, page }
  const now = new Date()
  const where: Prisma.TranscriptionJobWhereInput = {
    ...statusWhere(status, now), ...(id ? { id } : {}),
    ...(search ? { OR: [
      { fileName: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { id: { contains: search } }
    ] } : {})
  }
  const [rows, total, counts] = await Promise.all([
    prisma.transcriptionJob.findMany({ where, take: 25, skip: (page - 1) * 25, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, fileName: true, status: true, attempts: true, createdAt: true, startedAt: true, expiresAt: true,
        duration: true, error: true, transcriptId: true, result: true, user: { select: { id: true, email: true } } } }),
    prisma.transcriptionJob.count({ where }),
    Promise.all(JOB_FILTERS.filter(filter => filter !== 'all').map(async filter => [filter, await prisma.transcriptionJob.count({ where: statusWhere(filter, now) })] as const))
  ])
  return {
    available: true, total, page, counts: Object.fromEntries(counts),
    items: rows.map(row => {
      const expired = row.expiresAt <= now && row.status !== 'complete'
      const interrupted = row.status === 'running' && row.startedAt && now.getTime() - row.startedAt.getTime() > JOB_LEASE_MS
      const result = row.result as { model?: string; latencyMs?: number } | null
      return {
        ...row, result: undefined,
        status: expired ? 'expired' : interrupted ? 'interrupted' : row.status,
        model: result?.model || null,
        elapsedSeconds: row.status === 'complete' ? (result?.latencyMs ? Math.round(result.latencyMs / 1000) : null)
          : row.status === 'running' && row.startedAt ? Math.round((now.getTime() - row.startedAt.getTime()) / 1000) : null,
        canRetry: !expired && (row.status === 'queued' || row.status === 'failed' || Boolean(interrupted)) && row.attempts < MAX_JOB_ATTEMPTS
      }
    })
  }
}

export async function retryAdminJob(id: string, actor: OperationActor) {
  await assertTranscriptionEnabled()
  if (!(await getDatabaseCapabilities()).jobs) throw new Error('Background jobs are unavailable on this database.')
  const now = new Date()
  const job = await prisma.transcriptionJob.findUnique({ where: { id } })
  if (!job || job.expiresAt <= now) throw new Error('This upload expired. The user must upload the file again.')
  if (job.status === 'complete') throw new Error('This job is already complete.')
  if (job.status === 'running' && job.startedAt && now.getTime() - job.startedAt.getTime() <= JOB_LEASE_MS) throw new Error('This job is already running.')
  if (job.attempts >= MAX_JOB_ATTEMPTS) throw new Error('Retry limit reached. The user must upload the file again.')
  await prisma.$transaction(async tx => {
    const updated = await tx.transcriptionJob.updateMany({
      where: { id, status: job.status, attempts: job.attempts, startedAt: job.startedAt },
      data: { status: 'queued', error: null }
    })
    if (!updated.count) throw new Error('The job changed. Refresh before retrying.')
    await tx.adminAuditLog.create({ data: { adminId: actor.id, adminEmail: actor.email, action: 'JOB_RETRY', targetId: id,
      metadata: JSON.stringify({ previousStatus: job.status, attempt: job.attempts + 1 }) } })
  })
  await dispatchTranscription(id, job.attempts + 1)
}
