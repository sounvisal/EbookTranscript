import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect Admin Dashboard and Admin APIs
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // 1. Check for session cookie presence (both HTTPS and local development)
    const hasSessionCookie =
      req.cookies.has('__Secure-next-auth.session-token') ||
      req.cookies.has('next-auth.session-token') ||
      req.cookies.has('__Secure-next-auth.session-token.0') ||
      req.cookies.has('next-auth.session-token.0')

    if (!hasSessionCookie) {
      if (pathname.startsWith('/api/admin')) {
        return NextResponse.json(
          { error: 'Forbidden. Admin credentials required.' },
          { status: 403 }
        )
      }
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // 2. Verify token role if NEXTAUTH_SECRET is available
    if (process.env.NEXTAUTH_SECRET) {
      try {
        const token = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET
        })

        if (token) {
          const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)

          const userEmail = (token?.email as string)?.toLowerCase()
          const userRole = (token?.role as string)?.toLowerCase()

          const isAdmin = userRole === 'admin' || (userEmail && adminEmails.includes(userEmail))

          if (!isAdmin) {
            if (pathname.startsWith('/api/admin')) {
              return NextResponse.json(
                { error: 'Forbidden. Admin access required.' },
                { status: 403 }
              )
            }
            return NextResponse.redirect(new URL('/login?callbackUrl=/admin', req.url))
          }
        }
      } catch {
        // Allow request to proceed to route handler where getServerSession will perform strict DB check
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*'
  ]
}

