import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import ytdl from '@distube/ytdl-core'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extractSpeechAudio, splitAudioIntoChunks } from '@/lib/audio'
import { prisma } from '@/lib/prisma'
import {
  deleteGeminiFile,
  GEMINI_FILE_STATE_ACTIVE,
  GEMINI_FILE_STATE_FAILED,
  getGeminiFile,
  streamGeminiTranscript,
  uploadGeminiFile
} from '@/lib/gemini'
import {
  extractTimestampedSegments,
  getPlainTranscriptText,
  normalizeTranscriptSegments,
  parseStructuredTranscriptText
} from '@/lib/transcript'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { trackUsage, trackError } from '@/lib/telemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_LOCAL_FILE_BYTES = MAX_MEDIA_UPLOAD_BYTES
const MAX_REMOTE_FILE_BYTES = MAX_MEDIA_UPLOAD_BYTES
// Flash-Lite has the highest free-tier limits (15 RPM / 1000 RPD vs Flash's
// 10 RPM / 250 RPD), which is why it's the default. Override with GEMINI_MODEL.
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
const DEFAULT_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.5-flash-lite']

// Audio at or below this size is sent inline in the transcribe request.
// Video files or audio larger than 8MB always use the Files API (supports up to 2GB).
const INLINE_AUDIO_LIMIT_BYTES = 8 * 1024 * 1024

// Recordings longer than this are split into parallel chunks so long media
// finishes far faster than transcribing it in one sequential pass and ensures
// full verbatim transcription without model token truncation.
const CHUNK_THRESHOLD_SECONDS = 150
const CHUNK_DURATION_SECONDS = 120
const MAX_PARALLEL_CHUNKS = 3
const OCTET_STREAM_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream'])
const SOCIAL_MEDIA_HOSTS = [
  'facebook.com',
  'fb.watch',
  'instagram.com',
  'soundcloud.com',
  'tiktok.com',
  'twitter.com',
  'vimeo.com',
  'x.com',
  'youtube.com',
  'youtu.be'
]

type MediaInput = {
  buffer?: Buffer
  fileUri?: string
  mimeType: string
  displayName: string
  sourceName: string
}

type GeminiTranscriptPayload = {
  text?: unknown
  transcript?: unknown
  language?: unknown
  segments?: Array<{
    start?: unknown
    end?: unknown
    text?: unknown
  }>
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
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

function normalizeMimeType(value?: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() || ''
}

function isSupportedMimeType(mimeType: string) {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/')
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

function hostnameMatches(hostname: string, candidate: string) {
  return hostname === candidate || hostname.endsWith(`.${candidate}`)
}

function isYouTubeHostname(hostname: string) {
  return hostnameMatches(hostname, 'youtube.com') || hostname === 'youtu.be'
}

function isSocialMediaHostname(hostname: string) {
  return SOCIAL_MEDIA_HOSTS.some((candidate) => hostnameMatches(hostname, candidate))
}

function getHtmlPageErrorMessage(hostname: string) {
  if (isYouTubeHostname(hostname)) {
    return 'Unable to extract media from this YouTube link right now. Try another public video, upload the file directly, or paste a direct audio/video URL.'
  }

  if (isSocialMediaHostname(hostname)) {
    return 'This link resolves to a web page instead of a media file. Upload the audio or video file directly, or paste a direct media file URL.'
  }

  return 'The link must point directly to an audio or video file, not a web page.'
}

function inferMimeTypeFromYouTubeFormat(format: { mimeType?: string; container?: string }) {
  const normalizedMimeType = normalizeMimeType(format.mimeType)
  if (isSupportedMimeType(normalizedMimeType)) {
    return normalizedMimeType
  }

  if (format.container) {
    return inferMimeTypeFromName(`media.${format.container}`)
  }

  return ''
}

function isBlockedHostname(hostname: string) {
  const normalizedHost = hostname.trim().toLowerCase()
  const ipVersion = isIP(normalizedHost)

  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.local')) {
    return true
  }

  if (ipVersion === 4) {
    const [firstOctet, secondOctet] = normalizedHost.split('.').map(Number)

    return (
      firstOctet === 10 ||
      firstOctet === 127 ||
      firstOctet === 0 ||
      (firstOctet === 169 && secondOctet === 254) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      (firstOctet === 192 && secondOctet === 168)
    )
  }

  if (ipVersion === 6) {
    return (
      normalizedHost === '::1' ||
      normalizedHost.startsWith('fc') ||
      normalizedHost.startsWith('fd') ||
      normalizedHost.startsWith('fe80')
    )
  }

  return normalizedHost.endsWith('.internal')
}

function parseDurationSeconds(durationText?: string) {
  if (!durationText) return 0

  const numericValue = Number.parseFloat(durationText.replace(/s$/i, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

// Scans partial/streaming transcript JSON for the highest "end" timestamp seen
// so far. Combined with the total media duration this yields real progress.
function extractLatestEndSeconds(text: string) {
  let latest = 0
  const pattern = /"end"\s*:\s*"?(\d+(?:\.\d+)?)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > latest) {
      latest = value
    }
  }

  return latest
}

function parseGeminiTranscriptResponse(responseText: string) {
  const structured = parseStructuredTranscriptText(responseText)

  if (structured) {
    const text = structured.text || getPlainTranscriptText('', structured.segments)
    const language = structured.language || 'auto'
    return { text, language, segments: structured.segments }
  }

  const segments = extractTimestampedSegments(responseText)

  return {
    text: getPlainTranscriptText(responseText, segments),
    language: 'auto',
    segments
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readResponseWithinLimit(response: Response, maxBytes: number) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
    }

    chunks.push(Buffer.from(value))
  }

  return Buffer.concat(chunks)
}

async function readNodeStreamWithinLimit(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = []
  let totalBytes = 0

  try {
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += bufferChunk.byteLength

      if (totalBytes > maxBytes) {
        stream.destroy()
        throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
      }

      chunks.push(bufferChunk)
    }
  } catch (error) {
    stream.destroy()
    throw error
  }

  return Buffer.concat(chunks)
}

