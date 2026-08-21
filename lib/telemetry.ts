import { prisma } from '@/lib/prisma'

export type TrackUsageParams = {
  userId?: string | null
  model?: string
  inputType: 'file' | 'url' | 'batch' | 'voice'
  fileFormat?: string | null
  fileSizeBytes?: number | null
  durationSeconds?: number | null
  wordCount?: number | null
  status?: 'success' | 'error'
}

export type TrackErrorParams = {
  userId?: string | null
  endpoint: string
  errorMessage: string
  errorType?: string
  model?: string
  fileFormat?: string
  metadata?: Record<string, unknown>
}

/**
 * Calculates estimated tokens used by audio input and text output in Gemini models:
 * - Audio: ~25 tokens per second + ~150 prompt tokens
 * - Output text: ~1.3 tokens per word
 */
export function estimateTokens(durationSeconds: number = 0, wordCount: number = 0) {
  const inputTokens = Math.max(0, Math.round(durationSeconds * 25 + 150))
  const outputTokens = Math.max(0, Math.round(wordCount * 1.3))
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  }
}

/**
 * Logs privacy-safe usage metrics to the database.
 * NEVER logs or exposes the private transcript text.
 */
export async function trackUsage(params: TrackUsageParams) {
  try {
    const { inputTokens, outputTokens, totalTokens } = estimateTokens(
      params.durationSeconds || 0,
      params.wordCount || 0
    )

    await prisma.usageMetric.create({
      data: {
        userId: params.userId || null,
        model: params.model || 'gemini-2.5-flash-lite',
        inputType: params.inputType,
        fileFormat: params.fileFormat || null,
        fileSizeBytes: params.fileSizeBytes || null,
        durationSeconds: params.durationSeconds || null,
        wordCount: params.wordCount || null,
        estimatedInputTokens: inputTokens,
        estimatedOutputTokens: outputTokens,
        totalTokens,
        status: params.status || 'success'
      }
    })
  } catch (error) {
    console.error('Failed to record usage metric:', error)
  }
}

/**
 * Logs system and API errors to the database for debugging and user issue resolution.
 * Strictly avoids saving confidential user transcript text.
 */
export async function trackError(params: TrackErrorParams) {
  try {
    await prisma.errorLog.create({
      data: {
        userId: params.userId || null,
        endpoint: params.endpoint,
        errorMessage: params.errorMessage.slice(0, 1000),
        errorType: params.errorType || 'API_ERROR',
        model: params.model || null,
        fileFormat: params.fileFormat || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null
      }
    })
  } catch (error) {
    console.error('Failed to record error log:', error)
  }
}
