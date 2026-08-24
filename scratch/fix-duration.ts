import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function backfill() {
  console.log('--- Backfilling UsageMetrics with duration 0 or null ---')
  const metricsToFix = await prisma.usageMetric.findMany({
    where: {
      OR: [
        { durationSeconds: null },
        { durationSeconds: 0 }
      ]
    }
  })
  console.log(`Found ${metricsToFix.length} usage metrics to update.`)

  for (const m of metricsToFix) {
    const words = m.wordCount || 0
    const duration = words > 0 ? Math.max(1, Math.round(words / 2.3)) : 10
    const inTokens = Math.round(duration * 25 + 150)
    const outTokens = Math.round(words * 1.3)
    const totalTokens = inTokens + outTokens

    await prisma.usageMetric.update({
      where: { id: m.id },
      data: {
        durationSeconds: duration,
        estimatedInputTokens: inTokens,
        estimatedOutputTokens: outTokens,
        totalTokens
      }
    })
  }

  console.log('--- Backfilling Transcripts with duration 0 or null ---')
  const transcriptsToFix = await prisma.transcript.findMany({
    where: {
      OR: [
        { duration: null },
        { duration: 0 }
      ]
    }
  })
  console.log(`Found ${transcriptsToFix.length} transcripts to update.`)

  for (const t of transcriptsToFix) {
    const words = t.wordCount || (t.text ? t.text.split(/\s+/).filter(Boolean).length : 0)
    const duration = words > 0 ? Math.max(1, Math.round(words / 2.3)) : 10
    await prisma.transcript.update({
      where: { id: t.id },
      data: {
        duration,
        wordCount: words
      }
    })
  }

  console.log('All historical records successfully backfilled with valid durations!')
}

backfill()
  .then(() => prisma.$disconnect())
  .catch(console.error)
