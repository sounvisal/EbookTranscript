import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function run() {
  const now = new Date()
  console.log('Current System Time:', now.toISOString())

  // Phnom Penh time UTC+7
  const startOfOct2Utc = new Date('2026-10-01T17:00:00.000Z') // 2026-10-02 00:00:00 UTC+7
  const endOfOct2Utc = new Date('2026-10-02T16:59:59.999Z')   // 2026-10-02 23:59:59 UTC+7

  // Check last 24 hours
  const past24h = new Date(Date.now() - 24 * 3600 * 1000)

  const transcripts24h = await prisma.transcript.findMany({
    where: { createdAt: { gte: past24h } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, source: true, filename: true, duration: true, wordCount: true, createdAt: true, userId: true }
  })

  console.log(`\n=== Transcripts in last 24h: ${transcripts24h.length} ===`)
  transcripts24h.forEach((t, i) => {
    const phnomPenhTime = new Date(t.createdAt.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`[${i + 1}] ID: ${t.id} | Created: ${t.createdAt.toISOString()} (PP: ${phnomPenhTime}) | File: ${t.filename || t.source} | Duration: ${t.duration}s | Words: ${t.wordCount} | User: ${t.userId}`)
  })

  const metrics24h = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: past24h } },
    orderBy: { createdAt: 'asc' }
  })

  console.log(`\n=== UsageMetrics in last 24h: ${metrics24h.length} ===`)
  metrics24h.forEach((m, i) => {
    const phnomPenhTime = new Date(m.createdAt.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`[${i + 1}] ID: ${m.id} | Created: ${m.createdAt.toISOString()} (PP: ${phnomPenhTime}) | Model: ${m.model} | Status: ${m.status} | User: ${m.userId} | Tokens: ${m.totalTokens}`)
  })

  // How many today in UTC+7?
  const transcriptsToday = await prisma.transcript.findMany({
    where: { createdAt: { gte: startOfOct2Utc } },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`\n=== Transcripts from 2026-10-02 00:00:00 UTC+7 to now: ${transcriptsToday.length} ===`)

  const metricsToday = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: startOfOct2Utc } },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`=== UsageMetrics from 2026-10-02 00:00:00 UTC+7 to now: ${metricsToday.length} ===`)
}

run().then(() => prisma.$disconnect()).catch(console.error)
