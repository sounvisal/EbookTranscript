import youtubedl from 'youtube-dl-exec'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs/promises'
import { existsSync, chmodSync, copyFileSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { normalizeTranscriptSegments, type TranscriptSegment } from './transcript'

export type ExtractedYouTubeMedia = {
  buffer: Buffer
  mimeType: string
  displayName: string
  sourceName: string
  durationSeconds?: number
}

export type YouTubeTranscriptResult = {
  text: string
  segments: TranscriptSegment[]
  language: string
  duration: number
  sourceName: string
  displayName: string
}

function getFfmpegPath(): string | undefined {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    if (typeof ffmpegStatic === 'string' && existsSync(ffmpegStatic)) {
      return ffmpegStatic
    }
  } catch {}
  return undefined
}

function sanitizeBaseTitle(title: string, fallback = 'youtube-media'): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized || fallback
}

/**
 * Resolves the yt-dlp binary across local, bundled, and serverless environments.
 * On Linux/Vercel (AWS Lambda), copies to /tmp/yt-dlp and chmods to ensure executable permissions,
 * or downloads the standalone Linux binary directly if missing.
 */
async function ensureBinaryPath(): Promise<string> {
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp'
  const cwd = process.cwd()

  // On Linux/serverless (AWS Lambda / Vercel), /tmp is the only writable & executable path
  const targetPath = isWin
    ? path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', binaryName)
    : path.join('/tmp', binaryName)

  if (existsSync(targetPath)) {
    if (!isWin) {
      try {
        chmodSync(targetPath, 0o755)
      } catch {}
    }
    return targetPath
  }

  const candidatePaths = [
    process.env.YOUTUBE_DL_PATH,
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', binaryName),
    path.join(cwd, '.next', 'server', 'node_modules', 'youtube-dl-exec', 'bin', binaryName),
    path.join(cwd, 'bin', binaryName),
    path.resolve(__dirname, '..', 'bin', binaryName),
    path.resolve(__dirname, '..', '..', 'bin', binaryName),
    path.resolve(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', binaryName)
  ].filter(Boolean) as string[]

  for (const cand of candidatePaths) {
    if (existsSync(cand)) {
      if (isWin) return cand
      try {
        copyFileSync(cand, targetPath)
        chmodSync(targetPath, 0o755)
        return targetPath
      } catch (err) {
        console.warn('[YouTube Extractor] Failed to copy candidate binary to /tmp:', err)
      }
    }
  }

  // Standalone fallback download on Linux/serverless when binary is not in bundle
  if (!isWin) {
    const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
    console.log(`[YouTube Extractor] Downloading standalone Linux binary from ${downloadUrl} to ${targetPath}...`)
    try {
      const res = await fetch(downloadUrl, { redirect: 'follow' })
      if (!res.ok || !res.body) {
        throw new Error(`Failed to download yt-dlp binary: HTTP ${res.status}`)
      }
      const fileStream = createWriteStream(targetPath, { mode: 0o755 })
      await pipeline(res.body as any, fileStream)
      chmodSync(targetPath, 0o755)
      console.log(`[YouTube Extractor] Standalone binary installed successfully at ${targetPath}`)
      return targetPath
    } catch (dlErr) {
      console.error('[YouTube Extractor] Standalone binary download failed:', dlErr)
    }
  }

  return binaryName
}

async function readStreamWithinLimit(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of stream) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += bufferChunk.byteLength
    if (totalBytes > maxBytes) {
      stream.destroy()
      throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
    }
    chunks.push(bufferChunk)
  }

  return Buffer.concat(chunks)
}

