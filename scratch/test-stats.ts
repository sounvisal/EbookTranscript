import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function testStats() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const allMetrics = await prisma.usageMetric.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: 'desc' }
  })

  const dailyTokenMap: Record<string, { date: string; tokens: number; requests: number; duration: number; errors: number }> = {}

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dateKey = d.toISOString().split('T')[0]
    dailyTokenMap[dateKey] = {
      date: dateKey,
      tokens: 0,
      requests: 0,
      duration: 0,
      errors: 0
    }
  }

  for (const metric of allMetrics) {
    const metricDuration = (typeof metric.durationSeconds === 'number' && metric.durationSeconds > 0)
      ? metric.durationSeconds
      : Math.max(1, Math.round((metric.wordCount || 0) / 2.3))

    const dateKey = metric.createdAt.toISOString().split('T')[0]
    if (dailyTokenMap[dateKey]) {
      dailyTokenMap[dateKey].tokens += metric.totalTokens
      dailyTokenMap[dateKey].requests += 1
      dailyTokenMap[dateKey].duration += metricDuration / 60
    }
  }

  const dailyStats = Object.values(dailyTokenMap).sort((a, b) => b.date.localeCompare(a.date))
  console.log('--- Daily Stats (Last 14 Days) ---')
  console.table(dailyStats.slice(0, 7).map(row => ({
    Date: row.date,
    Requests: row.requests,
    'Duration (Min)': `${row.duration.toFixed(1)} m`,
    'Total Tokens': row.tokens,
    Errors: row.errors
  })))
}

testStats().then(() => prisma.$disconnect()).catch(console.error)
