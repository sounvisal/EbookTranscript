import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GEMINI_UNAVAILABLE, getConfiguredKeys, isGeminiDemoEnabled } from '@/lib/geminiConfig'
import { trackUsage, trackError } from '@/lib/telemetry'
import { classifyTranscriptionError, MODEL_NAME, runTranscriptionPipeline, type ProgressEvent } from '@/lib/transcriptionPipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { checkUserQuota } from '@/lib/quota'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
  }

  const keys = getConfiguredKeys()
  if (!keys.length && !isGeminiDemoEnabled()) {
    return NextResponse.json({ error: GEMINI_UNAVAILABLE }, { status: 503 })
  }
  // Quota enforcement
  const quota = await checkUserQuota(session.user.id, session.user.email, session.user.role)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error || 'Daily usage limit reached.' }, { status: 429 })
  }

  const userId = session.user.id
  const wantsStream = req.headers.get('x-stream') === '1'

  // Streaming mode: emit real progress as newline-delimited JSON events.
  if (wantsStream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: ProgressEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          } catch {
            // Controller already closed; ignore.
          }
        }

        try {
          const result = await runTranscriptionPipeline(req, userId, keys, emit)
          emit({ type: 'result', ...result })
          
          const wordCount = result.text ? result.text.split(/\s+/).filter(Boolean).length : 0
          const maxSegEnd = result.segments?.reduce((max, s) => {
            const end = typeof s.end === 'number' && Number.isFinite(s.end) ? s.end : (typeof s.start === 'number' && Number.isFinite(s.start) ? s.start : 0)
            return Math.max(max, end)
          }, 0) || 0
          const durationSecs = result.duration && result.duration > 0
            ? result.duration
            : (maxSegEnd > 0 ? Math.round(maxSegEnd * 10) / 10 : Math.max(1, Math.round(wordCount / 2.3)))

          // Log privacy-safe metrics for admin dashboard (no transcript text saved)
          try {
            await trackUsage({
              userId: session.user?.id || null,
              model: result.model || MODEL_NAME,
              inputType: 'file',
              durationSeconds: durationSecs,
              wordCount,
              status: 'success',
              keyIndex: result.keyIndex ?? 0,
              latencyMs: result.latencyMs
            })
          } catch (metricErr) {
            console.error('Failed to trackUsage in stream:', metricErr)
          }
        } catch (error) {
          console.error('Transcription error:', error)
          const classified = classifyTranscriptionError(error)
          emit({ type: 'error', error: classified.message, code: classified.code })
          
          // Log error report for admin debugging
          try {
            await trackError({
              userId: session.user?.id || null,
              userEmail: session.user?.email || null,
              endpoint: '/api/transcribe',
              errorMessage: error instanceof Error ? error.message : 'Transcription failed',
              errorType: classified.message,
              model: MODEL_NAME
            })
          } catch (errReport) {
            console.error('Failed to trackError in stream:', errReport)
          }
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
    })
  }

  // Non-streaming mode: keep the original single JSON response for compatibility.
  try {
    const result = await runTranscriptionPipeline(req, userId, keys, () => {})
    const wordCount = result.text ? result.text.split(/\s+/).filter(Boolean).length : 0
    const maxSegEnd = result.segments?.reduce((max, s) => {
      const end = typeof s.end === 'number' && Number.isFinite(s.end) ? s.end : (typeof s.start === 'number' && Number.isFinite(s.start) ? s.start : 0)
      return Math.max(max, end)
    }, 0) || 0
    const durationSecs = result.duration && result.duration > 0
      ? result.duration
      : (maxSegEnd > 0 ? Math.round(maxSegEnd * 10) / 10 : Math.max(1, Math.round(wordCount / 2.3)))

    try {
      await trackUsage({
        userId: session.user?.id || null,
        model: result.model || MODEL_NAME,
        inputType: 'file',
        durationSeconds: durationSecs,
        wordCount,
        status: 'success',
        keyIndex: result.keyIndex ?? 0,
        latencyMs: result.latencyMs
      })
    } catch (metricErr) {
      console.error('Failed to trackUsage in non-stream:', metricErr)
    }
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Transcription error:', error)
    const { message, status } = classifyTranscriptionError(error)
    try {
      await trackError({
        userId: session.user?.id || null,
        userEmail: session.user?.email || null,
        endpoint: '/api/transcribe',
        errorMessage: error instanceof Error ? error.message : 'Transcription failed',
        errorType: message,
        model: MODEL_NAME
      })
    } catch (errReport) {
      console.error('Failed to trackError in non-stream:', errReport)
    }
    return NextResponse.json({ error: message }, { status })
  }
}