async function fetchBufferWithinLimit(
  url: string,
  maxBytes: number,
  customHeaders?: Record<string, string>
): Promise<{ buffer: Buffer; contentType: string }> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(customHeaders || {})
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Stream download failed with status ${response.status}.`)
  }

  const contentType = response.headers.get('content-type') || 'video/mp4'

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (buffer.length > maxBytes) {
      throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
    }
    return { buffer, contentType }
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

  return { buffer: Buffer.concat(chunks), contentType }
}

/**
 * Fallback extractor using legacy @distube/ytdl-core
 */
async function extractWithYtdlCore(urlValue: string, maxBytes: number): Promise<ExtractedYouTubeMedia> {
  const info = await ytdl.getInfo(urlValue)

  let audioFormat: ytdl.videoFormat | undefined
  try {
    audioFormat = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' })
  } catch {
    audioFormat = info.formats.find((format) => format.audioCodec && !format.videoCodec)
  }

  if (!audioFormat) {
    throw new Error('Unable to find a downloadable audio stream for this YouTube link.')
  }

  const mimeType = audioFormat.mimeType?.split(';')[0]?.trim().toLowerCase() || 'audio/mp4'
  const container = audioFormat.container || mimeType.split('/')[1] || 'm4a'
  const baseTitle = sanitizeBaseTitle(info.videoDetails.title || 'youtube-media')
  const displayName = `${baseTitle}.${container}`
  const durationSeconds = Number(info.videoDetails.lengthSeconds) || undefined

  const stream = ytdl.downloadFromInfo(info, {
    filter: 'audioonly',
    quality: audioFormat.itag
  })

  const buffer = await readStreamWithinLimit(stream, maxBytes)

  return {
    buffer,
    mimeType,
    displayName,
    sourceName: baseTitle,
    durationSeconds
  }
}

/**
 * Primary extractor using yt-dlp via youtube-dl-exec.
 * 1. Fetches metadata using robust client fallback combinations.
 * 2. Fetches direct stream URL into memory with the exact matching http_headers (no ffmpeg needed).
 * 3. Falls back to yt-dlp native HTTP download (format: 140/18/ba/b/best, no ffmpeg needed).
 */
async function extractWithYtDlp(urlValue: string, maxBytes: number): Promise<ExtractedYouTubeMedia> {
  const binPath = await ensureBinaryPath()
  const ytDl = youtubedl.create(binPath)
  const ffmpegLoc = getFfmpegPath()

  const CLIENT_COMBINATIONS = [
    'android',
    'android,ios,mweb,tv',
    'ios',
    'mweb',
    'tv',
    'web'
  ]

  let lastError: Error | null = null

  for (const clientCombo of CLIENT_COMBINATIONS) {
    try {
      console.log(`[YouTube Extractor] Requesting metadata using ${clientCombo} (binary: ${binPath})...`)

      const dlpOptions: any = {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        noPlaylist: true,
        geoBypass: true,
        extractorArgs: `youtube:player_client=${clientCombo}`
      }
      if (ffmpegLoc) dlpOptions.ffmpegLocation = ffmpegLoc
      if (process.env.YOUTUBE_COOKIES) dlpOptions.cookies = process.env.YOUTUBE_COOKIES
      if (process.env.YOUTUBE_PROXY) dlpOptions.proxy = process.env.YOUTUBE_PROXY

      const metadata: any = await (ytDl as any)(urlValue, dlpOptions)

      if (metadata?.is_live) {
        throw new Error('Live streams cannot be transcribed until the broadcast concludes.')
      }

      const videoTitle = sanitizeBaseTitle(metadata?.title || 'youtube-media')
      const videoDuration: number | undefined = metadata?.duration || undefined

      // Strategy A: Find direct HTTP stream with audio (Format 18, m4a, opus, etc.)
      const formats: any[] = Array.isArray(metadata?.formats) ? metadata.formats : []
      const audioOnlyFormat = formats.find(
        (f) => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && f.url && f.protocol?.startsWith('http')
      )
      const combinedFormat = formats.find(
        (f) => f.acodec && f.acodec !== 'none' && f.url && f.protocol?.startsWith('http')
      )
      const directFormat = audioOnlyFormat || combinedFormat

      if (directFormat?.url) {
        console.log(`[YouTube Extractor] Found direct stream format ${directFormat.format_id} (${directFormat.ext}). Fetching in-memory with matching headers...`)
        try {
          const { buffer, contentType } = await fetchBufferWithinLimit(
            directFormat.url,
            maxBytes,
            directFormat.http_headers
          )

          const isAudioOnly = !directFormat.vcodec || directFormat.vcodec === 'none'
          const mimeType = isAudioOnly ? 'audio/mp4' : (contentType.includes('video') ? 'video/mp4' : 'audio/mp4')
          const ext = isAudioOnly ? 'm4a' : 'mp4'

          return {
            buffer,
            mimeType,
            displayName: `${videoTitle}.${ext}`,
            sourceName: videoTitle,
            durationSeconds: videoDuration
          }
        } catch (streamErr) {
          console.warn(`[YouTube Extractor] Direct stream URL fetch failed (${clientCombo}), attempting native download...`, streamErr)
        }
      }

      // Strategy B: Native file download via yt-dlp
      console.log(`[YouTube Extractor] Downloading stream via yt-dlp native downloader (${clientCombo})...`)
      const tempDir = os.tmpdir()
      const uniqueId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const outputTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`)

      try {
        const downloadOptions: any = {
          format: '140/18/ba/b/best',
          output: outputTemplate,
          noCheckCertificates: true,
          noWarnings: true,
          noPlaylist: true,
          geoBypass: true,
          extractorArgs: `youtube:player_client=${clientCombo}`
        }
        if (ffmpegLoc) downloadOptions.ffmpegLocation = ffmpegLoc
        if (process.env.YOUTUBE_COOKIES) downloadOptions.cookies = process.env.YOUTUBE_COOKIES
        if (process.env.YOUTUBE_PROXY) downloadOptions.proxy = process.env.YOUTUBE_PROXY

        await (ytDl as any)(urlValue, downloadOptions)

        const files = await fs.readdir(tempDir)
        const targetFile = files.find((f) => f.startsWith(uniqueId))

        if (targetFile) {
          const fullPath = path.join(tempDir, targetFile)
          const stats = await fs.stat(fullPath)
          if (stats.size > maxBytes) {
            await fs.unlink(fullPath).catch(() => {})
            throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
          }

          const buffer = await fs.readFile(fullPath)
          await fs.unlink(fullPath).catch(() => {})

          const ext = path.extname(targetFile).slice(1) || 'mp4'
          const mimeType = ext === 'm4a' || ext === 'mp3' ? 'audio/mp4' : 'video/mp4'

          return {
            buffer,
            mimeType,
            displayName: `${videoTitle}.${ext}`,
            sourceName: videoTitle,
            durationSeconds: videoDuration
          }
        }
      } catch (dlErr) {
        console.warn(`[YouTube Extractor] Native download failed for ${clientCombo}:`, dlErr)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? (err as any).stderr || err.message : String(err)
      console.warn(`[YouTube Extractor] Client ${clientCombo} attempt failed:`, errorMsg.split('\n')[0])
      lastError = err instanceof Error ? err : new Error(errorMsg)
    }
  }

  throw lastError || new Error('YouTube extraction failed across all player clients.')
}

