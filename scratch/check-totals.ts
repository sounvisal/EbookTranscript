import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function check() {
  const startOfOct2Utc = new Date('2026-10-01T17:00:00.000Z') // 2026-10-02 00:00:00 UTC+7
  
  const transcripts = await prisma.transcript.findMany({
    where: { createdAt: { gte: startOfOct2Utc } }
  })
  
  const metrics = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: startOfOct2Utc } }
  })

  const transcriptWords = transcripts.reduce((a, b) => a + (b.wordCount || 0), 0)
  const transcriptDuration = transcripts.reduce((a, b) => a + (b.duration || 0), 0)

  const metricWords = metrics.reduce((a, b) => a + (b.wordCount || 0), 0)
  const metricDuration = metrics.reduce((a, b) => a + (b.durationSeconds || 0), 0)
  const metricTokens = metrics.reduce((a, b) => a + (b.totalTokens || 0), 0)

  console.log('TRANSCRIPTS COUNT:', transcripts.length)
  console.log('TRANSCRIPTS TOTAL WORDS:', transcriptWords)
  console.log('TRANSCRIPTS TOTAL DURATION (s):', transcriptDuration, `(${Math.floor(transcriptDuration / 60)}m ${Math.floor(transcriptDuration % 60)}s)`)

  console.log('\nMETRICS COUNT:', metrics.length)
  console.log('METRICS TOTAL WORDS:', metricWords)
  console.log('METRICS TOTAL DURATION (s):', metricDuration, `(${Math.floor(metricDuration / 60)}m ${Math.floor(metricDuration % 60)}s)`)
  console.log('METRICS TOTAL TOKENS:', metricTokens)
}

check().then(() => prisma.$disconnect()).catch(console.error)
