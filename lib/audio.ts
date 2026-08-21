import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

// Audio settings tuned for speech transcription. Mono + 16kHz is what speech
// recognition models expect. Opus at a low bitrate keeps speech clear while
// producing a much smaller file than MP3 — faster uploads and fewer tokens.
const TARGET_CHANNELS = 1
const TARGET_SAMPLE_RATE = 16000
const TARGET_BITRATE = '24k'
const TARGET_CODEC = 'libopus'
const TARGET_FORMAT = 'ogg'
const TARGET_EXTENSION = 'ogg'
const TARGET_MIME_TYPE = 'audio/ogg'
const EXTRACTION_TIMEOUT_MS = 300000

export type ExtractedAudio = {
  buffer: Buffer
  mimeType: string
  displayName: string
  durationSeconds: number
}

export type AudioChunk = {
  buffer: Buffer
  mimeType: string
  displayName: string
  /** Offset of this chunk from the start of the full recording, in seconds. */
  startOffsetSeconds: number
}

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType.startsWith('video/')) {
    return mimeType.split('/')[1]?.split(';')[0] || 'mp4'
  }

  const audioExtensions: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'webm'
  }

  return audioExtensions[mimeType] || 'bin'
}

function replaceExtension(name: string, extension: string) {
  const base = name.replace(/\.[^./\\]+$/, '')
  return `${base || 'audio'}.${extension}`
}

// ffmpeg prints the input media duration to stderr as "Duration: HH:MM:SS.ms".
// We scan for it as stderr streams so we can report real transcription progress
// later (segment end time / total duration).
function parseDurationFromStderr(text: string): number | null {
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const total = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) ? total : null
}