async function getMediaInputFromYouTubeUrl(urlValue: string): Promise<MediaInput> {
  let info: Awaited<ReturnType<typeof ytdl.getInfo>>

  try {
    info = await ytdl.getInfo(urlValue)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown YouTube extraction error.'
    console.warn('YouTube metadata lookup failed:', message)
    throw new Error('Unable to extract media from this YouTube link right now. Try another public video, upload the file directly, or paste a direct audio/video URL.')
  }

  let audioFormat: ReturnType<typeof ytdl.chooseFormat> | undefined

  try {
    audioFormat = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' })
  } catch {
    audioFormat = info.formats.find((format) => format.audioCodec && !format.videoCodec)
  }

  if (!audioFormat) {
    throw new Error('Unable to find a downloadable audio stream for this YouTube link.')
  }

  const mimeType = inferMimeTypeFromYouTubeFormat(audioFormat) || 'audio/mpeg'
  const container = audioFormat.container || mimeType.split('/')[1] || 'mp3'
  const sourceBaseName = sanitizeFileName(info.videoDetails.title || 'youtube-media', 'youtube-media')
  const displayName = `${sourceBaseName}.${container}`
  const stream = ytdl.downloadFromInfo(info, {
    filter: 'audioonly',
    quality: audioFormat.itag
  })
  const buffer = await readNodeStreamWithinLimit(stream, MAX_REMOTE_FILE_BYTES)

  return {
    buffer,
    mimeType,
    displayName,
    sourceName: sourceBaseName
  }
}

