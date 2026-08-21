import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET: List all users with transcription count
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isUserAdmin(session.user.email, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

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
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const formattedUsers = users.map((u) => ({
      id: u.id,
      name: u.name || 'Unnamed User',
      email: u.email,
      role: u.role || 'user',
      createdAt: u.createdAt.toISOString(),
      transcriptionCount: u._count.transcripts
    }))

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
