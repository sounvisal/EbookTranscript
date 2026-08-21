import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1. User metrics
    const [totalUsers, newUsersToday, newUsersThisWeek] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } })
    ])

    // 2. Transcripts & Audio stats
    const totalTranscriptsCount = await prisma.transcript.count()
    const transcriptsAggregate = await prisma.transcript.aggregate({
      _sum: { duration: true, wordCount: true }
    })
    const totalDurationSeconds = transcriptsAggregate._sum.duration || 0
    const totalWords = transcriptsAggregate._sum.wordCount || 0

    // 3. Usage & Token metrics
    const [
      allMetrics,
      todayMetrics,
      recentErrors,
      errorCountTotal,
      errorCountToday
    ] = await Promise.all([
      prisma.usageMetric.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.usageMetric.findMany({
        where: { createdAt: { gte: startOfToday } }
      }),
      prisma.errorLog.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true }
          }
        }
      }),
      prisma.errorLog.count(),
      prisma.errorLog.count({ where: { createdAt: { gte: startOfToday } } })
    ])

    // Calculate token aggregations
    let totalTokensAllTime = 0
    let tokensToday = 0
    let inputTokensToday = 0
    let outputTokensToday = 0
    const modelUsageMap: Record<string, { requests: number; tokens: number; duration: number }> = {}
    const dailyTokenMap: Record<string, { date: string; tokens: number; requests: number; duration: number; errors: number }> = {}

    // Group 30-day metrics by day
    for (let i = 29; i >= 0; i--) {
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
      totalTokensAllTime += metric.totalTokens

      // Model breakdown
      const m = metric.model || 'gemini-2.5-flash-lite'
      if (!modelUsageMap[m]) {
        modelUsageMap[m] = { requests: 0, tokens: 0, duration: 0 }
      }
      modelUsageMap[m].requests += 1
      modelUsageMap[m].tokens += metric.totalTokens
      modelUsageMap[m].duration += metric.durationSeconds || 0

      // Daily breakdown
      const dateKey = metric.createdAt.toISOString().split('T')[0]
      if (dailyTokenMap[dateKey]) {
        dailyTokenMap[dateKey].tokens += metric.totalTokens
        dailyTokenMap[dateKey].requests += 1
        dailyTokenMap[dateKey].duration += metric.durationSeconds || 0
      }
    }

    for (const metric of todayMetrics) {
      tokensToday += metric.totalTokens
      inputTokensToday += metric.estimatedInputTokens
      outputTokensToday += metric.estimatedOutputTokens
    }

    // Success rate calculation
    const totalProcessedCount = allMetrics.length
    const successRate = totalProcessedCount + errorCountTotal > 0
      ? ((totalProcessedCount / (totalProcessedCount + errorCountTotal)) * 100).toFixed(1)
      : '100.0'

    // Format daily data array for charts/tables
    const dailyStats = Object.values(dailyTokenMap).sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({
      overview: {
        totalUsers,
        newUsersToday,
        newUsersThisWeek,
        totalTranscripts: totalTranscriptsCount,
        totalAudioMinutes: Math.round(totalDurationSeconds / 60),
        totalAudioHours: (totalDurationSeconds / 3600).toFixed(1),
        totalWords,
        successRate: `${successRate}%`
      },
      tokens: {
        tokensToday,
        inputTokensToday,
        outputTokensToday,
        totalTokensThirtyDays: totalTokensAllTime,
        // Approximate cost estimate based on Gemini Flash-Lite ($0.075 per 1M input, $0.30 per 1M output)
        estimatedCostTodayUSD: ((inputTokensToday * 0.000000075) + (outputTokensToday * 0.00000030)).toFixed(4)
      },
      models: Object.entries(modelUsageMap).map(([model, data]) => ({
        model,
        requests: data.requests,
        tokens: data.tokens,
        durationMinutes: Math.round(data.duration / 60)
      })),
      dailyStats,
      errors: {
        totalErrors: errorCountTotal,
        errorsToday: errorCountToday,
        recent: recentErrors.map((err) => ({
          id: err.id,
          endpoint: err.endpoint,
          errorMessage: err.errorMessage,
          errorType: err.errorType || 'ERROR',
          model: err.model || 'Unknown',
          fileFormat: err.fileFormat || 'N/A',
          userEmail: err.user?.email ? `${err.user.email.slice(0, 3)}***@${err.user.email.split('@')[1] || ''}` : 'Anonymous',
          createdAt: err.createdAt
        }))
      }
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    await prisma.errorLog.deleteMany({})
    return NextResponse.json({ success: true, message: 'Error logs cleared' })
  } catch (error) {
    console.error('Clear error logs error:', error)
    return NextResponse.json({ error: 'Failed to clear error logs' }, { status: 500 })
  }
}
