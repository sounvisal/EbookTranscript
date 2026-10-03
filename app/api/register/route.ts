import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { isUserAdmin } from '@/lib/auth'
import { sendTelegramUserAlert } from '@/lib/telegram'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: Request) {
  try {
    // Rate limit: max 5 registration attempts per 15 minutes per IP
    const clientIp = getClientIp(req)
    const rateCheck = checkRateLimit(`register_${clientIp}`, 5, 15 * 60 * 1000)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many registration attempts. Please wait ${rateCheck.retryAfterSeconds}s before trying again.` },
        { status: 429 }
      )
    }

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

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
      },
    })

    // STRICT DEFENSE: Reject if user already exists (whether password or Google OAuth).
    // Prevents hijacking OAuth accounts via credential registration.
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with that email already exists. Please sign in.' },
        { status: 409 }
      )
    }

    const passwordHash = hashPassword(password)
    const isAdmin = isUserAdmin(email)

    const user = await prisma.user.create({
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

    // Non-blocking notification to Telegram admin
    if (!existingUser && user.email) {
      sendTelegramUserAlert({
        email: user.email,
        name: user.name || undefined,
        isNewUser: true,
        provider: 'email/password'
      }).catch((err) => console.error('Registration Telegram alert error:', err))
    }

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
  }
}
