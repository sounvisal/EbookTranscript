import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // STRICT SECURITY: Quick-link token scraping is disabled in production to protect against account takeover.
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_MAGIC_LINK !== 'true') {
    return NextResponse.json({ url: null, error: 'Disabled in production' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')?.toLowerCase().trim()
  if (!email) {
    return NextResponse.json({ error: 'Email parameter required' }, { status: 400 })
  }

  const linkData = global.__lastMagicLinks?.[email]
  // Return only in local development when explicitly enabled
  if (linkData && Date.now() - linkData.time < 10 * 60 * 1000) {
    return NextResponse.json({ url: linkData.url })
  }

  return NextResponse.json({ url: null })
}
