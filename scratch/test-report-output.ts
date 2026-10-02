import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function testReport() {
  const now = new Date()
  const localOffsetHours = 7
  const localNow = new Date(now.getTime() + localOffsetHours * 3600 * 1000)
  const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0))
  const startOfDayUtc = new Date(localStart.getTime() - localOffsetHours * 3600 * 1000)

  const startTime = startOfDayUtc
  const endTime = now

  const metrics = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: startTime, lte: endTime } }
  })

  const transcripts = await prisma.transcript.findMany({
    where: { createdAt: { gte: startTime, lte: endTime } }
  })

  const successfulJobs = Math.max(
    transcripts.length,
    metrics.filter((m) => m.status === 'success').length
  )

  const totalWords = Math.max(
    transcripts.reduce((acc, t) => acc + (t.wordCount || 0), 0),
    metrics.reduce((acc, m) => acc + (m.wordCount || 0), 0)
  )

  let totalSeconds = Math.max(
    transcripts.reduce((acc, t) => acc + (t.duration || 0), 0),
    metrics.reduce((acc, m) => acc + (m.durationSeconds || 0), 0)
  )

  const calculatedTokens = Math.round(totalSeconds * 25 + totalWords * 1.3)
  const metricsTokens = metrics.reduce((acc, m) => acc + (m.totalTokens || 0), 0)
  const totalTokens = Math.max(metricsTokens, calculatedTokens)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const durationFormatted = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`

  const modelCounts: Record<string, number> = {}
  metrics.forEach((m) => {
    modelCounts[m.model] = (modelCounts[m.model] || 0) + 1
  })

  console.log('--- RECAP PREVIEW ---')
  console.log(`Total Transcriptions: ${successfulJobs}`)
  console.log(`Audio Processed: ${durationFormatted}`)
  console.log(`Total Words Generated: ${totalWords.toLocaleString()} words`)
  console.log(`Estimated Tokens: ${totalTokens.toLocaleString()} tokens`)
  console.log('Models Used:', modelCounts)
}

testReport().then(() => prisma.$disconnect()).catch(console.error)
