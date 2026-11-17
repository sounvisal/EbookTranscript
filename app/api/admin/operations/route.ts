import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { changeOperation, getOperationsSettings } from '@/lib/operations'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await getOperationsSettings(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || !['model', 'safeMode'].includes(body.setting)) return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })
  try {
    return NextResponse.json(await changeOperation(body.setting, body.value, { id: session.user.id, email: session.user.email }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save settings.' }, { status: 400 })
  }
}
