import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkUserQuota } from '@/lib/quota'
import { getConfiguredKeys, GEMINI_UNAVAILABLE } from '@/lib/geminiConfig'
import { geminiKeyFingerprint, readUploadToken } from '@/lib/uploadSession'
import { dispatchTranscription, JOB_LEASE_MS, MAX_JOB_ATTEMPTS } from '@/lib/transcriptionJobs'
import { getDatabaseCapabilities } from '@/lib/databaseCapabilities'
import { getOperationsSettings } from '@/lib/operations'

export const maxDuration = 300

export async function GET(req: Request) {
  try {
    return await getJobs(req)
  } catch (error) {
    console.error('Unable to read transcription jobs:', error)
    return NextResponse.json({ error: 'Unable to load transcription jobs. Please try again.' }, { status: 503 })
  }
}

function migrationRequired() {
  return NextResponse.json({
    code: 'DATABASE_MIGRATION_REQUIRED',
    error: 'Background transcription is not available until the database update is complete.'
  }, { status: 503 })
}

async function getJobs(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await getDatabaseCapabilities()).jobs) return migrationRequired()
  const id = new URL(req.url).searchParams.get('id')
  const where = { userId: session.user.id, expiresAt: { gt: new Date() } }

  if (id) {
    const job = await prisma.transcriptionJob.findFirst({
      where: { ...where, id },
      select: { id: true, fileName: true, status: true, progress: true, error: true, result: true, transcriptId: true, startedAt: true, attempts: true }
    })
    if (!job) return NextResponse.json({ error: 'Transcription job expired or was deleted.' }, { status: 404 })
    if (job.status === 'running' && job.startedAt && Date.now() - job.startedAt.getTime() > JOB_LEASE_MS) {
      return NextResponse.json(
        { ...job, status: job.attempts < MAX_JOB_ATTEMPTS ? 'interrupted' : 'failed' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } })
  }

  const jobs = await prisma.transcriptionJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, fileName: true, status: true }
  })
  return NextResponse.json(jobs, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  try {
    return await startJob(req)
  } catch (error) {
    console.error('Unable to start transcription job:', error)
    return NextResponse.json({ error: 'Unable to start transcription. Please try again.', code: 'JOB_START_FAILED' }, { status: 503 })
  }
}

async function startJob(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const schema = await getDatabaseCapabilities()
  // Completion also writes Transcript.cacheId through Prisma's generated selection.
  // Reject before creating or dispatching anything so a streaming fallback is safe.
  if (!schema.jobs || !schema.scopedCache) return migrationRequired()
  const userId = session.user.id
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid transcription request.' }, { status: 400 })
  if ((await getOperationsSettings()).safeMode && typeof body.id !== 'string') {
    return NextResponse.json({ error: 'New transcriptions are paused by Safe Mode.' }, { status: 503 })
  }

  let job
  if (typeof body.id === 'string') {
    job = await prisma.transcriptionJob.findFirst({
      where: { id: body.id, userId, expiresAt: { gt: new Date() } }
    })
    if (!job) return NextResponse.json({ error: 'Transcription job expired or was deleted.' }, { status: 404 })
  } else {
    const keys = getConfiguredKeys()
    if (!keys.length) return NextResponse.json({ error: GEMINI_UNAVAILABLE }, { status: 503 })
    const upload = readUploadToken(body.uploadToken, userId)
    if (!upload || upload.purpose !== 'transcription'
      || !keys.some((key) => geminiKeyFingerprint(key) === upload.keyFingerprint)) {
      return NextResponse.json({ error: 'Invalid or expired transcription upload.' }, { status: 403 })
    }
    const quota = await checkUserQuota(userId, session.user.email, session.user.role)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 429 })

    const now = new Date()
    await prisma.transcriptionJob.deleteMany({ where: { expiresAt: { lte: now } } })
    job = await prisma.transcriptionJob.upsert({
      where: { id: upload.fileName.slice('files/'.length), userId },
      update: {},
      create: {
        id: upload.fileName.slice('files/'.length),
        userId,
        fileName: upload.displayName,
        mimeType: upload.mimeType,
        keyFingerprint: upload.keyFingerprint,
        duration: typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration > 0 ? body.duration : null,
        options: body.options && typeof body.options === 'object' ? body.options : undefined,
        expiresAt: new Date(Math.max(now.getTime(), upload.expiresAt) + 2 * 60 * 60 * 1000)
      }
    })
  }

  const leaseExpired = job.startedAt && Date.now() - job.startedAt.getTime() > JOB_LEASE_MS
  if (job.attempts < MAX_JOB_ATTEMPTS && (job.status === 'queued' || job.status === 'running' && leaseExpired)) {
    try {
      await dispatchTranscription(job.id, job.attempts + 1)
    } catch {
      return NextResponse.json({ error: 'Could not start transcription. Open Recent jobs to retry.', id: job.id }, { status: 503 })
    }
  }
  return NextResponse.json({ id: job.id }, { status: 202 })
}
