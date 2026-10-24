import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAdminAction } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { userId, action, bonusMinutes } = body

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing userId parameter.' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 })
    }

    const now = new Date()
    const localOffsetHours = 7
    const localNow = new Date(now.getTime() + localOffsetHours * 3600 * 1000)
    const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0))
    const startOfDayUtc = new Date(localStart.getTime() - localOffsetHours * 3600 * 1000)

    if (action === 'reset') {
      // Archive today's successful usage metrics so checkUserQuota sees 0 minutes used today
      const updated = await prisma.usageMetric.updateMany({
        where: {
          userId,
          createdAt: { gte: startOfDayUtc },
          status: 'success'
        },
        data: {
          status: 'quota_reset'
        }
      })

      await logAdminAction({
        adminId: session.user.id || 'admin',
        adminEmail: session.user.email,
        action: 'QUOTA_RESET',
        targetId: userId,
        metadata: {
          targetEmail: targetUser.email,
          recordsReset: updated.count,
          timestamp: new Date().toISOString()
        },
        req
      })

      return NextResponse.json({
        success: true,
        message: `Successfully reset daily quota for ${targetUser.email || targetUser.name || 'user'}.`,
        resetCount: updated.count
      })
    }

    if (action === 'boost') {
      const minutes = typeof bonusMinutes === 'number' && bonusMinutes > 0 ? bonusMinutes : 60
      // Create a compensatory usage metric with negative duration to grant bonus minutes
      await prisma.usageMetric.create({
        data: {
          userId,
          model: 'quota-grant',
          inputType: 'admin_grant',
          durationSeconds: -(minutes * 60),
          status: 'success',
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          totalTokens: 0
        }
      })

      await logAdminAction({
        adminId: session.user.id || 'admin',
        adminEmail: session.user.email,
        action: 'QUOTA_BOOST',
        targetId: userId,
        metadata: {
          targetEmail: targetUser.email,
          bonusMinutes: minutes,
          timestamp: new Date().toISOString()
        },
        req
      })

      return NextResponse.json({
        success: true,
        message: `Granted +${minutes} bonus minutes to ${targetUser.email || targetUser.name || 'user'}.`,
        bonusMinutes: minutes
      })
    }

    return NextResponse.json({ error: 'Invalid action. Must be "reset" or "boost".' }, { status: 400 })
  } catch (error) {
    console.error('Error in admin quota management:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user quota.' },
      { status: 500 }
    )
  }
}