function runFfmpeg(args: string[], timeoutMs: number) {
  return new Promise<{ durationSeconds: number }>((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg binary is not available.'))
      return
    }

    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderrTail = ''
    let durationSeconds = 0

    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          child.kill()
        } else {
          child.kill('SIGKILL')
        }
      } catch {
        // Child might have already exited.
      }
      reject(new Error(`ffmpeg timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`))
    }, timeoutMs)

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      stderrTail += text

      if (!durationSeconds) {
        const parsed = parseDurationFromStderr(stderrTail)
        if (parsed) {
          durationSeconds = parsed
        }
      }

      // Keep only the tail so a long run does not grow memory unbounded.
      if (stderrTail.length > 8192) {
        stderrTail = stderrTail.slice(-8192)
      }
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ durationSeconds })
        return
      }
      reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail.trim()}`))
    })
  })
}

/**
 * Extracts a compact, speech-optimized audio track (mono 16kHz MP3) from any
 * audio or video input. For video this drops the picture entirely; for audio it
 * downmixes and downsamples. The result is dramatically smaller than the source,
 * which speeds up the Gemini upload and reduces token usage on the free tier.
 *
 * If extraction fails for any reason, the original media is returned unchanged so
 * transcription can still proceed.
 */
export async function extractSpeechAudio(input: {
  buffer: Buffer
  mimeType: string
  displayName: string
}): Promise<ExtractedAudio> {
  const fallback: ExtractedAudio = {
    buffer: input.buffer,
    mimeType: input.mimeType,
    displayName: input.displayName,
    durationSeconds: 0
  }

  if (!ffmpegPath) {
    console.warn('ffmpeg binary not found; uploading original media without audio extraction.')
    return fallback
  }

  const workDir = await mkdtemp(join(tmpdir(), 'transcript-audio-'))
  const inputExtension = getExtensionFromMimeType(input.mimeType)
  const inputPath = join(workDir, `input.${inputExtension}`)
  const outputPath = join(workDir, `output.${TARGET_EXTENSION}`)

  try {
    await writeFile(inputPath, input.buffer)

    // Note: we use the default (info) log level rather than "error" so ffmpeg
    // prints the input Duration line, which we parse for real progress reporting.
    const { durationSeconds } = await runFfmpeg(
      [
        '-hide_banner',
        '-i', inputPath,
        '-vn', // drop any video track
        '-ac', String(TARGET_CHANNELS),
        '-ar', String(TARGET_SAMPLE_RATE),
        '-c:a', TARGET_CODEC,
        '-b:a', TARGET_BITRATE,
        '-f', TARGET_FORMAT,
        '-y',
        outputPath
      ],
      EXTRACTION_TIMEOUT_MS
    )

    const audioBuffer = await readFile(outputPath)

    if (!audioBuffer.byteLength) {
      console.warn('ffmpeg produced an empty audio file; falling back to original media.')
      return fallback
    }

    return {
      buffer: audioBuffer,
      mimeType: TARGET_MIME_TYPE,
      displayName: replaceExtension(input.displayName, TARGET_EXTENSION),
      durationSeconds
    }
  } catch (error) {
    console.warn('Audio extraction failed; uploading original media instead:', error)
    return fallback
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Splits already-extracted speech audio into fixed-length chunks so they can be
 * transcribed in parallel. Each chunk carries its exact start offset so the caller can
 * shift the returned timestamps back onto the full recording's timeline.
 *
 * Returns an empty array if splitting fails, so the caller can fall back to
 * transcribing the whole file in one request.
 */
export async function splitAudioIntoChunks(
  audio: { buffer: Buffer; displayName: string },
  chunkSeconds: number
): Promise<AudioChunk[]> {
  if (!ffmpegPath || chunkSeconds <= 0) {
    return []
  }

  const workDir = await mkdtemp(join(tmpdir(), 'transcript-chunks-'))
  const inputPath = join(workDir, `input.${TARGET_EXTENSION}`)
  const listPath = join(workDir, 'list.csv')

  try {
    await writeFile(inputPath, audio.buffer)

    // -f segment splits the input into numbered files of chunkSeconds each.
    // -segment_list outputs exact segment start timestamps to avoid drift.
    await runFfmpeg(
      [
        '-hide_banner',
        '-i', inputPath,
        '-vn',
        '-ac', String(TARGET_CHANNELS),
        '-ar', String(TARGET_SAMPLE_RATE),
        '-c:a', TARGET_CODEC,
        '-b:a', TARGET_BITRATE,
        '-f', 'segment',
        '-segment_time', String(chunkSeconds),
        '-segment_list', listPath,
        '-segment_list_type', 'csv',
        '-reset_timestamps', '1',
        '-y',
        join(workDir, `chunk-%03d.${TARGET_EXTENSION}`)
      ],
      EXTRACTION_TIMEOUT_MS
    )

    const names = (await readdir(workDir))
      .filter((name) => name.startsWith('chunk-') && name.endsWith(`.${TARGET_EXTENSION}`))
      .sort()

    const segmentOffsets: Record<string, number> = {}
    try {
      const listContent = await readFile(listPath, 'utf8')
      const lines = listContent.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        const parts = line.split(',')
        if (parts.length >= 2) {
          const chunkName = parts[0].trim()
          const startVal = Number.parseFloat(parts[1].trim())
          if (Number.isFinite(startVal)) {
            segmentOffsets[chunkName] = startVal
          }
        }
      }
    } catch {
      // Fall back to index * chunkSeconds if list parsing encounters any issue.
    }

    const chunks: AudioChunk[] = []
    const baseName = audio.displayName.replace(/\.[^./\\]+$/, '') || 'audio'

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      const buffer = await readFile(join(workDir, name))
      if (!buffer.byteLength) continue

      const startOffsetSeconds = segmentOffsets[name] ?? (index * chunkSeconds)

      chunks.push({
        buffer,
        mimeType: TARGET_MIME_TYPE,
        displayName: `${baseName}-part${index + 1}.${TARGET_EXTENSION}`,
        startOffsetSeconds
      })
    }

    return chunks
  } catch (error) {
    console.warn('Audio chunking failed; will transcribe as a single file:', error)
    return []
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