export function isValidYouTubeUrl(urlStr: string): boolean {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return false
  const trimmed = urlStr.trim()
  if (trimmed.startsWith('-')) return false // Prevent CLI option injection

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be'
    )
  } catch {
    return false
  }
}

/**
 * Fast direct subtitle/automatic-caption extractor.
 * Queries YouTube video metadata for official json3 timedtext tracks.
 * Bypasses raw media downloads and returns structured verbatim transcript with timestamps in < 3s.
 * Returns null if no captions/subtitles are found, allowing graceful fallback to media extraction.
 */
export async function extractYouTubeTranscript(
  urlValue: string,
  languagePreference: string = 'auto'
): Promise<YouTubeTranscriptResult | null> {
  if (!isValidYouTubeUrl(urlValue)) {
    throw new Error('Invalid YouTube video URL.')
  }

  const binPath = await ensureBinaryPath()
  const ytDl = youtubedl.create(binPath)
  const ffmpegLoc = getFfmpegPath()

  const CLIENT_COMBINATIONS = ['android', 'ios', 'mweb', 'web']

  for (const clientCombo of CLIENT_COMBINATIONS) {
    try {
      console.log(`[YouTube Subtitles] Probing caption tracks using ${clientCombo}...`)
      const options: any = {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        noPlaylist: true,
        geoBypass: true,
        extractorArgs: `youtube:player_client=${clientCombo}`
      }
      if (ffmpegLoc) options.ffmpegLocation = ffmpegLoc
      if (process.env.YOUTUBE_COOKIES) options.cookies = process.env.YOUTUBE_COOKIES
      if (process.env.YOUTUBE_PROXY) options.proxy = process.env.YOUTUBE_PROXY

      const meta: any = await (ytDl as any)(urlValue, options)

      if (meta?.is_live) {
        throw new Error('Live streams cannot be transcribed until the broadcast concludes.')
      }

      const duration = Number(meta?.duration) || 0
      const videoTitle = sanitizeBaseTitle(meta?.title || 'youtube-media')
      const subtitles = meta?.subtitles || {}
      const autoCaptions = meta?.automatic_captions || {}

      const findCaptionTrack = (tracks: any) => {
        if (!tracks || typeof tracks !== 'object') return null
        const langKeys = Object.keys(tracks)
        if (!langKeys.length) return null

        let targetLang: string | undefined
        if (languagePreference === 'khmer') {
          targetLang = langKeys.find((l) => l.startsWith('km') || l.startsWith('kh'))
        } else if (languagePreference === 'english') {
          targetLang = langKeys.find((l) => l.startsWith('en'))
        }

        if (!targetLang) {
          targetLang =
            langKeys.find((l) => l.startsWith('km')) ||
            langKeys.find((l) => l.startsWith('en')) ||
            langKeys[0]
        }

        const formats = tracks[targetLang]
        if (!Array.isArray(formats) || !formats.length) return null

        const json3 = formats.find((f: any) => f.ext === 'json3')
        const selectedFormat = json3 || formats[0]

        return {
          lang: targetLang,
          url: selectedFormat?.url
        }
      }

      // Check manual subtitles first (creator provided, highest quality), then automatic ASR captions
      const selected = findCaptionTrack(subtitles) || findCaptionTrack(autoCaptions)
      if (!selected || !selected.url) {
        continue // Try next client combination if captions dictionary was missing
      }

      let fetchUrl = selected.url
      if (!fetchUrl.includes('fmt=json3') && !fetchUrl.includes('.json3')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=json3'
      }

      console.log(`[YouTube Subtitles] Fetching timedtext (${selected.lang})...`)
      const captionRes = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (!captionRes.ok) {
        console.warn(`[YouTube Subtitles] Failed to fetch timedtext: HTTP ${captionRes.status}`)
        continue
      }

      const data = await captionRes.json()
      const rawEvents = Array.isArray(data.events) ? data.events : []
      const rawSegments: Array<{ start: number; end: number; text: string }> = []
      const textPieces: string[] = []

      for (const ev of rawEvents) {
        if (!ev.segs || !Array.isArray(ev.segs)) continue

        const segText = ev.segs
          .map((s: any) => s.utf8 || '')
          .join('')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/^>>\s*/, '')
          .replace(/\n+/g, ' ')
          .trim()

        if (!segText || segText === '\n') continue

        const start = Math.round(((ev.tStartMs || 0) / 1000) * 100) / 100
        const dur = Math.round(((ev.dDurationMs || 0) / 1000) * 100) / 100
        const end = Math.round((start + dur) * 100) / 100

        rawSegments.push({ start, end, text: segText })
        textPieces.push(segText)
      }

      if (!rawSegments.length) {
        continue
      }

      const segments = normalizeTranscriptSegments(rawSegments)
      const fullText = textPieces.join(' ').replace(/\s{2,}/g, ' ').trim()
      const normalizedLang = selected.lang.startsWith('km')
        ? 'khmer'
        : selected.lang.startsWith('en')
          ? 'english'
          : selected.lang.split('-')[0]

      const finalDuration =
        duration > 0
          ? duration
          : segments.length > 0 && typeof segments[segments.length - 1].end === 'number'
            ? (segments[segments.length - 1].end as number)
            : 0

      console.log(`[YouTube Subtitles] Successfully extracted ${segments.length} segments for "${videoTitle}"`)

      return {
        text: fullText,
        segments,
        language: normalizedLang,
        duration: finalDuration,
        sourceName: videoTitle,
        displayName: `${videoTitle}.txt`
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? (err as any).stderr || err.message : String(err)
      console.warn(`[YouTube Subtitles] Client ${clientCombo} probe warning:`, errorMsg.split('\n')[0])
    }
  }

  console.log('[YouTube Subtitles] No subtitles or captions found across all clients. Falling back to media extraction.')
  return null
}

