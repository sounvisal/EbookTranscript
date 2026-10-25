import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
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
  checkTranscriptIncompleteness,
  extractTimestampedSegments,
  getPlainTranscriptText,
  normalizeTranscriptSegments,
  parseStructuredTranscriptText,
  parseTimestampToSeconds,
  type TranscriptSegment
} from '@/lib/transcript'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { trackUsage, trackError } from '@/lib/telemetry'
import {
  getOptimalModelOrder,
  recordModelSuccess,
  recordModelFailure,
  getOptimalKeyOrder,
  recordKeySuccess,
  recordKeyFailure,
  getNextRoundRobinKeyIndex
} from '@/lib/fleet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_LOCAL_FILE_BYTES = MAX_MEDIA_UPLOAD_BYTES
// Gemini 2.5 Flash-Lite & 3.5 Flash-Lite provide sub-second to 3s latency and high free-tier limits (15 RPM / 1000 RPD).
// Gemini 2.5 Flash with thinkingBudget=0 provides instant high-attention failover without reasoning delays.
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']

// Audio at or below this size is sent inline in the transcribe request.
// Video files or audio larger than 8MB always use the Files API (supports up to 2GB).
const INLINE_AUDIO_LIMIT_BYTES = 8 * 1024 * 1024

// Recordings longer than this are split into parallel chunks so long media
// finishes far faster than transcribing it in one sequential pass and ensures
// full verbatim transcription without model token truncation.
const CHUNK_THRESHOLD_SECONDS = 150
const CHUNK_DURATION_SECONDS = 120
const MAX_PARALLEL_CHUNKS = 3

export type TranscribeOptions = {
  customVocabulary?: string[]
  speakerDiarization?: boolean
  languagePreference?: 'auto' | 'khmer' | 'english' | 'bilingual'
  highSensitivity?: boolean
}

export type TranscriptResultPayload = {
  text: string
  segments: TranscriptSegment[]
  language: string
  duration: number
  source: string
  model?: string
  keyIndex?: number
  latencyMs?: number
}

type MediaInput = {
  buffer?: Buffer
  fileUri?: string
  mimeType: string
  displayName: string
  sourceName: string
  durationSeconds?: number
  keyIndex?: number
  options?: TranscribeOptions
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

function parseDurationSeconds(durationText?: string) {
  if (!durationText) return 0

  const numericValue = Number.parseFloat(durationText.replace(/s$/i, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

// Scans partial/streaming transcript JSON for the highest "end" timestamp seen
// so far. Combined with the total media duration this yields real progress.
function extractLatestEndSeconds(text: string) {
  let latest = 0
  const pattern = /"(?:end|end_time|endTime)"\s*:\s*(?:"([^"]+)"|([0-9.:]+))/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1] || match[2]
    if (!raw) continue
    let value = 0
    if (raw.includes(':')) {
      const parsed = parseTimestampToSeconds(raw)
      if (parsed !== null) value = parsed
    } else {
      value = Number(raw)
    }
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

async function getMediaInputFromRequest(req: Request): Promise<MediaInput> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    // Direct Gemini File URI support (for files uploaded directly from browser to Gemini)
    if (typeof body?.fileUri === 'string' && body.fileUri.trim()) {
      const rawUri = body.fileUri.trim()
      if (!rawUri.startsWith('https://generativelanguage.googleapis.com/') && !/^files\/[a-z0-9_-]+$/i.test(rawUri)) {
        throw new Error('Invalid Gemini File URI.')
      }

      let mimeType = body.mimeType || 'video/mp4'
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = body.displayName?.split('.').pop()?.toLowerCase()
        if (ext === 'mp4' || ext === 'm4v') mimeType = 'video/mp4'
        else if (ext === 'mp3') mimeType = 'audio/mpeg'
        else if (ext === 'm4a') mimeType = 'audio/mp4'
        else if (ext === 'wav') mimeType = 'audio/wav'
        else if (ext === 'webm') mimeType = 'video/webm'
        else if (ext === 'mov') mimeType = 'video/quicktime'
        else mimeType = 'video/mp4'
      }
      const durationSeconds =
        typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration > 0
          ? body.duration
          : typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds) && body.durationSeconds > 0
            ? body.durationSeconds
            : 0

      return {
        fileUri: body.fileUri.trim(),
        mimeType,
        displayName: body.displayName || 'uploaded-media',
        sourceName: body.displayName || 'uploaded-media',
        durationSeconds,
        keyIndex: typeof body?.keyIndex === 'number' ? body.keyIndex : undefined,
        options: body?.options
      }
    }

    if (body?.url) {
      throw new Error('Link transcription is disabled. Please upload an audio or video file directly.')
    }

    throw new Error('No media file provided.')
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const urlValue = typeof formData.get('url') === 'string' ? String(formData.get('url')).trim() : ''

  if (urlValue) {
    throw new Error('Link transcription is disabled. Please upload an audio or video file directly.')
  }

  let options: TranscribeOptions | undefined
  const optionsRaw = formData.get('options')
  if (typeof optionsRaw === 'string' && optionsRaw.trim()) {
    try {
      options = JSON.parse(optionsRaw)
    } catch {}
  }

  const keyIndexHeader = req.headers.get('x-key-index')
  const keyIndexForm = formData.get('keyIndex')
  const parsedKeyIndex = keyIndexHeader !== null ? Number(keyIndexHeader) : (keyIndexForm !== null ? Number(keyIndexForm) : undefined)
  const keyIndex = typeof parsedKeyIndex === 'number' && Number.isFinite(parsedKeyIndex) ? parsedKeyIndex : undefined

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
      sourceName: fileName,
      options,
      keyIndex
    }
  }

  throw new Error('Please select an audio or video file to transcribe.')
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /429|resource_exhausted|resource exhausted|rate limit|quota/i.test(message)
}

