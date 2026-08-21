import { randomBytes } from 'node:crypto'
import { request as httpsRequest } from 'node:https'

function getGeminiApiHost(): string {
  const raw = process.env.GEMINI_API_HOST || 'generativelanguage.googleapis.com'
  return raw
    .trim()
    .replace(/^https?:\/\//i, '') // Remove https:// or http:// if user included it
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
  if (!responseText) {
    return ''
  }

  try {
    const parsed = JSON.parse(responseText) as GeminiErrorResponse
    if (parsed.error?.message) {
      return parsed.error.message
    }
  } catch {
    // Ignore invalid JSON and fall back to the raw response text.
  }

  return responseText.trim()
}

async function geminiRequest<T>(
  apiKey: string,
  path: string,
  { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS }: GeminiRequestOptions = {}
): Promise<T> {
  const requestBody = typeof body === 'string' ? Buffer.from(body) : body
  const cleanKey = (apiKey || '').trim().replace(/["'\r\n]/g, '')
  const host = getGeminiApiHost()

  return new Promise<T>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: host,
        path,
        method,
        headers: {
          Accept: 'application/json',
          'x-goog-api-client': GEMINI_API_CLIENT,
          'x-goog-api-key': cleanKey,
          ...(requestBody ? { 'Content-Length': String(requestBody.byteLength) } : {}),
          ...headers
        }
      },
      (res) => {
        const chunks: Buffer[] = []

        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        res.on('end', () => {
          const responseText = Buffer.concat(chunks).toString('utf8')
          const statusCode = res.statusCode ?? 0
          const statusMessage = res.statusMessage || ''

          if (statusCode < 200 || statusCode >= 300) {
            const errorMessage = parseGeminiErrorMessage(responseText)
            reject(
              new Error(
                errorMessage
                  ? `Gemini API request failed (${statusCode} ${statusMessage}): ${errorMessage}`
                  : `Gemini API request failed (${statusCode} ${statusMessage}).`
              )
            )
            return
          }

          if (!responseText) {
            resolve(undefined as T)
            return
          }

          try {
            resolve(JSON.parse(responseText) as T)
          } catch {
            reject(new Error('Gemini API returned an invalid JSON response.'))
          }
        })
      }
    )

    req.on('error', (error) => {
      reject(new Error(`Network error while calling Gemini: ${error.message}`))
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request to Gemini timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`))
    })

    if (requestBody) {
      req.write(requestBody)
    }

    req.end()
  })
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

  if (text) {
    return text
  }

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
 * streamGenerateContent. The onText callback fires with the accumulated text so
 * far each time a chunk arrives, which the API route uses to compute real
 * progress (latest transcribed timestamp / total media duration).
 */
export async function streamGeminiTranscript(
  apiKey: string,
  input: {
    modelName: string
    prompt: string
    /** Use a Files API URI (for large audio)... */
    fileUri?: string
    /** ...or send the audio inline as base64 (fast path, no upload/polling). */
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
    // Structured output: guarantees valid JSON segments instead of relying on
    // the model to format text correctly.
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          language: { type: 'STRING' },
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
  const requestBody = Buffer.from(body)

  const cleanKey = (apiKey || '').trim().replace(/["'\r\n]/g, '')
  const host = getGeminiApiHost()

  return new Promise<string>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: host,
        path: `/${GEMINI_API_VERSION}/models/${input.modelName}:streamGenerateContent?alt=sse`,
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'x-goog-api-client': GEMINI_API_CLIENT,
          'x-goog-api-key': cleanKey,
          'Content-Length': String(requestBody.byteLength)
        }
      },
      (res) => {
        const statusCode = res.statusCode ?? 0

        if (statusCode < 200 || statusCode >= 300) {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          res.on('end', () => {
            const errorMessage = parseGeminiErrorMessage(Buffer.concat(chunks).toString('utf8'))
            reject(
              new Error(
                errorMessage
                  ? `Gemini API request failed (${statusCode} ${res.statusMessage || ''}): ${errorMessage}`
                  : `Gemini API request failed (${statusCode} ${res.statusMessage || ''}).`
              )
            )
          })
          return
        }

        let sseBuffer = ''
        let accumulatedText = ''
        let blockReason = ''

        res.on('data', (chunk) => {
          sseBuffer += (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)).toString('utf8')

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
              // Ignore partial or non-JSON keep-alive lines.
            }
          }
        })

        res.on('end', () => {
          const finalText = accumulatedText.trim()
          if (finalText) {
            resolve(finalText)
            return
          }
          if (blockReason) {
            reject(new Error(`Gemini blocked the transcription request: ${blockReason}.`))
            return
          }
          reject(new Error('Gemini returned no transcript text.'))
        })
      }
    )

    req.on('error', (error) => {
      reject(new Error(`Network error while calling Gemini: ${error.message}`))
    })

    req.setTimeout(GENERATION_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request to Gemini timed out after ${Math.ceil(GENERATION_TIMEOUT_MS / 1000)} seconds.`))
    })

    req.write(requestBody)
    req.end()
  })
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
