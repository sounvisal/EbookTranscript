import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { getAdminJobs, JOB_FILTERS, retryAdminJob, type JobFilter } from '@/lib/adminJobs'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const query = new URL(req.url).searchParams
  const status = query.get('status') || 'all'
  const page = Number(query.get('page') || 1)
  if (!JOB_FILTERS.includes(status as JobFilter) || !Number.isInteger(page) || page < 1 || page > 10000) return NextResponse.json({ error: 'Invalid job filter.' }, { status: 400 })
  try {
    const id = query.get('id') || undefined
    const jobs = await getAdminJobs({ id, status: status as JobFilter, page, search: (query.get('search') || '').slice(0, 200) })
    const audit = id ? await prisma.adminAuditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, action: true, createdAt: true, adminEmail: true } }) : []
    return NextResponse.json({ ...jobs, audit }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not load jobs. Try again.' }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (typeof body?.id !== 'string' || body.action !== 'retry') return NextResponse.json({ error: 'Invalid job action.' }, { status: 400 })
  try {
    await retryAdminJob(body.id, { id: session.user.id, email: session.user.email })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not retry job.' }, { status: 409 })
  }
}
