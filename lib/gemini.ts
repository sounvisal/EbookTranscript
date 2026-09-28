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

const PERMISSIVE_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
]

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
        safetySettings: PERMISSIVE_SAFETY_SETTINGS,
        generationConfig: {
          maxOutputTokens: 65536,
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
    safetySettings: PERMISSIVE_SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
      responseMimeType: 'application/json'
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
        'Content-Type': 'application/json',
        'x-goog-api-client': GEMINI_API_CLIENT,
        'x-goog-api-key': cleanKey
      },
      body,
      signal: controller.signal
    })

    if (!res.ok) {
      const responseText = await res.text().catch(() => '')
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
    let buffer = ''
    let accumulatedText = ''
    let lastBlockReason: string | undefined

    const processLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) return
      const jsonStr = trimmed.slice(5).trim()
      if (!jsonStr) return

      try {
        const chunk = JSON.parse(jsonStr) as GeminiGenerateContentResponse
        if (chunk.promptFeedback?.blockReason) {
          lastBlockReason = chunk.promptFeedback.blockReason
        }
        const textParts = chunk.candidates
          ?.flatMap((c) => c.content?.parts || [])
          .map((p) => p.text || '')
          .join('')

        if (textParts) {
          accumulatedText += textParts
          input.onText?.(accumulatedText)
        }
      } catch {
        // Ignore partial JSON or parse errors in individual SSE lines
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        processLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
      }
    }

    if (buffer.trim()) {
      processLine(buffer)
    }

    const trimmedResult = accumulatedText.trim()
    if (trimmedResult) {
      return trimmedResult
    }

    if (lastBlockReason) {
      throw new Error(`Gemini blocked the transcription request: ${lastBlockReason}.`)
    }

    // Return clean empty structure if media contained no discernable speech/text
    return JSON.stringify({ language: 'auto', segments: [] })
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

/**
 * Transcribes an in-memory audio or video buffer using Gemini.
 * Supports inline transmission for files <= 8MB, and automatic
 * File API upload & cleanup for larger files up to 20MB.
 * Features automated key & model failover.
 */
export async function transcribeAudioBufferWithGemini(
  buffer: Buffer,
  mimeType: string,
  displayName: string = 'telegram-audio'
): Promise<{ text: string; language: string; model: string }> {
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(',')
    .map((k) => k.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)

  if (keys.length === 0) {
    throw new Error('No Gemini API keys configured in environment.')
  }

  const models = (process.env.GEMINI_MODELS || 'gemini-3.6-flash,gemini-flash-latest,gemini-2.5-flash,gemini-3.5-flash-lite')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  const prompt = [
    'You are an expert multilingual audio transcription AI specialized in automatic language detection (Khmer / ភាសាខ្មែរ, English, and bilingual speech) and noisy audio extraction.',
    'Listen carefully to the entire audio from the very beginning to the absolute end.',
    '1. AUTOMATIC LANGUAGE DETECTION: Detect the spoken language. If the audio is in Khmer, set language to "Khmer". If in English, set language to "English". If bilingual mixed speech, set language to "Khmer / English".',
    '2. VERBATIM SPEECH ACCURACY: Transcribe every spoken word accurately in the native script. For Khmer speech, output clean Khmer script (អក្សរខ្មែរ) with proper spacing and spelling. For English speech, output English.',
    '3. HIGH-SENSITIVITY: Transcribe verbatim even with background music, sound effects, noise, quiet speech, singing, or fast speaking.',
    'Format strictly as JSON with this exact shape:',
    '{"language":"Khmer","text":"Full continuous transcript text here"}',
    'Only return empty text if the audio is 100% complete dead silence or pure instrumental music with zero human words.'
  ].join(' ')

  let lastError: Error | null = null

  for (const apiKey of keys) {
    for (const modelName of models) {
      try {
        let rawResponseText = ''

        if (buffer.length <= 8 * 1024 * 1024) {
          const host = getGeminiApiHost()
          const cleanKey = apiKey.trim().replace(/["'\r\n]/g, '')
          const url = `https://${host}/${GEMINI_API_VERSION}/models/${modelName}:generateContent`

          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-client': GEMINI_API_CLIENT,
              'x-goog-api-key': cleanKey
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType,
                        data: buffer.toString('base64')
                      }
                    }
                  ]
                }
              ],
              safetySettings: PERMISSIVE_SAFETY_SETTINGS,
              generationConfig: {
                maxOutputTokens: 65536,
                temperature: 0.1,
                responseMimeType: 'application/json'
              }
            })
          })

          const data = await res.json()
          if (!res.ok) {
            throw new Error(data.error?.message || `Gemini HTTP ${res.status}`)
          }
          rawResponseText = extractTextFromGenerateContentResponse(data)
        } else {
          const uploadRes = await uploadGeminiFile(apiKey, { buffer, mimeType, displayName })
          try {
            rawResponseText = await generateGeminiTranscript(apiKey, {
              modelName,
              prompt,
              fileUri: uploadRes.file.uri,
              mimeType
            })
          } finally {
            deleteGeminiFile(apiKey, uploadRes.file.name).catch(() => {})
          }
        }

        let text = ''
        let language = 'auto'
        try {
          const cleanedJson = rawResponseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          const parsed = JSON.parse(cleanedJson)
          text = parsed.text || ''
          language = parsed.language || 'auto'
        } catch {
          text = rawResponseText.trim()
        }

        return { text, language, model: modelName }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.warn(`[Gemini Transcribe] Failover from ${modelName}:`, lastError.message)
      }
    }
  }

  throw lastError || new Error('All Gemini API keys and models failed to transcribe audio.')
}

