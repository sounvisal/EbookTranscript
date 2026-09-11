import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkUserQuota } from '@/lib/quota'

export const dynamic = 'force-dynamic'

// GET: List all users with transcription count, last active date, or inspect single dossier
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('id')

  // Detailed single user dossier
  if (targetUserId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          transcripts: {
            take: 15,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              filename: true,
              duration: true,
              wordCount: true,
              language: true,
              createdAt: true
            }
          },
          errors: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              errorType: true,
              errorMessage: true,
              fileFormat: true,
              createdAt: true
            }
          },
          metrics: {
            orderBy: { createdAt: 'desc' },
            select: {
              durationSeconds: true,
              totalTokens: true,
              status: true,
              createdAt: true
            }
          }
        }
      })

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Check daily quota
      const quota = await checkUserQuota(user.id, user.email, user.role)

      // Compute aggregates
      const totalAudioSeconds = user.metrics.reduce((acc, m) => acc + (m.durationSeconds || 0), 0)
      const totalTokens = user.metrics.reduce((acc, m) => acc + (m.totalTokens || 0), 0)
      const totalJobs = user.metrics.length
      const successfulJobs = user.metrics.filter((m) => m.status === 'success').length
      const personalSuccessRate = totalJobs > 0
        ? ((successfulJobs / totalJobs) * 100).toFixed(1)
        : (user.transcripts.length > 0 ? '100.0' : 'N/A')

      // Last active calculation
      const lastMetricTime = user.metrics[0]?.createdAt?.getTime() || 0
      const lastTranscriptTime = user.transcripts[0]?.createdAt?.getTime() || 0
      const lastActiveMs = Math.max(lastMetricTime, lastTranscriptTime, user.createdAt.getTime())
      const lastActive = new Date(lastActiveMs).toISOString()

      return NextResponse.json({
        dossier: {
          id: user.id,
          name: user.name || 'Unnamed User',
          email: user.email,
          role: user.role || 'user',
          image: user.image,
          createdAt: user.createdAt.toISOString(),
          lastActive,
          quota: {
            usedMinutes: quota.usedMinutes,
            limitMinutes: quota.limitMinutes,
            remainingMinutes: quota.remainingMinutes,
            isAdmin: quota.isAdmin
          },
          stats: {
            totalTranscripts: user.transcripts.length,
            totalAudioMinutes: Math.round(totalAudioSeconds / 60),
            totalTokens,
            successRate: personalSuccessRate
          },
          recentTranscripts: user.transcripts.map((t) => ({
            id: t.id,
            filename: t.filename || 'Upload',
            duration: t.duration || 0,
            wordCount: t.wordCount || 0,
            language: t.language || 'Khmer',
            createdAt: t.createdAt.toISOString()
          })),
          recentErrors: user.errors.map((e) => ({
            id: e.id,
            errorType: e.errorType || 'ERROR',
            errorMessage: e.errorMessage,
            fileFormat: e.fileFormat || 'N/A',
            createdAt: e.createdAt.toISOString()
          }))
        }
      })
    } catch (err) {
      console.error('Error fetching user dossier:', err)
      return NextResponse.json({ error: 'Failed to retrieve user dossier' }, { status: 500 })
    }
  }

  // List all users for directory table
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            transcripts: true
          }
        },
        transcripts: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        },
        metrics: {
          select: {
            durationSeconds: true,
            totalTokens: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const formattedUsers = users.map((u) => {
      const lastTranscript = u.transcripts[0]?.createdAt?.getTime() || 0
      const lastMetric = u.metrics.length > 0
        ? Math.max(...u.metrics.map((m) => m.createdAt.getTime()))
        : 0
      const lastActiveMs = Math.max(lastTranscript, lastMetric, u.createdAt.getTime())

      const totalAudioSeconds = u.metrics.reduce((acc, m) => acc + (m.durationSeconds || 0), 0)
      const totalTokens = u.metrics.reduce((acc, m) => acc + (m.totalTokens || 0), 0)

      return {
        id: u.id,
        name: u.name || 'Unnamed User',
        email: u.email,
        role: u.role || 'user',
        createdAt: u.createdAt.toISOString(),
        lastActive: new Date(lastActiveMs).toISOString(),
        transcriptionCount: u._count.transcripts,
        totalAudioMinutes: Math.round(totalAudioSeconds / 60),
        totalTokens
      }
    })

    return NextResponse.json({ users: formattedUsers })
  } catch (err) {
    console.error('Error fetching admin users:', err)
    return NextResponse.json({ error: 'Failed to retrieve users' }, { status: 500 })
  }
}

// PATCH: Update user role (promote/demote)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { userId, role } = body

    if (!userId || !['admin', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Valid userId and role are required' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true
      }
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (err) {
    console.error('Error updating user role:', err)
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 })
  }
}

// DELETE: Remove a user account
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Protect current admin from accidentally deleting their own account
    if (session.user.id === userId) {
      return NextResponse.json({ error: 'You cannot delete your own active admin account.' }, { status: 400 })
    }

    await prisma.user.delete({
      where: { id: userId }
    })

    return NextResponse.json({ success: true, message: 'User deleted successfully' })
  } catch (err) {
    console.error('Error deleting user:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