/**
 * Main entrypoint for extracting media from a YouTube link.
 * Tries yt-dlp first with client rotation & direct stream fetching,
 * then falls back to ytdl-core.
 */
export async function extractYouTubeMedia(
  urlValue: string,
  maxBytes: number = MAX_MEDIA_UPLOAD_BYTES
): Promise<ExtractedYouTubeMedia> {
  if (!isValidYouTubeUrl(urlValue)) {
    throw new Error('Invalid YouTube video URL.')
  }

  try {
    return await extractWithYtDlp(urlValue, maxBytes)
  } catch (ytDlpError) {
    console.warn('[YouTube Extractor] Primary yt-dlp extraction failed, trying fallback extractor...', ytDlpError)

    try {
      return await extractWithYtdlCore(urlValue, maxBytes)
    } catch (fallbackError) {
      const ytDlpMsg = ytDlpError instanceof Error ? ytDlpError.message : String(ytDlpError)
      const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)

      console.error('[YouTube Extractor] Both yt-dlp and fallback extractors failed.', {
        ytDlp: ytDlpMsg,
        fallback: fallbackMsg
      })

      // Preserve specific limit or live status messages
      if (ytDlpMsg.includes('exceeds the') || ytDlpMsg.includes('Live streams cannot')) {
        throw new Error(ytDlpMsg)
      }

      throw new Error(
        'Unable to extract media from this YouTube link right now. Try another public video, upload the file directly, or paste a direct audio/video URL.'
      )
    }
  }
}
