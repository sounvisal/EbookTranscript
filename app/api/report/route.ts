import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  deleteGeminiFile,
  generateGeminiFileAnalysis,
  generateGeminiText,
  uploadGeminiFile,
  waitForGeminiFile
} from '@/lib/gemini'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'

export const runtime = 'nodejs'

const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash']
const MAX_LOCAL_FILE_BYTES = MAX_MEDIA_UPLOAD_BYTES
const TEXT_INPUT_LIMIT = 120000

type ReportMode = 'meeting' | 'summary'

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska'
}

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])

function normalizeMimeType(value?: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() || ''
}

function inferMimeTypeFromName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() || ''
  return MIME_TYPE_BY_EXTENSION[extension] || ''
}

function sanitizeFileName(value: string, fallback: string) {
  const sanitizedValue = value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitizedValue || fallback
}

function isSupportedReportMimeType(mimeType: string) {
  return mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('text/') ||
    DOCUMENT_MIME_TYPES.has(mimeType)
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /429|resource_exhausted|resource exhausted|rate limit|quota/i.test(message)
}

function isModelUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /404|not found|no longer available|not available|does not exist|not supported/i.test(message)
}

function isServiceUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /503|service unavailable|high demand|overloaded/i.test(message)
}

function shouldRotate(error: unknown) {
  return isRateLimitError(error) || isModelUnavailableError(error) || isServiceUnavailableError(error)
}

function isRetryableGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /network error|timed out|socket hang up|econnreset|econnrefused|enotfound|eai_again|etimedout|503|service unavailable|high demand/i.test(message)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getGeminiApiKeys(): string[] {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
  if (multi.length) {
    return multi
  }
  const single = (process.env.GEMINI_API_KEY || '').trim()
  return single && single !== 'AIzaSyYourGoogleApiKeyHere' ? [single] : []
}

function getGeminiModels(): string[] {
  const multi = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
  if (multi.length) {
    return multi
  }
  const single = (process.env.GEMINI_MODEL || '').trim()
  if (single) {
    return [single, ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== single)]
  }
  return DEFAULT_FALLBACK_MODELS
}

