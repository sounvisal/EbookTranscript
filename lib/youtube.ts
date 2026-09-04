import youtubedl from 'youtube-dl-exec'
import ffmpegPath from 'ffmpeg-static'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
 * Primary extractor using yt-dlp via youtube-dl-exec
 */
async function extractWithYtDlp(urlValue: string, maxBytes: number): Promise<ExtractedYouTubeMedia> {
  const tempDir = os.tmpdir()
  const uniqueId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const outputTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`)
  const expectedAudioFile = path.join(tempDir, `${uniqueId}.m4a`)

  // Priority order of YouTube player clients known to bypass bot challenges
  const CLIENTS = ['android', 'ios', 'mweb', 'tv']
  let lastError: Error | null = null
  let downloadedSuccess = false
  let videoTitle = 'youtube-media'
  let videoDuration: number | undefined

  for (const client of CLIENTS) {
    try {
      console.log(`[YouTube Extractor] Attempting extraction with client: ${client}`)

      // 1. Fetch metadata first to validate duration and live status
      const metadata: any = await (youtubedl as any)(urlValue, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        extractorArgs: `youtube:player_client=${client}`
      })

      if (metadata?.is_live) {
        throw new Error('Live streams cannot be transcribed until the broadcast concludes.')
      }

      videoTitle = sanitizeBaseTitle(metadata?.title || 'youtube-media')
      videoDuration = metadata?.duration || undefined

      // 2. Download and extract audio to high efficiency AAC (.m4a)
      await (youtubedl as any)(urlValue, {
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
        downloadedSuccess = true
        break
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? (err as any).stderr || err.message : String(err)
      console.warn(`[YouTube Extractor] Client ${client} failed:`, errorMsg.split('\n')[0])
      lastError = err instanceof Error ? err : new Error(errorMsg)
    }
  }

  if (!downloadedSuccess || !existsSync(expectedAudioFile)) {
    throw lastError || new Error('YouTube audio download failed across all player clients.')
  }

  try {
    const stats = await fs.stat(expectedAudioFile)
    if (stats.size > maxBytes) {
      throw new Error(`Remote media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`)
    }

    const buffer = await fs.readFile(expectedAudioFile)
    const displayName = `${videoTitle}.m4a`

    return {
      buffer,
      mimeType: 'audio/mp4',
      displayName,
      sourceName: videoTitle,
      durationSeconds: videoDuration
    }
  } finally {
    // Ensure temporary audio file is always deleted
    if (existsSync(expectedAudioFile)) {
      await fs.unlink(expectedAudioFile).catch(() => {})
    }
  }
}

/**
 * Main entrypoint for extracting media from a YouTube link.
 * Tries yt-dlp first with client rotation, then falls back to ytdl-core.
 */
export async function extractYouTubeMedia(
  urlValue: string,
  maxBytes: number = MAX_MEDIA_UPLOAD_BYTES
): Promise<ExtractedYouTubeMedia> {
  try {
    return await extractWithYtDlp(urlValue, maxBytes)
  } catch (ytDlpError) {
    console.warn('[YouTube Extractor] yt-dlp extraction failed, trying fallback extractor...', ytDlpError)

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
