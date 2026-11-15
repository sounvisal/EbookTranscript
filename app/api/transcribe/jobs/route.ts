import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkUserQuota } from '@/lib/quota'
import { getConfiguredKeys, GEMINI_UNAVAILABLE } from '@/lib/geminiConfig'
import { geminiKeyFingerprint, readUploadToken } from '@/lib/uploadSession'
import { dispatchTranscription, JOB_LEASE_MS, MAX_JOB_ATTEMPTS } from '@/lib/transcriptionJobs'

export const maxDuration = 300

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid transcription request.' }, { status: 400 })

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
