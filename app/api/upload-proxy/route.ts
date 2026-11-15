import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { MAX_INLINE_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { readUploadToken } from '@/lib/uploadSession'

export const maxDuration = 60

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const upload = readUploadToken(req.headers.get('x-upload-token'), session.user.id)
  if (!upload) return NextResponse.json({ error: 'Invalid or expired upload session.' }, { status: 403 })
  if (upload.fileSize > MAX_INLINE_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'This file requires a direct upload to Google.' }, { status: 413 })
  }
  if (Number(req.headers.get('content-length')) !== upload.fileSize) {
    return NextResponse.json({ error: 'Upload size does not match the session.' }, { status: 400 })
  }

  try {
    const file = await req.arrayBuffer()
    if (file.byteLength !== upload.fileSize) {
      return NextResponse.json({ error: 'Upload size does not match the session.' }, { status: 400 })
    }

    const response = await fetch(upload.uploadUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(50_000),
      headers: {
        'Content-Length': String(file.byteLength),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: file
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.file?.name !== upload.fileName) {
      return NextResponse.json({ error: 'Google could not finalize this upload. Please try again.' }, { status: 502 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to upload media to Google.' }, { status: 502 })
  }
}
