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

    // 3. Detailed Aggregations (Languages, Formats, Input Modes, Hourly Activity)
    const [
      allMetrics,
      todayMetrics,
      recentErrors,
      errorCountTotal,
      errorCountToday,
      recentTranscriptsList,
      languageGroups
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
      prisma.errorLog.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.transcript.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true }
          }
        }
      }),
      prisma.transcript.groupBy({
        by: ['language'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      })
    ])

    // Calculate token aggregations & distributions
    let totalTokensAllTime = 0
    let tokensToday = 0
    let inputTokensToday = 0
    let outputTokensToday = 0
    const modelUsageMap: Record<string, { requests: number; tokens: number; duration: number }> = {}
    const dailyTokenMap: Record<string, { date: string; tokens: number; requests: number; duration: number; errors: number }> = {}
    const inputTypeMap: Record<string, number> = {}
    const formatMap: Record<string, number> = {}
    const hourlyMap: number[] = new Array(24).fill(0)

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
      const metricDuration = (typeof metric.durationSeconds === 'number' && metric.durationSeconds > 0)
        ? metric.durationSeconds
        : Math.max(1, Math.round((metric.wordCount || 0) / 2.3))

      totalTokensAllTime += metric.totalTokens

      // Hourly distribution
      const hour = new Date(metric.createdAt).getHours()
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1

      // Input type distribution
      const inputType = metric.inputType || 'file'
      inputTypeMap[inputType] = (inputTypeMap[inputType] || 0) + 1

      // File format distribution
      const format = metric.fileFormat || 'audio'
      formatMap[format] = (formatMap[format] || 0) + 1

      // Model breakdown
      const m = metric.model || 'gemini-2.5-flash'
      if (!modelUsageMap[m]) {
        modelUsageMap[m] = { requests: 0, tokens: 0, duration: 0 }
      }
      modelUsageMap[m].requests += 1
      modelUsageMap[m].tokens += metric.totalTokens
      modelUsageMap[m].duration += metricDuration

      // Daily breakdown (converted from seconds to minutes)
      const dateKey = metric.createdAt.toISOString().split('T')[0]
      if (dailyTokenMap[dateKey]) {
        dailyTokenMap[dateKey].tokens += metric.totalTokens
        dailyTokenMap[dateKey].requests += 1
        dailyTokenMap[dateKey].duration += metricDuration / 60
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

    // Language breakdown formatting
    const totalWithLang = languageGroups.reduce((sum, g) => sum + g._count.id, 0)
    const languages = languageGroups.map((g) => ({
      language: g.language || 'Auto / Multilingual',
      count: g._count.id,
      percentage: totalWithLang > 0 ? ((g._count.id / totalWithLang) * 100).toFixed(1) : '0'
    }))

    // Input mode breakdown formatting
    const totalInputs = Object.values(inputTypeMap).reduce((a, b) => a + b, 0)
    const inputModes = Object.entries(inputTypeMap).map(([mode, count]) => ({
      mode,
      count,
      percentage: totalInputs > 0 ? ((count / totalInputs) * 100).toFixed(1) : '0'
    }))

    // Format breakdown
    const totalFormats = Object.values(formatMap).reduce((a, b) => a + b, 0)
    const formats = Object.entries(formatMap).map(([format, count]) => ({
      format,
      count,
      percentage: totalFormats > 0 ? ((count / totalFormats) * 100).toFixed(1) : '0'
    }))

    // API Key Fleet discovery
    const configuredKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
      .split(',')
      .map((k) => k.trim().replace(/["'\r\n]/g, ''))
      .filter(Boolean)

    const keyFleet = configuredKeys.map((key, idx) => ({
      index: idx,
      masked: `${key.slice(0, 6)}...${key.slice(-4)}`,
      status: 'active' as const,
      modelPriority: 'gemini-2.5-flash / gemini-3.6-flash'
    }))

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
        estimatedCostTodayUSD: ((inputTokensToday * 0.000000075) + (outputTokensToday * 0.00000030)).toFixed(4)
      },
      models: Object.entries(modelUsageMap).map(([model, data]) => ({
        model,
        requests: data.requests,
        tokens: data.tokens,
        durationMinutes: Math.round(data.duration / 60)
      })),
      dailyStats,
      languages,
      inputModes,
      formats,
      hourlyActivity: hourlyMap,
      keyFleet,
      telegram: {
        configured: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
        chatId: process.env.TELEGRAM_CHAT_ID ? `${process.env.TELEGRAM_CHAT_ID.slice(0, 4)}***` : null
      },
      recentTranscripts: recentTranscriptsList.map((t) => ({
        id: t.id,
        filename: t.filename || t.source || 'Media Upload',
        duration: t.duration || 0,
        wordCount: t.wordCount || 0,
        language: t.language || 'Khmer',
        createdAt: t.createdAt.toISOString(),
        userEmail: t.user?.email || 'Guest / System'
      })),
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
          metadata: err.metadata ? (() => { try { return JSON.parse(err.metadata) } catch { return err.metadata } })() : null,
          userEmail: err.user?.email || 'Anonymous',
          createdAt: err.createdAt.toISOString()
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
