import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { estimateTokens } from '../lib/telemetry'

async function backfill() {
  const startOfOct2Utc = new Date('2026-10-01T17:00:00.000Z') // 2026-10-02 00:00:00 UTC+7

  const transcripts = await prisma.transcript.findMany({
    where: { createdAt: { gte: startOfOct2Utc } },
    orderBy: { createdAt: 'asc' }
  })

  const metrics = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: startOfOct2Utc } }
  })

  console.log(`Transcripts: ${transcripts.length}, Existing Metrics: ${metrics.length}`)

  // For each transcript, find if there is a metric within 15 seconds of its creation
  let createdCount = 0
  for (const t of transcripts) {
    const hasMetric = metrics.some((m) => {
      const diffMs = Math.abs(m.createdAt.getTime() - t.createdAt.getTime())
      return diffMs < 15000 // within 15 seconds
    })

    if (!hasMetric) {
      const durationSeconds = t.duration || Math.max(1, Math.round((t.wordCount || 0) / 2.3))
      const wordCount = t.wordCount || 0
      const { inputTokens, outputTokens, totalTokens } = estimateTokens(durationSeconds, wordCount)
      const ext = (t.filename || t.source || '').split('.').pop()?.toLowerCase() || 'mp4'

      await prisma.usageMetric.create({
        data: {
          userId: t.userId,
          model: 'gemini-3.6-flash',
          inputType: 'file',
          fileFormat: ext,
          durationSeconds,
          wordCount,
          estimatedInputTokens: inputTokens,
          estimatedOutputTokens: outputTokens,
          totalTokens,
          status: 'success',
          createdAt: t.createdAt // keep exact same timestamp
        }
      })
      console.log(`Backfilled metric for transcript ${t.id} (${t.filename})`)
      createdCount++
    }
  }

  const finalMetrics = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: startOfOct2Utc } }
  })
  console.log(`\nDone! Created ${createdCount} missing metrics. Total metrics now: ${finalMetrics.length}`)
}

backfill().then(() => prisma.$disconnect()).catch(console.error)