// A model that this account/key can't use (e.g. "no longer available to new
// users", not found). We skip to the next model when this happens.
function isModelUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /404|not found|no longer available|not available|does not exist|not supported|user location|failed_precondition/i.test(message)
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
  // Rate-limit (429) and high-demand (503) errors are intentionally NOT retried here on
  // the same model — they bubble up immediately to shouldRotate() so the caller rotates
  // to the next available model in 0ms instead of waiting through 20+ seconds of retry sleeps.
  if (isRateLimitError(error) || isServiceUnavailableError(error) || isModelUnavailableError(error)) {
    return false
  }
  const message = error instanceof Error ? error.message : String(error)
  return /network error|timed out|socket hang up|econnreset|econnrefused|enotfound|eai_again|etimedout/i.test(message)
}

async function withGeminiRetry<T>(operation: () => Promise<T>, label: string) {
  const maxAttempts = 2
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error
      }

      const backoffMs = attempt * 500
      console.warn(`Gemini ${label} transient network retry #${attempt} in ${backoffMs}ms...`, error)
      await sleep(backoffMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Gemini ${label} failed.`)
}

async function waitForUploadedFile(apiKey: string, fileName: string) {
  let mediaFile = await getGeminiFile(apiKey, fileName)

  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (mediaFile.state === GEMINI_FILE_STATE_ACTIVE) {
      return mediaFile
    }

    if (mediaFile.state === GEMINI_FILE_STATE_FAILED) {
      const remoteError = mediaFile.error?.message || 'Gemini failed to process the media file.'
      throw new Error(remoteError)
    }

    const waitTime = attempt < 4 ? 800 : 1500
    await sleep(waitTime)
    mediaFile = await getGeminiFile(apiKey, fileName)
  }

  throw new Error('Timed out while preparing media for transcription.')
}

const BASE_TRANSCRIPTION_PROMPT = [
  'You are an expert multilingual audio transcription AI specialized in automatic language detection (Khmer / ភាសាខ្មែរ, English, and bilingual speech) and noisy audio extraction.',
  'Listen carefully to the entire media from the very beginning (0:00) to the absolute end.',
  '1. AUTOMATIC LANGUAGE DETECTION: Automatically detect the spoken language. If the audio is in Khmer, set language to "Khmer". If in English, set language to "English". If bilingual mixed speech, set language to "Khmer / English".',
  '2. VERBATIM SPEECH ACCURACY: Transcribe every spoken word accurately in the native script. For Khmer speech, output clean Khmer script (អក្សរខ្មែរ) with proper spacing and spelling. For English speech, output English.',
  '3. HIGH-SENSITIVITY ACOUSTIC EXTRACTION: Listen with maximum sensitivity to all audio channels. Even if the voice is quiet, muffled, whispered, speaking fast, singing, chanting, talking over an intro, or partially masked by background music, sound effects, beats, or ambient noise, you MUST detect and transcribe all spoken words verbatim.',
  '4. COMPLETE RECORDING CONTINUITY & VIRAL VIDEO HOOKS: Transcribe the entire duration verbatim from start to finish without stopping. Viral social media videos (TikTok, Snaptik, Facebook Reels, Shorts) frequently begin with a 1-sentence opening hook, followed by a dramatic sound effect, laugh track, musical break, or scene transition, after which the narration continues. You MUST NOT STOP after the opening hook sentence. Keep listening past all pauses, music stingers, and sound effects all the way to the absolute end of the media.',
  '5. COMPILATIONS, COUNTDOWNS & MULTI-SCENE CONTINUITY: For countdowns and list videos (e.g. "Number 10" or "Number 9" down to "Number 1"), you MUST transcribe every single entry all the way through the final #1 reveal and outro conclusion. Never stop early at an intermediate number like #2 or #3. There are often 5-15 second transition pauses, action clips, or music between list numbers; continue listening past any pauses and transcribe all speech to the absolute end of the media.',
  '6. NUMERIC SECONDS TIMESTAMPS: Every start and end timestamp in "segments" must be a raw number in seconds (e.g. 0.0, 4.5, 38.2, 145.6). Do NOT use formatted colon strings like "2:30".',
  '7. QUOTATION MARKS: Inside transcript text strings, use single quotes (\'quote\') or properly escaped quotes (\\"quote\\") for spoken dialogue so that JSON formatting is strictly valid.',
  'Format strictly as JSON with this exact shape:',
  '{"language":"Khmer","text":"Full continuous transcript text here","segments":[{"start":0.0,"end":4.5,"text":"phrase"}]}',
  'Ensure "text" contains the complete continuous transcript, and "segments" contains all timestamped phrases.',
  'Only return empty segments if the audio is 100% complete dead silence or pure instrumental music with absolutely zero human vocal sounds or words.'
].join(' ')

function buildTranscriptionPrompt(options?: TranscribeOptions): string {
  if (!options) return BASE_TRANSCRIPTION_PROMPT

  const customVocab = options.customVocabulary?.map((v) => v.trim()).filter(Boolean) || []
  const diarization = Boolean(options.speakerDiarization)
  const langPref = options.languagePreference || 'auto'

  let langInstruction = '1. AUTOMATIC LANGUAGE DETECTION: Automatically detect the spoken language. If the audio is in Khmer, set language to "Khmer". If in English, set language to "English". If bilingual mixed speech, set language to "Khmer / English".'
  if (langPref === 'khmer') {
    langInstruction = '1. LANGUAGE REQUIREMENT: The spoken audio is in Khmer (ភាសាខ្មែរ). Transcribe strictly in clean Khmer script (អក្សរខ្មែរ) with proper spacing and spelling. Set language to "Khmer".'
  } else if (langPref === 'english') {
    langInstruction = '1. LANGUAGE REQUIREMENT: The spoken audio is in English. Transcribe strictly in English with proper punctuation, grammar, and capitalization. Set language to "English".'
  } else if (langPref === 'bilingual') {
    langInstruction = '1. LANGUAGE REQUIREMENT: The spoken audio contains bilingual Khmer and English mixed speech (code-switching). Transcribe Khmer portions in Khmer script (អក្សរខ្មែរ) and English speech/loanwords in English script. Set language to "Khmer / English".'
  }

  const promptParts = [
    'You are an expert multilingual audio transcription AI specialized in automatic language detection (Khmer / ភាសាខ្មែរ, English, and bilingual speech) and noisy audio extraction.',
    'Listen carefully to the entire media from the very beginning (0:00) to the absolute end.',
    langInstruction,
    '2. VERBATIM SPEECH ACCURACY: Transcribe every spoken word accurately in the native script. For Khmer speech, output clean Khmer script (អក្សរខ្មែរ) with proper spacing and spelling. For English speech, output English.',
    '3. HIGH-SENSITIVITY ACOUSTIC EXTRACTION: Listen with maximum sensitivity to all audio channels. Even if the voice is quiet, muffled, whispered, speaking fast, singing, chanting, talking over an intro, or partially masked by background music, sound effects, beats, or ambient noise, you MUST detect and transcribe all spoken words verbatim.',
    '4. COMPLETE RECORDING CONTINUITY & VIRAL VIDEO HOOKS: Transcribe the entire duration verbatim from start to finish without stopping. Viral social media videos (TikTok, Snaptik, Facebook Reels, Shorts) frequently begin with a 1-sentence opening hook, followed by a dramatic sound effect, laugh track, musical break, or scene transition, after which the narration continues. You MUST NOT STOP after the opening hook sentence. Keep listening past all pauses, music stingers, and sound effects all the way to the absolute end of the media.',
    '5. COMPILATIONS, COUNTDOWNS & MULTI-SCENE CONTINUITY: For countdowns and list videos (e.g. "Number 10" or "Number 9" down to "Number 1"), you MUST transcribe every single entry all the way through the final #1 reveal and outro conclusion. Never stop early at an intermediate number like #2 or #3. There are often 5-15 second transition pauses, action clips, or music between list numbers; continue listening past any pauses and transcribe all speech to the absolute end of the media.',
    '6. NUMERIC SECONDS TIMESTAMPS: Every start and end timestamp in "segments" must be a raw number in seconds (e.g. 0.0, 4.5, 38.2, 145.6). Do NOT use formatted colon strings like "2:30".'
  ]

  if (diarization) {
    promptParts.push(
      '7. SPEAKER DIARIZATION: Identify and differentiate distinct speakers across the audio. Prefix each speaker turn or dialogue with speaker labels (e.g., "Speaker 1: ...", "Speaker 2: ..."). Maintain consistent speaker tags across consecutive segments.'
    )
  }

  if (customVocab.length > 0) {
    promptParts.push(
      `8. DOMAIN VOCABULARY & KEYWORD HINTS: Pay special attention to the following specific proper nouns, technical terms, and keywords: ${customVocab.map((v) => `"${v}"`).join(', ')}. Whenever words sounding like or referring to these terms are spoken, transcribe them with these exact spellings.`
    )
  }

  if (options.highSensitivity) {
    promptParts.push(
      '9. MAXIMUM AUDIO SENSITIVITY ACTIVE: The recording contains quiet dialogue, whispering, lyrics, or speech over background music/beats. Boost vocal channel detection and transcribe all audible utterances verbatim without omitting any words.'
    )
  }

  promptParts.push(
    '10. QUOTATION MARKS: Inside transcript text strings, use single quotes (\'quote\') or properly escaped quotes (\\"quote\\") for spoken dialogue so that JSON formatting is strictly valid.',
    'Format strictly as JSON with this exact shape:',
    '{"language":"Khmer","text":"Full continuous transcript text here","segments":[{"start":0.0,"end":4.5,"text":"phrase"}]}',
    'Ensure "text" contains the complete continuous transcript, and "segments" contains all timestamped phrases.',
    'Only return empty segments if the audio is 100% complete dead silence or pure instrumental music with absolutely zero human vocal sounds or words.'
  )

  return promptParts.join(' ')
}

const TRANSCRIPTION_PROMPT = BASE_TRANSCRIPTION_PROMPT

type ProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number; message?: string }
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

// Self-Healing Fleet Model Order:
// Dynamically orders models so that fast, healthy models are prioritized.
// Quarantines models experiencing 503 high demand or 429 rate limits until their cooldown passes.
function getGeminiModels(durationSeconds?: number): string[] {
  return getOptimalModelOrder(durationSeconds)
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
  // Never write incomplete or prematurely cut-off transcripts to cache!
  const incompleteness = checkTranscriptIncompleteness(result.text, result.segments, result.duration)
  if (incompleteness.isIncomplete) {
    console.warn(`[TranscriptCache] Skipping cache for incomplete transcript: ${incompleteness.reason}`)
    return
  }

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
  emit: (event: ProgressEvent) => void,
  promptText: string = TRANSCRIPTION_PROMPT,
  keyIndex: number = 0
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

    let totalDuration = audioInput.durationSeconds || metadataDuration

    // If total duration is unknown, probe duration quickly
    if (totalDuration <= 0 && (fileUri || audioInput.buffer)) {
      try {
        const probeRes = await streamGeminiTranscript(apiKey, {
          modelName: 'gemini-2.5-flash',
          prompt: 'What is the total duration of this audio file in seconds? Return strictly JSON: {"duration": 123.4}',
          mimeType: mediaMimeType,
          ...(fileUri ? { fileUri } : { inlineData: audioInput.buffer })
        })
        const match = probeRes.match(/"duration"\s*:\s*([0-9.]+)/i)
        if (match) {
          const val = Number(match[1])
          if (Number.isFinite(val) && val > 0) {
            totalDuration = val
          }
        }
      } catch (probeErr) {
        console.warn('Duration probe skipped:', probeErr)
      }
    }

    emit({ type: 'status', phase: 'processing', duration: totalDuration })

    // For long media (>= 90s), re-order models using duration-aware fleet order so long-context models lead
    let activeModels = totalDuration >= 90 ? getGeminiModels(totalDuration) : models

    let lastProgress = 0
    let lastError: unknown

    for (let modelIndex = 0; modelIndex < activeModels.length; modelIndex += 1) {
      const modelName = activeModels[modelIndex]
      const modelCallStart = Date.now()
      const roundedDuration = Math.round(totalDuration)
      const effectivePrompt = totalDuration > 0
        ? `${promptText} CRITICAL FULL-DURATION REQUIREMENT: Total recording duration is exactly ${roundedDuration} seconds. Spoken dialogue occurs across the full recording. Viral social media clips (TikTok, Facebook, Reels) frequently feature dramatic mid-video sound effects (crashes, laughter, music stingers) and action pauses between scenes. You MUST continue listening past any mid-video sound effects or pauses all the way to ${roundedDuration}s. For compilations and countdowns (e.g., Number 10 down to Number 1), you MUST transcribe all entries completely all the way through the final #1 item and conclusion. Dialogue resumes after scene transitions. You MUST transcribe all spoken dialogue from 0.0s all the way to ${roundedDuration}s without stopping. Do NOT stop after introductory phrases, sound effects, or musical pauses.`
        : promptText

      try {
        const responseText = await withGeminiRetry(
          () =>
            streamGeminiTranscript(apiKey, {
              modelName,
              prompt: effectivePrompt,
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

        // Accumulate segments across initial pass and any necessary continuation passes
        let accumulatedSegments = [...(parsedTranscript.segments || [])]
        let currentMaxEnd = accumulatedSegments.reduce((max, s) => {
          const end = typeof s.end === 'number' && Number.isFinite(s.end) ? s.end : (typeof s.start === 'number' && Number.isFinite(s.start) ? s.start : 0)
          return Math.max(max, end)
        }, 0)

        // AUTOMATIC CONTINUATION LOOP:
        // If the media has known duration (>= 15s) and the transcribed speech stopped early
        // (e.g. at an intro pause, sound effect, musical break, or token pause),
        // automatically issue continuation requests from the last detected timestamp to capture all remaining speech.
        // FAST CONTINUATION CHECK:
        // If the media has known duration (>= 15s) and the transcribed speech stopped early
        // (e.g. at an intro pause or speech pause), perform at most 1 fast continuation scan.
        let continuationPass = 0
        const MAX_CONTINUATION_PASSES = totalDuration > 300 ? 2 : 1

        while (
          totalDuration >= 15 &&
          currentMaxEnd < totalDuration - 6 &&
          continuationPass < MAX_CONTINUATION_PASSES
        ) {
          continuationPass++
          const startOffset = Math.max(0, Math.floor(currentMaxEnd))
          const lastWords = accumulatedSegments.slice(-2).map((s) => s.text).join(' ').slice(-100).trim()
          const roundedTotal = Math.round(totalDuration)

          emit({
            type: 'status',
            phase: 'processing',
            message: `Scanning audio continuation (${Math.round(currentMaxEnd)}s / ${roundedTotal}s)...`
          })

          const isCountdownInProgress =
            /\b(?:number|no\.?|#)\s*(?:10|ten|9|nine|8|eight|7|seven|6|six|5|five|4|four|3|three|2|two)\b/i.test(accumulatedSegments.map((s) => s.text).join(' ')) ||
            /(?:លេខ|ចំណាត់ថ្នាក់(?:លេខ)?)\s*(?:១០|៩|៨|៧|៦|៥|៤|៣|២|10|9|8|7|6|5|4|3|2)/.test(accumulatedSegments.map((s) => s.text).join(' '))

          const contPrompt = [
            `CRITICAL RECORDING CONTINUATION: You are continuing the verbatim transcription of this media recording (total duration: ${roundedTotal} seconds).`,
            `Speech from 0:00 up to ${startOffset} seconds has already been transcribed.`,
            lastWords ? `The transcribed speech so far ended around ${startOffset}s with: "...${lastWords}".` : '',
            isCountdownInProgress ? `A countdown list is in progress! The final reveal (#1 / Number One / លេខ ១) and concluding dialogue occur between ${startOffset}s and ${roundedTotal}s. Transcribe all remaining entries and conclusion without stopping.` : '',
            `Listen carefully to all audio from ${startOffset}s to ${roundedTotal}s and transcribe any remaining spoken dialogue verbatim into the native script.`,
            'Format strictly as JSON with this exact shape:',
            `{"language":"${parsedTranscript.language || 'auto'}","text":"Remaining continuous transcript text here","segments":[{"start":${startOffset},"end":${startOffset + 5},"text":"phrase"}]}`,
            `Start timestamps must continue from ${startOffset}s.`
          ].filter(Boolean).join(' ')

          let rawContSegments: TranscriptSegment[] = []
          let contParsedText = ''

          try {
            const contResponseText = await withGeminiRetry(
              () =>
                streamGeminiTranscript(apiKey, {
                  modelName,
                  prompt: contPrompt,
                  mimeType: mediaMimeType,
                  ...(fileUri ? { fileUri } : { inlineData: audioInput.buffer }),
                  onText: (accumulated) => {
                    if (totalDuration <= 0) return
                    const latestEnd = extractLatestEndSeconds(accumulated)
                    const effectiveEnd = Math.max(currentMaxEnd, latestEnd)
                    const percent = Math.min(99, Math.round((effectiveEnd / totalDuration) * 100))
                    if (percent > lastProgress) {
                      lastProgress = percent
                      emit({ type: 'progress', progress: percent })
                    }
                  }
                }),
              `transcription continuation pass ${continuationPass} (${modelName})`
            )

            const contParsed = parseGeminiTranscriptResponse(contResponseText)
            rawContSegments = (contParsed.segments || []) as TranscriptSegment[]
            contParsedText = contParsed.text || ''
          } catch (contErr) {
            console.warn(`Continuation pass ${continuationPass} failed on ${modelName}:`, contErr)
          }

          // Detect if model emitted relative timestamps (starting near 0 instead of startOffset)
          const minStart = rawContSegments.length > 0 ? Math.min(...rawContSegments.map((s) => s.start)) : 0
          if (startOffset > 5 && rawContSegments.length > 0 && minStart < (startOffset / 2)) {
            rawContSegments = rawContSegments.map((s) => ({
              ...s,
              start: Math.round((s.start + startOffset) * 10) / 10,
              ...(typeof s.end === 'number' ? { end: Math.round((s.end + startOffset) * 10) / 10 } : {})
            }))
          }

          const newSegments = rawContSegments.filter((s) => s.start >= currentMaxEnd - 2)

          if (newSegments.length > 0) {
            accumulatedSegments.push(...newSegments)
            const newMaxEnd = accumulatedSegments.reduce((max, s) => {
              const end = typeof s.end === 'number' && Number.isFinite(s.end) ? s.end : s.start
              return Math.max(max, end)
            }, currentMaxEnd)

            if (newMaxEnd <= currentMaxEnd) {
              break
            }
            currentMaxEnd = newMaxEnd
          } else if (contParsedText && contParsedText.trim()) {
            const newText = contParsedText.trim()
            accumulatedSegments.push({
              start: startOffset,
              end: totalDuration,
              text: newText
            })
            currentMaxEnd = totalDuration
            break
          } else {
            // No additional speech detected in remainder of audio; naturally concluded
            break
          }
        }

        emit({ type: 'progress', progress: 100 })

        const maxSegmentEnd = currentMaxEnd
        const finalSegments = normalizeTranscriptSegments(accumulatedSegments)
        const textFromSegments = finalSegments.map((s) => s.text).join('\n\n')
        let finalText = textFromSegments || parsedTranscript.text || ''

        const wordCount = finalText ? finalText.split(/\s+/).filter(Boolean).length : 0
        const estimatedFromWords = wordCount > 0 ? Math.max(1, Math.round(wordCount / 2.3)) : 0

        const finalDuration = totalDuration > 0
          ? totalDuration
          : (maxSegmentEnd > 0 ? Math.round(maxSegmentEnd * 10) / 10 : estimatedFromWords)

        // DETECT TRUNCATED / PREMATURE CUT-OFF TRANSCRIPT:
        // Use comprehensive multi-check detection engine: countdowns, cliffhangers, duration coverage & word density
        const incompleteness = checkTranscriptIncompleteness(finalText, finalSegments, totalDuration)

        if (incompleteness.isIncomplete && modelIndex < activeModels.length - 1) {
          const nextModel = activeModels[modelIndex + 1]
          console.warn(
            `Model "${modelName}" produced incomplete transcript (${incompleteness.reason}). Auto-failing over to "${nextModel}"...`
          )
          recordModelFailure({
            model: modelName,
            error: new Error(`Incomplete transcript: ${incompleteness.reason}`),
            failoverModel: nextModel,
            skipTelegramAlert: true
          })
          promptText = `${promptText} CRITICAL FULL DURATION COMPLETION: The previous model attempt stopped prematurely (${incompleteness.reason}). You MUST listen all the way to ${Math.round(totalDuration)}s and capture the complete dialogue, every countdown item down to Number 1, and the conclusion.`
          continue
        }

        if (!finalText && (!finalSegments || finalSegments.length === 0)) {
          if (modelIndex < activeModels.length - 1) {
            console.warn(`Model "${modelName}" detected no spoken dialogue; trying next fallback model (${activeModels[modelIndex + 1]}) with acoustic sensitivity override...`)
            promptText = `${promptText} ACOUSTIC SENSITIVITY OVERRIDE: Human speech, dialogue, lyrics, or voiceover is present in this media. Isolate voice from background music, instruments, beats, or ambient noise, and transcribe all spoken words verbatim into the native script.`
            continue
          }

          finalText = '[No spoken dialogue detected in media]'
          const emptySegments = [
            {
              start: 0,
              end: finalDuration > 0 ? finalDuration : 5,
              text: '[No spoken dialogue detected in media]'
            }
          ]

          const latencyMs = Date.now() - modelCallStart
          recordModelSuccess(modelName, latencyMs)

          return {
            text: finalText,
            segments: emptySegments,
            language: parsedTranscript.language || 'auto',
            duration: finalDuration,
            source: sourceName || modelName,
            model: modelName,
            keyIndex,
            latencyMs
          }
        }

        const latencyMs = Date.now() - modelCallStart
        recordModelSuccess(modelName, latencyMs)

        return {
          text: finalText,
          segments: finalSegments,
          language: parsedTranscript.language || 'auto',
          duration: finalDuration,
          source: sourceName || modelName,
          model: modelName,
          keyIndex,
          latencyMs
        }
      } catch (error) {
        lastError = error
        const latencyMs = Date.now() - modelCallStart
        const nextModel = modelIndex < models.length - 1 ? models[modelIndex + 1] : undefined
        recordModelFailure({
          model: modelName,
          error,
          latencyMs,
          keyIndex,
          failoverModel: nextModel
        })

        if (shouldRotate(error) && modelIndex < models.length - 1) {
          // If this key hit 429 rate limit / quota exhaustion, testing subsequent models
          // on the SAME exhausted key will only waste 3-5s making calls that will also fail with 429.
          // Instantly throw to let the caller rotate to a fresh, standby API key in 0ms!
          if (isRateLimitError(error)) {
            console.warn(`Key #${keyIndex + 1} hit 429 rate limit. Bypassing remaining models on this key to rotate immediately to next standby key.`)
            throw error
          }

          console.warn(`Model "${modelName}" unavailable or high demand on Key #${keyIndex + 1}; failover to "${nextModel}"...`)
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
  const models = getGeminiModels(mediaInput.durationSeconds)
  const promptText = buildTranscriptionPrompt(mediaInput.options)

  // Fast direct path for files uploaded directly from browser to Gemini Files API
  if (mediaInput.fileUri) {
    const orderedKeys = getOptimalKeyOrder(mediaInput.keyIndex, keys)

    let lastError: unknown
    for (let k = 0; k < orderedKeys.length; k += 1) {
      const { key: currentKey, index: actualKeyIndex } = orderedKeys[k]
      try {
        const result = await transcribeWithKey(
          currentKey,
          {
            fileUri: mediaInput.fileUri,
            mimeType: mediaInput.mimeType,
            displayName: mediaInput.displayName,
            durationSeconds: mediaInput.durationSeconds || 0
          },
          mediaInput.sourceName,
          models,
          emit,
          promptText,
          actualKeyIndex
        )
        recordKeySuccess(actualKeyIndex, result.latencyMs)
        return result
      } catch (err) {
        lastError = err
        recordKeyFailure(actualKeyIndex, err)
        if (k < orderedKeys.length - 1) {
          console.warn(`Key attempt #${actualKeyIndex + 1} failed for fileUri; rotating immediately to next fleet key...`, err)
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

  // Cache: identical audio and options returns instantly and uses no API quota.
  const hasCustomOptions = Boolean(
    mediaInput.options?.customVocabulary?.length ||
    mediaInput.options?.speakerDiarization ||
    (mediaInput.options?.languagePreference && mediaInput.options.languagePreference !== 'auto')
  )
  const audioHash = hasCustomOptions
    ? hashAudio(Buffer.concat([audioInput.buffer, Buffer.from(JSON.stringify(mediaInput.options))]))
    : hashAudio(audioInput.buffer)

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
    onEvent: (event: ProgressEvent) => void,
    overrideKeyIndex?: number
  ) => {
    const preferred = typeof overrideKeyIndex === 'number' && overrideKeyIndex >= 0
      ? overrideKeyIndex
      : mediaInput.keyIndex

    const orderedKeys = getOptimalKeyOrder(preferred, keys)
    let lastError: unknown

    for (let k = 0; k < orderedKeys.length; k += 1) {
      const { key: currentKey, index } = orderedKeys[k]
      try {
        const result = await transcribeWithKey(
          currentKey,
          audio,
          mediaInput.sourceName,
          models,
          onEvent,
          promptText,
          index
        )
        recordKeySuccess(index, result.latencyMs)
        return result
      } catch (error) {
        lastError = error
        recordKeyFailure(index, error)
        // Rotate immediately to next fleet key when a key is exhausted or rate-limited
        if (shouldRotate(error) && k < orderedKeys.length - 1) {
          console.warn(`Gemini key #${index + 1} exhausted; rotating immediately to next fleet key...`)
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

      const baseKeyIndex = typeof mediaInput.keyIndex === 'number' && mediaInput.keyIndex >= 0
        ? mediaInput.keyIndex
        : getNextRoundRobinKeyIndex(keys.length)

      let completed = 0
      const partials = await mapWithConcurrency(chunks, MAX_PARALLEL_CHUNKS, async (chunk, chunkIndex) => {
        // Distribute chunks across distinct keys in the fleet so parallel requests do not compete on one key
        const chunkKeyIndex = (baseKeyIndex + chunkIndex) % keys.length
        const result = await runAcrossKeys(
          {
            buffer: chunk.buffer,
            mimeType: chunk.mimeType,
            displayName: chunk.displayName,
            durationSeconds: CHUNK_DURATION_SECONDS
          },
          // Suppress per-chunk status noise; report overall chunk progress instead.
          () => {},
          chunkKeyIndex
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
        source: mediaInput.sourceName || MODEL_NAME,
        model: partials[0]?.result?.model || MODEL_NAME,
        keyIndex: partials[0]?.result?.keyIndex ?? 0,
        latencyMs: partials.reduce((sum, p) => sum + (p.result?.latencyMs || 0), 0)
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

import { checkUserQuota } from '@/lib/quota'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
  }

  // Quota enforcement
  const quota = await checkUserQuota(session.user.id, session.user.email, session.user.role)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error || 'Daily usage limit reached.' }, { status: 429 })
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
          emit({ type: 'error', error: classified.message })
          
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
          await sleep(50)
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
