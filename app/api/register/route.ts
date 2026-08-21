import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { isUserAdmin } from '@/lib/auth'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    }

    const passwordHash = hashPassword(password)
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
      },
    })

    if (existingUser?.passwordHash) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }

    const isAdmin = isUserAdmin(email)

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: name || undefined,
            passwordHash,
            role: isAdmin ? 'admin' : 'user'
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          },
        })
      : await prisma.user.create({
          data: {
            name: name || email.split('@')[0],
            email,
            passwordHash,
            role: isAdmin ? 'admin' : 'user'
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          },
        })

    return NextResponse.json({ user }, { status: existingUser ? 200 : 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
  }
}
