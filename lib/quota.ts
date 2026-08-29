import { prisma } from '@/lib/prisma'
import { isUserAdmin } from '@/lib/auth'

export const DAILY_FREE_QUOTA_MINUTES = Number(process.env.DAILY_QUOTA_MINUTES) || 60

export type QuotaCheckResult = {
  allowed: boolean
  isAdmin: boolean
  usedMinutes: number
  limitMinutes: number
  remainingMinutes: number
  error?: string
}

/**
 * Checks whether a user has exceeded their daily transcription quota.
 * Calculation is based on UTC+7 (Cambodia Time) day boundary.
 */
export async function checkUserQuota(
  userId: string,
  userEmail?: string | null,
  userRole?: string | null,
  estimatedAdditionalSeconds = 0
): Promise<QuotaCheckResult> {
  const isAdmin = isUserAdmin(userEmail, userRole)
  if (isAdmin) {
    return {
      allowed: true,
      isAdmin: true,
      usedMinutes: 0,
      limitMinutes: Infinity,
      remainingMinutes: Infinity
    }
  }

  // Compute start of day in UTC+7
  const now = new Date()
  const localOffsetHours = 7
  const localNow = new Date(now.getTime() + localOffsetHours * 3600 * 1000)
  const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0))
  const startOfDayUtc = new Date(localStart.getTime() - localOffsetHours * 3600 * 1000)

  // Query usage metrics for this user today
  const metrics = await prisma.usageMetric.findMany({
    where: {
      userId,
      createdAt: { gte: startOfDayUtc },
      status: 'success'
    },
    select: {
      durationSeconds: true
    }
  })

  const totalUsedSeconds = metrics.reduce((acc, m) => acc + (m.durationSeconds || 0), 0)
  const usedMinutes = Math.round((totalUsedSeconds / 60) * 10) / 10
  const limitMinutes = DAILY_FREE_QUOTA_MINUTES
  const remainingMinutes = Math.max(0, Math.round((limitMinutes - usedMinutes) * 10) / 10)

  const additionalMinutes = estimatedAdditionalSeconds / 60
  if (usedMinutes + additionalMinutes > limitMinutes) {
    return {
      allowed: false,
      isAdmin: false,
      usedMinutes,
      limitMinutes,
      remainingMinutes,
      error: `Daily quota limit reached. You have used ${usedMinutes.toFixed(1)} of ${limitMinutes} free minutes today. Your limit will reset at midnight.`
    }
  }

  return {
    allowed: true,
    isAdmin: false,
    usedMinutes,
    limitMinutes,
    remainingMinutes
  }
}
