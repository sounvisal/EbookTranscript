import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const maxDuration = 60

/**
 * Server Upload Proxy for Google Gemini Resumable Uploads.
 * 
 * Bypasses both:
 * 1. Vercel's 4.5MB payload limit (client sends in 3.5MB slices).
 * 2. Google AI Studio's client-side regional IP restrictions (Cambodia, etc.).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const uploadUrl = req.headers.get('x-upload-url')
  const uploadOffset = req.headers.get('x-upload-offset') || '0'
  const uploadCommand = req.headers.get('x-upload-command') || 'upload, finalize'

  if (!uploadUrl || !uploadUrl.startsWith('https://generativelanguage.googleapis.com/')) {
    return NextResponse.json({ error: 'Invalid or missing upload session URL' }, { status: 400 })
  }

  try {
    const chunkBuffer = await req.arrayBuffer()
    const chunkLength = chunkBuffer.byteLength

    const googleRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(chunkLength),
        'X-Goog-Upload-Offset': uploadOffset,
        'X-Goog-Upload-Command': uploadCommand
      },
      body: chunkBuffer
    })

    const responseText = await googleRes.text()

    if (!googleRes.ok) {
      console.warn(`Google upload chunk error (${googleRes.status}):`, responseText)
      return NextResponse.json(
        { error: `Google upload failed (${googleRes.status})` },
        { status: googleRes.status }
      )
    }

    try {
      const data = JSON.parse(responseText)
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ success: true, status: googleRes.status })
    }
  } catch (error) {
    console.error('Upload proxy failure:', error)
    return NextResponse.json(
      { error: 'Failed to proxy media chunk to upload service' },
      { status: 500 }
    )
  }
}
