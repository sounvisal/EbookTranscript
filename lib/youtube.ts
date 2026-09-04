import youtubedl from 'youtube-dl-exec'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs/promises'
import { existsSync, chmodSync, copyFileSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
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

  const CLIENT_COMBINATIONS = [
    'android,ios,mweb,tv',
    'android',
    'ios',
    'mweb',
    'tv',
    'web'
  ]

  let lastError: Error | null = null

  for (const clientCombo of CLIENT_COMBINATIONS) {
    try {
      console.log(`[YouTube Extractor] Requesting metadata using ${clientCombo} (binary: ${binPath})...`)

      const metadata: any = await (ytDl as any)(urlValue, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        noPlaylist: true,
        geoBypass: true,
        extractorArgs: `youtube:player_client=${clientCombo}`
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

      // Strategy B: Native file download via yt-dlp without invoking ffmpeg
      console.log(`[YouTube Extractor] Downloading stream via yt-dlp native downloader (${clientCombo})...`)
      const tempDir = os.tmpdir()
      const uniqueId = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const outputTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`)

      try {
        await (ytDl as any)(urlValue, {
          format: '140/18/ba/b/best',
          output: outputTemplate,
          noCheckCertificates: true,
          noWarnings: true,
          noPlaylist: true,
          geoBypass: true,
          extractorArgs: `youtube:player_client=${clientCombo}`
        })

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
