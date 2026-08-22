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
      userComment,
      transcriptSnippet,
      detectedLanguage
    } = body

    const userEmail = session?.user?.email || 'Anonymous User'
    const userId = (session?.user as { id?: string })?.id || null

    const formattedSize = typeof fileSizeBytes === 'number'
      ? `${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB`
      : typeof fileSizeBytes === 'string'
        ? fileSizeBytes
        : undefined

    // 1. Record error in database (skip automated alert because we send the full custom user report alert below)
    await trackError({
      userId,
      userEmail,
      endpoint: '/api/transcribe',
      errorMessage: `[USER REPORTED] ${filename ? `(${filename}) ` : ''}${errorMessage}${userComment ? ` — Note: "${userComment}"` : ''}`,
      errorType: 'USER_REPORTED_ISSUE',
      fileFormat: fileFormat || filename?.split('.').pop() || 'unknown',
      skipTelegramAlert: true,
      metadata: {
        filename,
        fileSizeBytes: formattedSize,
        inputType,
        userComment,
        userEmail,
        transcriptSnippet,
        detectedLanguage,
        reportedAt: new Date().toISOString()
      }
    })

    // 2. Dispatch real-time Telegram Alert directly to Admin with complete context
    await sendTelegramErrorAlert({
      title: 'Direct User Incident Report',
      endpoint: '/api/transcribe (User Report)',
      errorMessage,
      errorType: 'USER_REPORTED_ISSUE',
      fileFormat: filename || fileFormat || 'media',
      userEmail,
      userId,
      userComment,
      metadata: {
        filename,
        fileSizeBytes: formattedSize,
        inputType,
        userComment,
        transcriptSnippet,
        detectedLanguage,
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
