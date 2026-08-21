import { randomBytes } from 'node:crypto'

function getGeminiApiHost(): string {
  const raw = process.env.GEMINI_API_HOST || 'generativelanguage.googleapis.com'
  return raw
    .trim()
    .replace(/^https?:\/\//i, '') // Remove https:// or http://
    .replace(/\/.*$/, '')         // Remove any trailing path or slash
    .replace(/["'\r\n]/g, '')     // Remove quotes or stray newlines
    || 'generativelanguage.googleapis.com'
}

const GEMINI_API_VERSION = 'v1beta'
const GEMINI_API_CLIENT = 'transcript-route/1.0'
const DEFAULT_TIMEOUT_MS = 180000
const UPLOAD_TIMEOUT_MS = getPositiveIntegerEnv('GEMINI_UPLOAD_TIMEOUT_MS', 600000)
const GENERATION_TIMEOUT_MS = getPositiveIntegerEnv('GEMINI_GENERATION_TIMEOUT_MS', 900000)

export const GEMINI_FILE_STATE_ACTIVE = 'ACTIVE'
export const GEMINI_FILE_STATE_FAILED = 'FAILED'

export type GeminiFile = {
  name: string
  displayName?: string
  mimeType: string
  uri: string
  state?: string
  error?: {
    message?: string
  }
  videoMetadata?: {
    videoDuration?: string
  }
}

type GeminiRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  body?: Buffer | string
  timeoutMs?: number
}

type GeminiErrorResponse = {
  error?: {
    message?: string
    details?: unknown
  }
}

type GeminiUploadResponse = {
  file: GeminiFile
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function parseGeminiErrorMessage(responseText: string) {
  if (!responseText) return ''
  try {
    const parsed = JSON.parse(responseText) as GeminiErrorResponse
    if (parsed.error?.message) {
      return parsed.error.message
    }
  } catch {}
  return responseText.trim()
}

async function geminiRequest<T>(
  apiKey: string,
  path: string,
  { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS }: GeminiRequestOptions = {}
): Promise<T> {
  const host = getGeminiApiHost()
  const cleanKey = (apiKey || '').trim().replace(/["'\r\n]/g, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `https://${host}${cleanPath}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'x-goog-api-client': GEMINI_API_CLIENT,
        'x-goog-api-key': cleanKey,
        ...headers
      },
      body: (body as BodyInit) || undefined,
      signal: controller.signal
    })

    const responseText = await res.text()
    if (!res.ok) {
      const errorMessage = parseGeminiErrorMessage(responseText)
      throw new Error(
        errorMessage
          ? `Gemini API request failed (${res.status} ${res.statusText}): ${errorMessage}`
          : `Gemini API request failed (${res.status} ${res.statusText}).`
      )
    }

    if (!responseText) return undefined as T
    return JSON.parse(responseText) as T
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseFileId(fileId: string) {
  return fileId.startsWith('files/') ? fileId.slice('files/'.length) : fileId
}

export async function uploadGeminiFile(apiKey: string, file: { buffer: Buffer; mimeType: string; displayName: string }) {
  const boundary = randomBytes(16).toString('hex')
  const metadata = JSON.stringify({
    file: {
      mimeType: file.mimeType,
      displayName: file.displayName
    }
  })
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    'utf8'
  )
  const closingBoundary = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([preamble, file.buffer, closingBoundary])

  return geminiRequest<GeminiUploadResponse>(apiKey, `/upload/${GEMINI_API_VERSION}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'X-Goog-Upload-Protocol': 'multipart'
    },
    body,
    timeoutMs: UPLOAD_TIMEOUT_MS
  })
}

export async function getGeminiFile(apiKey: string, fileId: string) {
  return geminiRequest<GeminiFile>(apiKey, `/${GEMINI_API_VERSION}/files/${parseFileId(fileId)}`)
}

export async function deleteGeminiFile(apiKey: string, fileId: string) {
  return geminiRequest<void>(apiKey, `/${GEMINI_API_VERSION}/files/${parseFileId(fileId)}`, {
    method: 'DELETE'
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForGeminiFile(apiKey: string, fileName: string, input?: { attempts?: number; intervalMs?: number }) {
  const attempts = input?.attempts || 30
  const intervalMs = input?.intervalMs || 2000
  let mediaFile = await getGeminiFile(apiKey, fileName)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (mediaFile.state === GEMINI_FILE_STATE_ACTIVE) {
      return mediaFile
    }

    if (mediaFile.state === GEMINI_FILE_STATE_FAILED) {
      const remoteError = mediaFile.error?.message || 'Gemini failed to process the uploaded file.'
      throw new Error(remoteError)
    }

    await sleep(intervalMs)
    mediaFile = await getGeminiFile(apiKey, fileName)
  }

  throw new Error('Timed out while preparing file for analysis.')
}

function extractTextFromGenerateContentResponse(response: GeminiGenerateContentResponse) {
  const text = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim()

  if (text) return text

  if (response.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the transcription request: ${response.promptFeedback.blockReason}.`)
  }

  throw new Error('Gemini returned no transcript text.')
}

export async function generateGeminiTranscript(apiKey: string, input: { modelName: string; prompt: string; fileUri: string; mimeType: string }) {
  const response = await geminiRequest<GeminiGenerateContentResponse>(
    apiKey,
    `/${GEMINI_API_VERSION}/models/${input.modelName}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input.prompt },
              {
                fileData: {
                  mimeType: input.mimeType,
                  fileUri: input.fileUri
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.1
        }
      }),
      timeoutMs: GENERATION_TIMEOUT_MS
    }
  )

  return extractTextFromGenerateContentResponse(response)
}

/**
 * Streams a transcription from Gemini using the Server-Sent Events variant of
 * streamGenerateContent with modern fetch.
 */
export async function streamGeminiTranscript(
  apiKey: string,
  input: {
    modelName: string
    prompt: string
    fileUri?: string
    inlineData?: Buffer
    mimeType: string
    onText?: (accumulatedText: string) => void
  }
): Promise<string> {
  if (!input.fileUri && !input.inlineData) {
    throw new Error('Either fileUri or inlineData must be provided.')
  }

  const mediaPart = input.inlineData
    ? { inlineData: { mimeType: input.mimeType, data: input.inlineData.toString('base64') } }
    : { fileData: { mimeType: input.mimeType, fileUri: input.fileUri as string } }

  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: input.prompt }, mediaPart]
      }
    ],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          language: { type: 'STRING' },
          text: { type: 'STRING' },
          segments: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                start: { type: 'NUMBER' },
                end: { type: 'NUMBER' },
                text: { type: 'STRING' }
              },
              required: ['start', 'end', 'text']
            }
          }
        },
        required: ['segments']
      }
    }
  })

  const host = getGeminiApiHost()
  const cleanKey = (apiKey || '').trim().replace(/["'\r\n]/g, '')
  const url = `https://${host}/${GEMINI_API_VERSION}/models/${input.modelName}:streamGenerateContent?alt=sse`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'x-goog-api-client': GEMINI_API_CLIENT,
        'x-goog-api-key': cleanKey
      },
      body,
      signal: controller.signal
    })

    if (!res.ok) {
      const responseText = await res.text()
      const errorMessage = parseGeminiErrorMessage(responseText)
      throw new Error(
        errorMessage
          ? `Gemini API request failed (${res.status} ${res.statusText}): ${errorMessage}`
          : `Gemini API request failed (${res.status} ${res.statusText}).`
      )
    }

    if (!res.body) {
      throw new Error('Gemini returned an empty response body.')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let accumulatedText = ''
    let blockReason = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })

      let newlineIndex: number
      while ((newlineIndex = sseBuffer.indexOf('\n')) !== -1) {
        const line = sseBuffer.slice(0, newlineIndex).trim()
        sseBuffer = sseBuffer.slice(newlineIndex + 1)

        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const parsed = JSON.parse(payload) as GeminiGenerateContentResponse
          const text = parsed.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part) => part.text || '')
            .join('')

          if (text) {
            accumulatedText += text
            input.onText?.(accumulatedText)
          }

          if (parsed.promptFeedback?.blockReason) {
            blockReason = parsed.promptFeedback.blockReason
          }
        } catch {
          // Ignore partial or keep-alive lines
        }
      }
    }

    const finalText = accumulatedText.trim()
    if (finalText) return finalText
    if (blockReason) {
      throw new Error(`Gemini blocked the transcription request: ${blockReason}.`)
    }
    throw new Error('Gemini returned no transcript text.')
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function generateGeminiText(apiKey: string, input: { modelName: string; prompt: string }) {
  const response = await geminiRequest<GeminiGenerateContentResponse>(
    apiKey,
    `/${GEMINI_API_VERSION}/models/${input.modelName}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input.prompt }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 8192
        }
      }),
      timeoutMs: GENERATION_TIMEOUT_MS
    }
  )

  return extractTextFromGenerateContentResponse(response)
}

export async function generateGeminiFileAnalysis(apiKey: string, input: { modelName: string; prompt: string; fileUri: string; mimeType: string }) {
  return generateGeminiTranscript(apiKey, input)
}