async function getMediaInputFromUrl(urlValue: string): Promise<MediaInput> {
  let url: URL

  try {
    url = new URL(urlValue)
  } catch {
    throw new Error('Please provide a valid media URL.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS media URLs are supported.')
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('That media host is not allowed.')
  }

  const normalizedHostname = url.hostname.trim().toLowerCase()

  if (isYouTubeHostname(normalizedHostname)) {
    return getMediaInputFromYouTubeUrl(urlValue)
  }

  const fetchUrl = url.toString()
  const fetchHeaders: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  let sourceName = sanitizeFileName(decodeURIComponent(url.pathname.split('/').pop() || 'remote-media'), 'remote-media')

  const response = await fetch(fetchUrl, { redirect: 'follow', headers: fetchHeaders })
  if (!response.ok) {
    throw new Error(`Unable to fetch media from link (${response.status}).`)
  }

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_REMOTE_FILE_BYTES) {
    throw new Error(`Remote media exceeds the ${Math.round(MAX_REMOTE_FILE_BYTES / 1024 / 1024)}MB limit.`)
  }

  const responseMimeType = normalizeMimeType(response.headers.get('content-type'))
  let inferredMimeType = isSupportedMimeType(responseMimeType)
    ? responseMimeType
    : inferMimeTypeFromName(sourceName)

  if (responseMimeType.includes('text/html')) {
    throw new Error(getHtmlPageErrorMessage(normalizedHostname))
  }

  if (responseMimeType && !isSupportedMimeType(responseMimeType) && !OCTET_STREAM_MIME_TYPES.has(responseMimeType)) {
    throw new Error(`The link returned ${responseMimeType}, not an audio or video file.`)
  }

  if (!isSupportedMimeType(inferredMimeType)) {
    inferredMimeType = 'audio/mpeg'
  }

  const buffer = await readResponseWithinLimit(response, MAX_REMOTE_FILE_BYTES)

  return {
    buffer,
    mimeType: inferredMimeType,
    displayName: sourceName,
    sourceName: sourceName || url.hostname
  }
}

async function getMediaInputFromRequest(req: Request): Promise<MediaInput> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    // Direct Gemini File URI support (for files uploaded directly from browser to Gemini)
    if (typeof body?.fileUri === 'string' && body.fileUri.trim()) {
      return {
        fileUri: body.fileUri.trim(),
        mimeType: body.mimeType || 'video/mp4',
        displayName: body.displayName || 'uploaded-media',
        sourceName: body.displayName || 'uploaded-media'
      }
    }
    const urlValue = typeof body?.url === 'string' ? body.url.trim() : ''

    if (!urlValue) {
      throw new Error('No media provided.')
    }

    return getMediaInputFromUrl(urlValue)
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const urlValue = typeof formData.get('url') === 'string' ? String(formData.get('url')).trim() : ''

  if (file && file.size > 0) {
    const fileName = 'name' in file && typeof file.name === 'string' ? file.name : 'uploaded-media'
    const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromName(fileName)

    if (!isSupportedMimeType(mimeType)) {
      throw new Error('Only audio and video files are supported.')
    }

    if (file.size > MAX_LOCAL_FILE_BYTES) {
      throw new Error(`Local uploads are limited to ${Math.round(MAX_LOCAL_FILE_BYTES / 1024 / 1024)}MB.`)
    }

    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType,
      displayName: fileName,
      sourceName: fileName
    }
  }

  if (urlValue) {
    return getMediaInputFromUrl(urlValue)
  }

  throw new Error('No file or media URL provided.')
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /429|resource_exhausted|resource exhausted|rate limit|quota/i.test(message)
}

// A model that this account/key can't use (e.g. "no longer available to new
// users", not found). We skip to the next model when this happens.
function isModelUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /404|not found|no longer available|not available|does not exist|not supported/i.test(message)
}

function isServiceUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /503|service unavailable|high demand|overloaded/i.test(message)
}

// Should we move on to the next model/key? True for rate limits, high demand 503s,
// and for models this key simply cannot use.
function shouldRotate(error: unknown) {
  return isRateLimitError(error) || isModelUnavailableError(error) || isServiceUnavailableError(error)
}

function isRetryableGeminiError(error: unknown) {
  // Rate-limit errors are intentionally NOT retried here — they bubble up so the
  // caller can rotate to a different API key instead of waiting on a busy one.
  const message = error instanceof Error ? error.message : String(error)
  return /network error|timed out|socket hang up|econnreset|econnrefused|enotfound|eai_again|etimedout|503|service unavailable|high demand/i.test(message)
}