async function withGeminiRetry<T>(operation: () => Promise<T>, label: string) {
  const maxAttempts = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error
      }

      const backoffMs = isRateLimitError(error) ? attempt * 5000 : attempt * 1000
      console.warn(`Gemini ${label} failed on attempt ${attempt}. Retrying in ${backoffMs}ms...`, error)
      await sleep(backoffMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Gemini ${label} failed.`)
}

function buildMeetingReportPrompt(transcript: string) {
  return [
    'You are an expert meeting analyst.',
    'Create a clear meeting report from the transcript below.',
    'Do not invent facts, names, owners, or dates. If something is not mentioned, write "Not specified".',
    'Return clean Markdown with these sections:',
    '# Meeting Report',
    '## Executive Summary',
    '## Key Discussion Points',
    '## Decisions',
    '## Action Items',
    '## Open Questions',
    '## Risks And Follow-Ups',
    '',
    'For action items, use bullets with owner and due date when they are mentioned.',
    '',
    'Transcript:',
    transcript
  ].join('\n')
}

function buildDetailedSummaryPrompt() {
  return [
    'Analyze the uploaded file and create a detailed summary report.',
    'The file may be audio, video, a PDF, or a document.',
    'If it is audio or video, focus on the spoken content and any important visible context.',
    'If it is a document, focus on the document structure, claims, facts, and recommendations.',
    'Do not invent details. Mark uncertain or missing information as "Not specified".',
    'Return clean Markdown with these sections:',
    '# Detailed Summary Report',
    '## Executive Summary',
    '## Full Detailed Summary',
    '## Important Facts And Numbers',
    '## People, Teams, Or Organizations Mentioned',
    '## Decisions Or Conclusions',
    '## Action Items Or Recommendations',
    '## Open Questions',
    '## Notable Quotes Or Evidence',
    '',
    'Make the summary comprehensive enough that someone can understand the full content without reading or watching the original.'
  ].join('\n')
}

function buildMockMeetingReport(transcript: string) {
  const sourceText = transcript.trim() || 'No meeting text was captured.'

  return [
    '# Meeting Report',
    '',
    '## Executive Summary',
    'A meeting report will appear here after a valid Gemini API key is configured.',
    '',
    '## Key Discussion Points',
    `- Captured meeting text preview: ${sourceText.slice(0, 220)}${sourceText.length > 220 ? '...' : ''}`,
    '',
    '## Decisions',
    '- Not specified',
    '',
    '## Action Items',
    '- Not specified',
    '',
    '## Open Questions',
    '- Not specified',
    '',
    '## Risks And Follow-Ups',
    '- Add a valid GEMINI_API_KEY in .env to generate a real meeting report.'
  ].join('\n')
}

function buildMockSummaryReport(fileName?: string) {
  return [
    '# Detailed Summary Report',
    '',
    '## Executive Summary',
    `A detailed summary for ${fileName || 'the uploaded file'} will appear here after a valid Gemini API key is configured.`,
    '',
    '## Full Detailed Summary',
    '- The file was accepted by the report workflow.',
    '- Configure GEMINI_API_KEY in .env to analyze full audio, video, PDF, or document content.',
    '',
    '## Important Facts And Numbers',
    '- Not available in mock mode',
    '',
    '## Action Items Or Recommendations',
    '- Add a valid GEMINI_API_KEY and run the summary again.'
  ].join('\n')
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
    }

    const keys = getGeminiApiKeys()
    const models = getGeminiModels()
    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      const mode: ReportMode = body?.mode === 'meeting' ? 'meeting' : 'summary'
      const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : ''

      if (mode !== 'meeting') {
        throw new Error('JSON report requests are only supported for meeting reports.')
      }

      if (!transcript) {
        throw new Error('No meeting text was captured.')
      }

      if (transcript.length > TEXT_INPUT_LIMIT) {
        throw new Error(`Meeting text is too long. Please keep it under ${TEXT_INPUT_LIMIT.toLocaleString()} characters.`)
      }

      if (!keys.length) {
        await sleep(1000)
        return NextResponse.json({
          kind: 'meeting-report',
          text: buildMockMeetingReport(transcript),
          source: 'MEETING LISTENER'
        }, { status: 200 })
      }

      let lastError: unknown
      for (let kIndex = 0; kIndex < keys.length; kIndex += 1) {
        const apiKey = keys[kIndex]
        for (let mIndex = 0; mIndex < models.length; mIndex += 1) {
          const modelName = models[mIndex]
          try {
            const text = await withGeminiRetry(
              () => generateGeminiText(apiKey, {
                modelName,
                prompt: buildMeetingReportPrompt(transcript)
              }),
              `meeting report generation (${modelName})`
            )

            return NextResponse.json({
              kind: 'meeting-report',
              text,
              source: 'MEETING LISTENER'
            }, { status: 200 })
          } catch (error) {
            lastError = error
            if (shouldRotate(error)) {
              if (mIndex < models.length - 1) continue
              if (kIndex < keys.length - 1) break
            }
            throw error
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Failed to generate meeting report.')
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size <= 0) {
      throw new Error('Choose an audio, video, PDF, or document file first.')
    }

    if (file.size > MAX_LOCAL_FILE_BYTES) {
      throw new Error(`Uploads are limited to ${Math.round(MAX_LOCAL_FILE_BYTES / 1024 / 1024)}MB.`)
    }

    const fileName = 'name' in file && typeof file.name === 'string' ? file.name : 'uploaded-file'
    const displayName = sanitizeFileName(fileName, 'uploaded-file')
    const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromName(displayName)

    if (!isSupportedReportMimeType(mimeType)) {
      throw new Error('Supported report uploads are audio, video, PDF, text, Markdown, CSV, JSON, DOC, and DOCX files.')
    }

    if (!keys.length) {
      await sleep(1000)
      return NextResponse.json({
        kind: 'summary',
        text: buildMockSummaryReport(displayName),
        source: displayName
      }, { status: 200 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    let lastError: unknown

    for (let kIndex = 0; kIndex < keys.length; kIndex += 1) {
      const apiKey = keys[kIndex]
      let uploadedFileName = ''

      try {
        const uploadResult = await withGeminiRetry(
          () =>
            uploadGeminiFile(apiKey, {
              buffer: fileBuffer,
              mimeType,
              displayName
            }),
          'report upload'
        )
        uploadedFileName = uploadResult.file.name

        const uploadedFile = await waitForGeminiFile(apiKey, uploadedFileName)

        for (let mIndex = 0; mIndex < models.length; mIndex += 1) {
          const modelName = models[mIndex]
          try {
            const text = await withGeminiRetry(
              () =>
                generateGeminiFileAnalysis(apiKey, {
                  modelName,
                  prompt: buildDetailedSummaryPrompt(),
                  mimeType: uploadedFile.mimeType,
                  fileUri: uploadedFile.uri
                }),
              `summary report generation (${modelName})`
            )

            return NextResponse.json({
              kind: 'summary',
              text,
              source: displayName
            }, { status: 200 })
          } catch (error) {
            lastError = error
            if (shouldRotate(error) && mIndex < models.length - 1) {
              continue
            }
            throw error
          }
        }
      } catch (error) {
        lastError = error
        if (shouldRotate(error) && kIndex < keys.length - 1) {
          continue
        }
        throw error
      } finally {
        if (uploadedFileName) {
          try {
            await deleteGeminiFile(apiKey, uploadedFileName)
          } catch (cleanupError) {
            console.warn('Unable to delete uploaded Gemini report file:', cleanupError)
          }
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to generate summary report.')
  } catch (error) {
    console.error('Report generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate report.'
    let statusCode = 500

    if (/no meeting|choose|supported|too long|limited|json report/i.test(errorMessage)) {
      statusCode = 400
    } else if (/429|resource_exhausted|resource exhausted|rate limit|quota/i.test(errorMessage)) {
      statusCode = 429
    } else if (/503|service unavailable|high demand/i.test(errorMessage)) {
      statusCode = 503
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
