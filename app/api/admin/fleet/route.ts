import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { getFleetStatusSnapshot, probeFleet } from '@/lib/fleet'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/fleet
 * Returns the current live snapshot of model health, routing order, and latencies.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const snapshot = getFleetStatusSnapshot()
    return NextResponse.json({
      success: true,
      snapshot,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to retrieve fleet snapshot' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/fleet
 * Actively triggers a fleet diagnostic probe across all Gemini models,
 * measuring live latency and refreshing the router health table.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const probeResults = await probeFleet()
    return NextResponse.json({
      success: true,
      ...probeResults
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to execute fleet health probe' },
      { status: 500 }
    )
  }
}