async function withGeminiRetry<T>(operation: () => Promise<T>, label: string) {
  const maxAttempts = 4
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error
      }

      // Rate-limit (429) errors need a longer, growing wait so the per-minute
      // quota has time to refill; other transient errors retry quickly.
      const backoffMs = isRateLimitError(error) ? attempt * 5000 : attempt * 1000
      console.warn(`Gemini ${label} failed on attempt ${attempt}. Retrying in ${backoffMs}ms...`, error)
      await sleep(backoffMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Gemini ${label} failed.`)
}

async function waitForUploadedFile(apiKey: string, fileName: string) {
  let mediaFile = await getGeminiFile(apiKey, fileName)

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (mediaFile.state === GEMINI_FILE_STATE_ACTIVE) {
      return mediaFile
    }

    if (mediaFile.state === GEMINI_FILE_STATE_FAILED) {
      const remoteError = mediaFile.error?.message || 'Gemini failed to process the media file.'
      throw new Error(remoteError)
    }

    await sleep(3000)
    mediaFile = await getGeminiFile(apiKey, fileName)
  }

  throw new Error('Timed out while preparing media for transcription.')
}

const TRANSCRIPTION_PROMPT = [
  'Listen carefully to the audio and transcribe all spoken words, speech, dialogue, and voiceover verbatim from start to finish.',
  'Automatically detect the spoken language (e.g. Khmer, English, Chinese, etc.).',
  'Do not omit or skip any words even with background music or sound effects.',
  'Format the output strictly as JSON with this exact shape:',
  '{"language":"auto","text":"Full continuous transcript of everything spoken","segments":[{"start":0.0,"end":4.2,"text":"spoken phrase"}]}',
  'Ensure the "text" field contains the complete full transcript, and "segments" provides the timestamped breakdown.',
  'If no speech is present at all in the audio, return {"language":"auto","text":"","segments":[]}.'
].join(' ')

type TranscriptResultPayload = {
  text: string
  segments: ReturnType<typeof parseGeminiTranscriptResponse>['segments']
  language: string
  duration: number
  source: string
}

type ProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number }
  | { type: 'progress'; progress: number }
  | { type: 'result' } & TranscriptResultPayload
  | { type: 'error'; error: string }

function classifyTranscriptionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to transcribe media.'
  let status = 500

  if (/no file|no media|valid media url|http and https|supported|limited|link must point|unable to fetch|unable to extract|timed out|not allowed|resolves to a web page|returned .* not an audio or video file/i.test(message)) {
    status = 400
  } else if (/429|resource_exhausted|resource exhausted|rate limit|quota/i.test(message)) {
    return {
      message: 'Rate limit reached on the free Gemini tier. Wait a minute and try again, or transcribe fewer files at once.',
      status: 429
    }
  } else if (/503|service unavailable|high demand/i.test(message)) {
    status = 503
  }

  return { message, status }
}

// Reads the configured Gemini API keys. Supports GEMINI_API_KEYS (a comma-
// separated list that is rotated when one key hits its rate limit) and falls
// back to the single GEMINI_API_KEY. Returns an empty list when none is set.
function getGeminiApiKeys(): string[] {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length) {
    return multi
  }
  const single = (process.env.GEMINI_API_KEY || '').trim().replace(/["'\r\n]/g, '')
  return single && single !== 'AIzaSyYourGoogleApiKeyHere' ? [single] : []
}

// Reads the models to try, in order. Supports GEMINI_MODELS (a comma-separated
// list rotated when one model is rate-limited / out of quota / 503 high demand)
// and falls back to the single GEMINI_MODEL, then the default list.
function getGeminiModels(): string[] {
  const multi = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((model) => model.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length) {
    return multi
  }
  const single = (process.env.GEMINI_MODEL || '').trim().replace(/["'\r\n]/g, '')
  if (single) {
    const list = [single, ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== single)]
    return list
  }
  return DEFAULT_FALLBACK_MODELS
}

function buildMockResult(): TranscriptResultPayload {
  const mockSegments = [
    {
      start: 0,
      end: 5.2,
      text: 'This is a mock transcription returned from the API route because an authentic Google Gemini API Key was not detected.'
    },
    {
      start: 5.2,
      end: 12.5,
      text: 'Add your actual GEMINI_API_KEY to your .env file to enable structural analysis and exact transcription of your audio or video input.'
    }
  ]
  return {
    text: mockSegments.map((segment) => segment.text).join('\n\n'),
    segments: normalizeTranscriptSegments(mockSegments),
    language: 'english',
    duration: 12.5,
    source: 'api'
  }
}

function hashAudio(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// Looks up a previously transcribed result for identical audio. Returns null on
// any error so a cache problem never blocks a transcription.
async function readTranscriptCache(audioHash: string) {
  try {
    const cached = await prisma.transcriptCache.findUnique({ where: { audioHash } })
    if (!cached) return null

    let segments: ReturnType<typeof normalizeTranscriptSegments> = []
    if (cached.segments) {
      try {
        segments = normalizeTranscriptSegments(JSON.parse(cached.segments))
      } catch {
        segments = []
      }
    }

    return {
      text: cached.text,
      segments,
      language: cached.language || 'auto',
      duration: cached.duration || 0
    }
  } catch (error) {
    console.warn('Transcript cache lookup failed:', error)
    return null
  }
}

async function writeTranscriptCache(audioHash: string, result: TranscriptResultPayload) {
  try {
    await prisma.transcriptCache.upsert({
      where: { audioHash },
      update: {
        text: result.text,
        segments: JSON.stringify(result.segments),
        language: result.language,
        duration: result.duration
      },
      create: {
        audioHash,
        text: result.text,
        segments: JSON.stringify(result.segments),
        language: result.language,
        duration: result.duration
      }
    })
  } catch (error) {
    console.warn('Unable to store transcript in cache:', error)
  }
}

// Runs tasks with a bounded number in flight at once, preserving result order.
async function mapWithConcurrency<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) break
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

// Uploads the audio once with ONE API key, then tries each model in turn on that
// key, rotating to the next model when one is rate-limited / out of quota (no
// re-upload needed to switch models). Cleans up the uploaded file when done.
// Throws on failure so the caller can rotate to another key.
async function transcribeWithKey(
  apiKey: string,
  audioInput: { buffer?: Buffer; fileUri?: string; mimeType: string; displayName: string; durationSeconds?: number },
  sourceName: string,
  models: string[],
  emit: (event: ProgressEvent) => void
): Promise<TranscriptResultPayload> {
  let uploadedFileName = ''

  try {
    let mediaMimeType = audioInput.mimeType
    let fileUri = audioInput.fileUri
    let metadataDuration = 0

    if (fileUri) {
      const match = fileUri.match(/files\/[a-z0-9]+/i)
      const fileName = match ? match[0] : fileUri
      uploadedFileName = fileName

      emit({ type: 'status', phase: 'processing' })
      const uploadedFile = await waitForUploadedFile(apiKey, fileName)
      mediaMimeType = uploadedFile.mimeType || mediaMimeType
      fileUri = uploadedFile.uri
      metadataDuration = parseDurationSeconds(uploadedFile.videoMetadata?.videoDuration)
    } else if (audioInput.buffer) {
      // Fast path: small audio goes inline in the request — no upload, no polling.
      // Video files and media over 8MB always use the Files API.
      const useInline =
        audioInput.buffer.byteLength <= INLINE_AUDIO_LIMIT_BYTES &&
        !audioInput.mimeType.startsWith('video/')

      if (!useInline) {
        emit({ type: 'status', phase: 'uploading' })

        const uploadResult = await withGeminiRetry(
          () =>
            uploadGeminiFile(apiKey, {
              buffer: audioInput.buffer!,
              mimeType: audioInput.mimeType,
              displayName: audioInput.displayName
            }),
          'upload'
        )
        uploadedFileName = uploadResult.file.name

        const uploadedFile = await waitForUploadedFile(apiKey, uploadedFileName)
        mediaMimeType = uploadedFile.mimeType
        fileUri = uploadedFile.uri
        metadataDuration = parseDurationSeconds(uploadedFile.videoMetadata?.videoDuration)
      }
    }

    const totalDuration = audioInput.durationSeconds || metadataDuration

    emit({ type: 'status', phase: 'processing', duration: totalDuration })

    let lastProgress = 0
    let lastError: unknown

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const modelName = models[modelIndex]
      try {
        const responseText = await withGeminiRetry(
          () =>
            streamGeminiTranscript(apiKey, {
              modelName,
              prompt: TRANSCRIPTION_PROMPT,
              mimeType: mediaMimeType,
              ...(fileUri ? { fileUri } : { inlineData: audioInput.buffer }),
              onText: (accumulated) => {
                if (totalDuration <= 0) return
                const latestEnd = extractLatestEndSeconds(accumulated)
                const percent = Math.min(99, Math.round((latestEnd / totalDuration) * 100))
                if (percent > lastProgress) {
                  lastProgress = percent
                  emit({ type: 'progress', progress: percent })
                }
              }
            }),
          `transcription generation (${modelName})`
        )

        const parsedTranscript = parseGeminiTranscriptResponse(responseText)
        emit({ type: 'progress', progress: 100 })

        return {
          text: parsedTranscript.text,
          segments: parsedTranscript.segments,
          language: parsedTranscript.language,
          duration: totalDuration,
          source: sourceName || modelName
        }
      } catch (error) {
        lastError = error
        if (shouldRotate(error) && modelIndex < models.length - 1) {
          console.warn(`Model "${modelName}" unavailable or rate-limited on this key; trying next model...`)
          continue
        }
        throw error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All models failed.')
  } finally {
    if (uploadedFileName) {
      try {
        await deleteGeminiFile(apiKey, uploadedFileName)
      } catch (cleanupError) {
        console.warn('Unable to delete uploaded Gemini file:', cleanupError)
      }
    }
  }
}

// Runs the full pipeline: reads the media once, then tries each API key in turn,
// rotating to the next key when one is rate-limited. Emits real progress events.
async function runTranscriptionPipeline(
  req: Request,
  keys: string[],
  emit: (event: ProgressEvent) => void
): Promise<TranscriptResultPayload> {
  if (!keys.length) {
    // No API key configured: return a mock transcript with staged progress.
    emit({ type: 'status', phase: 'processing', duration: 12.5 })
    for (const progress of [25, 55, 85]) {
      await sleep(400)
      emit({ type: 'progress', progress })
    }
    await sleep(300)
    emit({ type: 'progress', progress: 100 })
    return buildMockResult()
  }

  emit({ type: 'status', phase: 'uploading' })
  const mediaInput = await getMediaInputFromRequest(req)
  const models = getGeminiModels()

  // Fast direct path for files uploaded directly from browser to Gemini Files API
  if (mediaInput.fileUri) {
    let lastError: unknown
    for (let k = 0; k < keys.length; k += 1) {
      try {
        return await transcribeWithKey(
          keys[k],
          {
            fileUri: mediaInput.fileUri,
            mimeType: mediaInput.mimeType,
            displayName: mediaInput.displayName,
            durationSeconds: 0
          },
          mediaInput.sourceName,
          models,
          emit
        )
      } catch (err) {
        lastError = err
        if (k < keys.length - 1) {
          console.warn(`Key #${k + 1} failed for fileUri; trying next configured key...`)
          continue
        }
        throw err
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Transcription failed across all keys.')
  }

  const audioInput = await extractSpeechAudio({
    buffer: mediaInput.buffer!,
    mimeType: mediaInput.mimeType,
    displayName: mediaInput.displayName
  })

  // Cache: identical audio returns instantly and uses no API quota.
  const audioHash = hashAudio(audioInput.buffer)
  const cached = await readTranscriptCache(audioHash)
  if (cached) {
    emit({ type: 'progress', progress: 100 })
    return {
      text: cached.text,
      segments: cached.segments,
      language: cached.language,
      duration: cached.duration || audioInput.durationSeconds,
      source: mediaInput.sourceName || 'cache'
    }
  }

  const runAcrossKeys = async (
    audio: { buffer: Buffer; mimeType: string; displayName: string; durationSeconds: number },
    onEvent: (event: ProgressEvent) => void
  ) => {
    let lastError: unknown
    for (let index = 0; index < keys.length; index += 1) {
      try {
        return await transcribeWithKey(keys[index], audio, mediaInput.sourceName, models, onEvent)
      } catch (error) {
        lastError = error
        // A key throws only after ALL its models were exhausted (rate-limited or
        // unavailable), so rotate to the next key.
        if (shouldRotate(error) && index < keys.length - 1) {
          console.warn(`Gemini key #${index + 1} exhausted all models; rotating to key #${index + 2}.`)
          continue
        }
        throw error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to transcribe media.')
  }

  // Long recordings: split into chunks and transcribe them in parallel, then
  // stitch the segments back together with their timestamps offset.
  const shouldChunk =
    audioInput.durationSeconds > CHUNK_THRESHOLD_SECONDS ||
    (audioInput.durationSeconds <= 0 && audioInput.buffer.byteLength > 600 * 1024)

  if (shouldChunk) {
    const chunks = await splitAudioIntoChunks(
      { buffer: audioInput.buffer, displayName: audioInput.displayName },
      CHUNK_DURATION_SECONDS
    )

    if (chunks.length > 1) {
      emit({ type: 'status', phase: 'processing', duration: audioInput.durationSeconds || chunks.length * CHUNK_DURATION_SECONDS })

      let completed = 0
      const partials = await mapWithConcurrency(chunks, MAX_PARALLEL_CHUNKS, async (chunk) => {
        const result = await runAcrossKeys(
          {
            buffer: chunk.buffer,
            mimeType: chunk.mimeType,
            displayName: chunk.displayName,
            durationSeconds: CHUNK_DURATION_SECONDS
          },
          // Suppress per-chunk status noise; report overall chunk progress instead.
          () => {}
        )
        completed += 1
        emit({ type: 'progress', progress: Math.min(99, Math.round((completed / chunks.length) * 100)) })
        return { chunk, result }
      })

      const mergedSegments = partials.flatMap(({ chunk, result }) =>
        result.segments.map((segment) => ({
          ...segment,
          start: segment.start + chunk.startOffsetSeconds,
          ...(typeof segment.end === 'number' ? { end: segment.end + chunk.startOffsetSeconds } : {})
        }))
      )
      const normalized = normalizeTranscriptSegments(mergedSegments)
      const mergedText = getPlainTranscriptText(
        partials.map(({ result }) => result.text).join('\n\n'),
        normalized
      )

      const maxSegmentEnd = normalized.reduce((max, s) => Math.max(max, typeof s.end === 'number' ? s.end : s.start), 0)
      const finalDuration = audioInput.durationSeconds > 0 ? audioInput.durationSeconds : maxSegmentEnd

      const finalResult: TranscriptResultPayload = {
        text: mergedText,
        segments: normalized,
        language: partials.find(({ result }) => result.language !== 'auto')?.result.language || 'auto',
        duration: finalDuration,
        source: mediaInput.sourceName || MODEL_NAME
      }

      emit({ type: 'progress', progress: 100 })
      await writeTranscriptCache(audioHash, finalResult)
      return finalResult
    }
  }

  const result = await runAcrossKeys(audioInput, emit)
  await writeTranscriptCache(audioHash, result)
  return result
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
  }

  const keys = getGeminiApiKeys()
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
          const result = await runTranscriptionPipeline(req, keys, emit)
          emit({ type: 'result', ...result })
          
          // Log privacy-safe metrics for admin dashboard (no transcript text saved)
          trackUsage({
            userId: session.user?.id || null,
            model: MODEL_NAME,
            inputType: 'file',
            durationSeconds: result.duration,
            wordCount: result.text ? result.text.split(/\s+/).filter(Boolean).length : 0,
            status: 'success'
          }).catch(() => {})
        } catch (error) {
          console.error('Transcription error:', error)
          const classified = classifyTranscriptionError(error)
          emit({ type: 'error', error: classified.message })
          
          // Log error report for admin debugging
          trackError({
            userId: session.user?.id || null,
            endpoint: '/api/transcribe',
            errorMessage: error instanceof Error ? error.message : 'Transcription failed',
            errorType: classified.message,
            model: MODEL_NAME
          }).catch(() => {})
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
    const result = await runTranscriptionPipeline(req, keys, () => {})
    trackUsage({
      userId: session.user?.id || null,
      model: MODEL_NAME,
      inputType: 'file',
      durationSeconds: result.duration,
      wordCount: result.text ? result.text.split(/\s+/).filter(Boolean).length : 0,
      status: 'success'
    }).catch(() => {})
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Transcription error:', error)
    const { message, status } = classifyTranscriptionError(error)
    trackError({
      userId: session.user?.id || null,
      endpoint: '/api/transcribe',
      errorMessage: error instanceof Error ? error.message : 'Transcription failed',
      errorType: message,
      model: MODEL_NAME
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status })
  }
}
