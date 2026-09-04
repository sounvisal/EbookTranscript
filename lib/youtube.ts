import youtubedl from 'youtube-dl-exec'
import ffmpegPath from 'ffmpeg-static'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs/promises'
import { existsSync, chmodSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'

export type ExtractedYouTubeMedia = {
  buffer: Buffer
  mimeType: string
  displayName: string
  sourceName: string
  durationSeconds?: number
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
 */
function getBinaryPath(): string {
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const cwd = process.cwd()

  const candidatePaths = [
    process.env.YOUTUBE_DL_PATH,
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', binaryName),
    path.join(cwd, '.next', 'server', 'node_modules', 'youtube-dl-exec', 'bin', binaryName),
    path.join(cwd, 'bin', binaryName),
    path.resolve(__dirname, '..', 'bin', binaryName),
    path.resolve(__dirname, '..', '..', 'bin', binaryName),
    path.resolve(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', binaryName)
  ].filter(Boolean) as string[]

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      if (process.platform !== 'win32') {
        try {
          chmodSync(candidate, 0o755)
        } catch {
          // Ignore chmod error if already executable or read-only
        }
      }
      return candidate
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

async function fetchBufferWithinLimit(url: string, maxBytes: number): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36'
    }
  })

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
 * First tries direct HTTP stream URL download into memory (super fast & no ffmpeg needed),
 * then falls back to full binary download if direct streaming is restricted.
 */
async function extractWithYtDlp(urlValue: string, maxBytes: number): Promise<ExtractedYouTubeMedia> {
  const binPath = getBinaryPath()
  const ytDl = youtubedl.create(binPath)

  // Priority order of YouTube player clients known to bypass bot challenges
  const CLIENTS = ['android', 'ios', 'mweb', 'tv']
  let lastError: Error | null = null

  for (const client of CLIENTS) {
    try {
      console.log(`[YouTube Extractor] Requesting metadata using ${client} client (binary: ${binPath})...`)

      const metadata: any = await (ytDl as any)(urlValue, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        extractorArgs: `youtube:player_client=${client}`
      })

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
        console.log(`[YouTube Extractor] Found direct stream format ${directFormat.format_id} (${directFormat.ext}). Fetching in-memory...`)
        const { buffer, contentType } = await fetchBufferWithinLimit(directFormat.url, maxBytes)

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
      }

      // Strategy B: Fall back to local file download via yt-dlp
      console.log(`[YouTube Extractor] Direct URL unavailable for ${client}. Falling back to file download...`)
      const tempDir = os.tmpdir()
      const uniqueId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const outputTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`)
      const expectedAudioFile = path.join(tempDir, `${uniqueId}.m4a`)

      try {
        await (ytDl as any)(urlValue, {
          extractAudio: true,
          audioFormat: 'm4a',
          audioQuality: 5,
          output: outputTemplate,
          ffmpegLocation: ffmpegPath || undefined,
          noCheckCertificates: true,
          noWarnings: true,
          extractorArgs: `youtube:player_client=${client}`
        })

        if (existsSync(expectedAudioFile)) {
          const stats = await fs.stat(expectedAudioFile)
          if (stats.size > maxBytes) {
            throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
          }

          const buffer = await fs.readFile(expectedAudioFile)
          return {
            buffer,
            mimeType: 'audio/mp4',
            displayName: `${videoTitle}.m4a`,
            sourceName: videoTitle,
            durationSeconds: videoDuration
          }
        }
      } finally {
        if (existsSync(expectedAudioFile)) {
          await fs.unlink(expectedAudioFile).catch(() => {})
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? (err as any).stderr || err.message : String(err)
      console.warn(`[YouTube Extractor] Client ${client} attempt failed:`, errorMsg.split('\n')[0])
      lastError = err instanceof Error ? err : new Error(errorMsg)
    }
  }

  throw lastError || new Error('YouTube extraction failed across all player clients.')
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
  try {
    return await extractWithYtDlp(urlValue, maxBytes)
  } catch (ytDlpError) {
    console.warn('[YouTube Extractor] Primary yt-dlp extraction failed, trying fallback extractor...', ytDlpError)

    try {
      return await extractWithYtdlCore(urlValue, maxBytes)
    } catch (fallbackError) {
      console.error('[YouTube Extractor] Both yt-dlp and fallback extractors failed.', {
        ytDlp: ytDlpError instanceof Error ? ytDlpError.message : ytDlpError,
        fallback: fallbackError instanceof Error ? fallbackError.message : fallbackError
      })

      // If error already carries a user-friendly limit or live status message, preserve it
      const originalMessage = ytDlpError instanceof Error ? ytDlpError.message : ''
      if (
        originalMessage.includes('exceeds the') ||
        originalMessage.includes('Live streams cannot')
      ) {
        throw new Error(originalMessage)
      }

      throw new Error(
        'Unable to extract media from this YouTube link right now. Try another public video, upload the file directly, or paste a direct audio/video URL.'
      )
    }
  }
}
