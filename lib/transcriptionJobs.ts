import type { Prisma } from '@prisma/client'
import { after } from 'next/server'
import { send } from '@vercel/queue'
import { prisma } from '@/lib/prisma'
import { deleteGeminiFile } from '@/lib/gemini'
import { getConfiguredKeys } from '@/lib/geminiConfig'
import { geminiKeyFingerprint } from '@/lib/uploadSession'
import { getPlainTranscriptText } from '@/lib/transcript'
import { estimateTokens } from '@/lib/telemetry'
import { classifyTranscriptionError, MODEL_NAME, transcribeUploadedMedia, type TranscribeOptions } from '@/lib/transcriptionPipeline'

const TOPIC = 'transcript-jobs'
export const JOB_LEASE_MS = 310_000
export const MAX_JOB_ATTEMPTS = 2

export async function dispatchTranscription(jobId: string, attempt: number) {
  if (process.env.VERCEL === '1' && process.env.TRANSCRIPTION_QUEUE_ENABLED === 'true') {
    await send(TOPIC, { jobId }, { idempotencyKey: `${jobId}:${attempt}`, retentionSeconds: 7200 })
  } else {
    after(async () => {
      await runTranscriptionJob(jobId, false)
    })
  }
}

export async function runTranscriptionJob(jobId: string, retryBusyDelivery = true) {
  const startedAt = new Date()
  const leaseCutoff = new Date(startedAt.getTime() - JOB_LEASE_MS)
  const claim = await prisma.transcriptionJob.updateMany({
    where: {
      id: jobId,
      expiresAt: { gt: startedAt },
      attempts: { lt: MAX_JOB_ATTEMPTS },
      OR: [{ status: 'queued' }, { status: 'running', startedAt: { lte: leaseCutoff } }]
    },
    data: { status: 'running', attempts: { increment: 1 }, startedAt, progress: 0, error: null }
  })
  if (!claim.count) {
    const current = await prisma.transcriptionJob.findUnique({ where: { id: jobId } })
    if (current?.status === 'running' && current.startedAt && current.expiresAt > startedAt) {
      if (current.startedAt > leaseCutoff) {
        if (retryBusyDelivery) throw new Error('Transcription already running.')
        return
      }
      await prisma.transcriptionJob.updateMany({
        where: { id: jobId, startedAt: current.startedAt, status: 'running' },
        data: { status: 'failed', error: 'Transcription timed out. Please upload the file again.' }
      })
    }
    return
  }

  const job = await prisma.transcriptionJob.findUniqueOrThrow({ where: { id: jobId } })
  const lease = { id: jobId, startedAt, status: 'running' }
  const keys = getConfiguredKeys()
  const keyIndex = keys.findIndex((key) => geminiKeyFingerprint(key) === job.keyFingerprint)
  if (keyIndex < 0) {
    await prisma.transcriptionJob.updateMany({
      where: lease,
      data: { status: 'failed', error: 'The upload expired. Please upload the file again.' }
    })
    return
  }

  let lastProgress = 0
  const providerFile = `files/${jobId}`
  try {
    const result = await transcribeUploadedMedia({
      fileUri: providerFile,
      mimeType: job.mimeType,
      displayName: job.fileName,
      sourceName: job.fileName,
      durationSeconds: job.duration ?? undefined,
      options: (job.options ?? undefined) as TranscribeOptions | undefined,
      keyIndex
    }, keys, (event) => {
      if (event.type !== 'progress' || event.progress < lastProgress + 5) return
      lastProgress = Math.floor(event.progress)
      prisma.transcriptionJob.updateMany({
        where: { ...lease, progress: { lt: lastProgress } },
        data: { progress: lastProgress }
      }).catch(() => {})
    }, true)

    const completed = await prisma.$transaction(async (tx) => {
      // Obtain the write lock before creating history. Deliveries that lost their lease cannot save twice.
      const updated = await tx.transcriptionJob.updateMany({
        where: lease,
        data: { status: 'complete', progress: 100, result: result as Prisma.InputJsonObject }
      })
      if (!updated.count) return false

      const text = getPlainTranscriptText(result.text, result.segments)
      const wordCount = text.split(/\s+/).filter(Boolean).length
      const transcript = await tx.transcript.create({
        data: {
          userId: job.userId,
          text,
          source: job.fileName,
          filename: job.fileName,
          duration: result.duration,
          language: result.language,
          wordCount
        }
      })
      await tx.transcriptionJob.update({ where: { id: jobId }, data: { transcriptId: transcript.id } })
      // Usage is part of the same transaction as completion so redelivery cannot count it twice.
      const tokens = estimateTokens(result.duration, wordCount)
      await tx.usageMetric.create({
        data: {
          userId: job.userId,
          model: result.model || MODEL_NAME,
          inputType: 'file',
          durationSeconds: result.duration,
          wordCount,
          estimatedInputTokens: tokens.inputTokens,
          estimatedOutputTokens: tokens.outputTokens,
          totalTokens: tokens.totalTokens,
          latencyMs: result.latencyMs,
          keyIndex
        }
      })
      return true
    })

    if (completed) await deleteGeminiFile(keys[keyIndex], providerFile).catch(() => {})
  } catch (error) {
    const failure = classifyTranscriptionError(error)
    console.error('Background transcription failed:', failure.message)
    await prisma.transcriptionJob.updateMany({
      where: lease,
      data: { status: 'failed', error: failure.message }
    })
  }
}
