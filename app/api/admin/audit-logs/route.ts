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
    const { searchParams } = new URL(req.url)
    const actionFilter = searchParams.get('action') || 'all'
    const query = searchParams.get('q')?.trim() || ''

    const where: any = {}

    if (actionFilter !== 'all') {
      where.action = actionFilter
    }

    if (query) {
      where.OR = [
        { adminEmail: { contains: query } },
        { action: { contains: query } },
        { targetId: { contains: query } },
        { ipAddress: { contains: query } }
      ]
    }

    const [totalLogs, logs] = await Promise.all([
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    ])

    const formatted = logs.map((log) => {
      let parsedMetadata: any = null
      if (log.metadata) {
        try {
          parsedMetadata = JSON.parse(log.metadata)
        } catch {
          parsedMetadata = log.metadata
        }
      }

      return {
        id: log.id,
        adminId: log.adminId,
        adminEmail: log.adminEmail || 'Unknown Admin',
        action: log.action,
        targetId: log.targetId,
        metadata: parsedMetadata,
        ipAddress: log.ipAddress || 'Internal / Cloud',
        createdAt: log.createdAt.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      totalCount: totalLogs,
      logs: formatted
    })
  } catch (error) {
    console.error('Error fetching admin audit logs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch audit logs.' },
      { status: 500 }
    )
  }
}
