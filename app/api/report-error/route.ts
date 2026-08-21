import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { trackError } from '@/lib/telemetry'
import { sendTelegramErrorAlert } from '@/lib/telegram'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const body = await req.json().catch(() => ({}))

    const {
      errorMessage = 'User reported transcription error',
      filename,
      fileSizeBytes,
      fileFormat,
      inputType = 'file',
      userComment
    } = body

    const userEmail = session?.user?.email || 'Anonymous User'
    const userId = (session?.user as { id?: string })?.id || null

    // 1. Record error in database
    await trackError({
      userId,
      endpoint: '/api/transcribe',
      errorMessage: `[USER REPORTED] ${filename ? `(${filename}) ` : ''}${errorMessage}`,
      errorType: 'USER_REPORTED_ISSUE',
      fileFormat: fileFormat || filename?.split('.').pop() || 'unknown',
      metadata: {
        filename,
        fileSizeBytes,
        inputType,
        userComment,
        userEmail,
        reportedAt: new Date().toISOString()
      }
    })

    // 2. Dispatch real-time Telegram Alert directly to Admin
    await sendTelegramErrorAlert({
      title: '📢 Direct User Error Report',
      endpoint: '/api/transcribe (User Report)',
      errorMessage: `${errorMessage}${userComment ? `\n\n💬 User Note: "${userComment}"` : ''}`,
      errorType: 'USER_REPORTED_ISSUE',
      fileFormat: filename || fileFormat || 'media',
      userEmail,
      userId,
      metadata: {
        filename,
        fileSizeBytes: fileSizeBytes ? `${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB` : undefined,
        inputType,
        reportedAt: new Date().toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Incident reported successfully to admin.'
    })
  } catch (error) {
    console.error('Failed to submit error report:', error)
    return NextResponse.json(
      { error: 'Failed to submit report. Please try again later.' },
      { status: 500 }
    )
  }
}
