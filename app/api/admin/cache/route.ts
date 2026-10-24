import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAdminAction } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim() || ''

    const totalCount = await prisma.transcriptCache.count()

    const aggregate = await prisma.transcriptCache.aggregate({
      _sum: { duration: true }
    })
    const totalDurationSeconds = aggregate._sum.duration || 0
    const totalAudioMinutes = Math.round(totalDurationSeconds / 60)
    const totalAudioHours = (totalDurationSeconds / 3600).toFixed(1)

    // Rough estimate of tokens and API calls saved by the cache
    const estimatedTokensSaved = Math.round(totalDurationSeconds * 25) // ~25 tokens per second

    const whereClause = query
      ? {
          OR: [
            { audioHash: { contains: query } },
            { text: { contains: query } },
            { language: { contains: query } }
          ]
        }
      : {}

    const entries = await prisma.transcriptCache.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        audioHash: true,
        language: true,
        duration: true,
        createdAt: true,
        text: true
      }
    })

    const sanitizedEntries = entries.map((e) => ({
      id: e.id,
      audioHash: e.audioHash,
      language: e.language || 'auto',
      duration: e.duration || 0,
      createdAt: e.createdAt.toISOString(),
      textPreview: e.text ? e.text.slice(0, 140).trim() + (e.text.length > 140 ? '...' : '') : ''
    }))

    return NextResponse.json({
      success: true,
      stats: {
        totalCached: totalCount,
        totalAudioMinutes,
        totalAudioHours,
        estimatedTokensSaved,
        estimatedRequestsSaved: totalCount
      },
      entries: sanitizedEntries
    })
  } catch (error) {
    console.error('Error fetching transcript cache:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transcript cache.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const clearAll = searchParams.get('clearAll') === 'true'

    if (clearAll) {
      const deleted = await prisma.transcriptCache.deleteMany({})

      await logAdminAction({
        adminId: session.user.id || 'admin',
        adminEmail: session.user.email,
        action: 'CLEAR_TRANSCRIPT_CACHE',
        metadata: {
          itemsDeleted: deleted.count,
          timestamp: new Date().toISOString()
        },
        req
      })

      return NextResponse.json({
        success: true,
        message: `Entire transcript cache cleared (${deleted.count} entries removed).`,
        deletedCount: deleted.count
      })
    }

    if (id) {
      const existing = await prisma.transcriptCache.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Cache entry not found.' }, { status: 404 })
      }

      await prisma.transcriptCache.delete({ where: { id } })

      await logAdminAction({
        adminId: session.user.id || 'admin',
        adminEmail: session.user.email,
        action: 'DELETE_CACHE_ITEM',
        targetId: id,
        metadata: {
          audioHash: existing.audioHash,
          language: existing.language,
          duration: existing.duration
        },
        req
      })

      return NextResponse.json({
        success: true,
        message: 'Cache item evicted successfully.'
      })
    }

    return NextResponse.json({ error: 'Missing id or clearAll parameter.' }, { status: 400 })
  } catch (error) {
    console.error('Error deleting cache item:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete cache.' },
      { status: 500 }
    )
  }
}
