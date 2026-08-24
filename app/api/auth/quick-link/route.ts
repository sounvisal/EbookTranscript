import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Never expose magic links via API in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ url: null }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')?.toLowerCase().trim()
  if (!email) {
    return NextResponse.json({ error: 'Email parameter required' }, { status: 400 })
  }

  const linkData = global.__lastMagicLinks?.[email]
  // Return if requested within the last 10 minutes (development only)
  if (linkData && Date.now() - linkData.time < 10 * 60 * 1000) {
    return NextResponse.json({ url: linkData.url })
  }

  return NextResponse.json({ url: null })
}
