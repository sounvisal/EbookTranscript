import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect Admin Dashboard and Admin APIs
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const isApiAdmin = pathname.startsWith('/api/admin')

    const rejectUnauthorized = (status: number, message: string) => {
      if (isApiAdmin) {
        return NextResponse.json({ error: message }, { status })
      }
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // 1. Check for session cookie presence (both HTTPS __Secure- prefix and standard names, including chunks)
    const isSecureCookie =
      req.cookies.has('__Secure-next-auth.session-token') ||
      req.cookies.has('__Secure-next-auth.session-token.0')

    const hasPlainCookie =
      req.cookies.has('next-auth.session-token') ||
      req.cookies.has('next-auth.session-token.0')

    const hasSessionCookie = isSecureCookie || hasPlainCookie

    if (!hasSessionCookie) {
      return rejectUnauthorized(401, 'Authentication required.')
    }

    // 2. Decode and cryptographically verify session token
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      console.error('[Middleware] Critical: NEXTAUTH_SECRET is not configured.')
      return rejectUnauthorized(500, 'Server security configuration error.')
    }

    let token = null
    try {
      // Primary attempt: dynamically match the cookie variant present on the incoming request
      token = await getToken({
        req,
        secret,
        secureCookie: isSecureCookie,
        cookieName: isSecureCookie ? '__Secure-next-auth.session-token' : 'next-auth.session-token'
      })

      // Fallback attempt: if null, attempt alternative cookie format (resolves reverse proxy / protocol mismatches)
      if (!token && hasPlainCookie) {
        token = await getToken({
          req,
          secret,
          secureCookie: false,
          cookieName: 'next-auth.session-token'
        })
      }

      if (!token && isSecureCookie) {
        token = await getToken({
          req,
          secret,
          secureCookie: true,
          cookieName: '__Secure-next-auth.session-token'
        })
      }

      // Final fallback: standard NextAuth resolution
      if (!token) {
        token = await getToken({ req, secret })
      }
    } catch (err) {
      console.warn('[Middleware] Failed to decode session token:', err)
      token = null
    }

    // STRICT FAIL-CLOSED: If token cannot be decoded or is invalid, deny access
    if (!token) {
      return rejectUnauthorized(401, 'Invalid or expired session. Please sign in again.')
    }

    // 3. Verify admin privilege
    const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    const userEmail = (token?.email as string)?.trim().toLowerCase()
    const userRole = (token?.role as string)?.trim().toLowerCase()

    const isAdmin = userRole === 'admin' || (Boolean(userEmail) && adminEmails.includes(userEmail))

    if (!isAdmin) {
      return rejectUnauthorized(403, 'Forbidden. Admin credentials required.')
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
