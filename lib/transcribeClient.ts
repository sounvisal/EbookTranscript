import { MAX_INLINE_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_BYTES } from '@/lib/uploadLimits'
import { recoverPendingMedia, savePendingMedia } from '@/lib/mediaStorage'
import type { TranscriptSegment } from '@/lib/transcript'
import { prepareMediaForUpload } from '@/lib/clientAudio'
import { useTranscriptStore } from '@/store/transcriptStore'

export type TranscribeProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number; message?: string }
  | { type: 'progress'; progress: number }

export type TranscribeResult = {
  id?: string
  alreadySaved?: boolean
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
  cacheId?: string
}

type TranscriptionJob = {
  status: 'queued' | 'running' | 'interrupted' | 'complete' | 'failed'
  progress: number
  error?: string
  transcriptId?: string
  result?: TranscribeResult
}

class BackgroundJobsUnavailable extends Error {}

async function requestTranscriptionJob(payload: object): Promise<string> {
  const response = await fetch('/api/transcribe/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    if (response.status === 503 && data?.code === 'DATABASE_MIGRATION_REQUIRED') {
      throw new BackgroundJobsUnavailable(data.error)
    }
    throw new Error(data?.error || `Unable to start transcription (HTTP ${response.status}).`)
  }
  return (await response.json()).id
}

export async function resumeTranscriptionJob(
  id: string,
  onEvent?: (event: TranscribeProgressEvent) => void,
  signal?: AbortSignal
) {
  await requestTranscriptionJob({ id })
  return waitForTranscriptionJob(id, onEvent, signal)
}

async function waitForTranscriptionJob(
  id: string,
  onEvent?: (event: TranscribeProgressEvent) => void,
  signal?: AbortSignal
): Promise<TranscribeResult> {
  const deadline = Date.now() + 12 * 60 * 1000
  let resumed = false
  while (Date.now() < deadline) {
    const response = await fetch(`/api/transcribe/jobs?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal })
    if (!response.ok) throw new Error(await readError(response, 'Open Recent jobs to reconnect.'))
    const job: TranscriptionJob = await response.json()
    if (job.status === 'complete' && job.transcriptId && job.result) {
      return { ...job.result, id: job.transcriptId, alreadySaved: true }
    }
    if (job.status === 'failed') throw new Error(job.error || 'Transcription timed out. Please upload the file again.')
    if (job.status === 'interrupted' && !resumed) {
      resumed = true
      await requestTranscriptionJob({ id })
    }
    onEvent?.({ type: 'progress', progress: job.progress })
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Transcription is still in progress. Open Recent jobs to reconnect.')
}

type StreamEvent =
  | TranscribeProgressEvent
  | ({ type: 'result' } & TranscribeResult)
  | { type: 'error'; error: string }

/**
 * Uploads a file directly to Gemini Files API from the browser.
 * This bypasses Vercel Serverless 4.5MB request body limits completely (supporting files up to 2GB).
 */
function inferMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') {
    if (file.type === 'audio/mp3') return 'audio/mpeg'
    return file.type
  }
  const ext = file.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'txt': return 'text/plain'
    case 'md': return 'text/markdown'
    case 'csv': return 'text/csv'
    case 'json': return 'application/json'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
      return 'audio/mp4'
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'ogg':
      return 'audio/ogg'
    case 'avi':
      return 'video/x-msvideo'
    case 'mkv':
      return 'video/x-matroska'
    default:
      return file.type || 'video/mp4'
  }
}


/**
 * Directly streams a media file to Google's authorized Resumable Upload URL.
 * Bypasses Vercel Serverless 4.5MB request body limit completely (supports files up to 2GB).
 * Uses 'upload, finalize' in a single stream, avoiding Google's 8MB intermediate chunk granularity requirement.
 */
async function uploadToResumableUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl, true)
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0')
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize')

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.file?.uri) {
            resolve(res.file)
            return
          }
        } catch {}
      }
      try {
        const res = JSON.parse(xhr.responseText)
        reject(new Error(res.error?.message || `Upload failed with status ${xhr.status}`))
      } catch {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => {
      reject(new Error(`Direct Google storage upload failed (status ${xhr.status || 0}). Check your internet connection or browser ad blocker.`))
    }

    xhr.send(file)
  })
}

async function uploadViaServerProxy(uploadToken: string, file: File) {
  const response = await fetch('/api/upload-proxy', {
    method: 'POST',
    headers: { 'x-upload-token': uploadToken },
    body: file
  })
  if (!response.ok) throw new Error(await readError(response, 'Failed to upload media.'))
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  return data?.error || fallback
}

/** Reserve and upload a file for a transcription or summary request. */
export async function uploadMediaForProcessing(
  file: File,
  purpose: 'transcription' | 'report',
  onProgress?: (progress: number) => void,
  preferredKeyIndex?: number
): Promise<string> {
  if (!file.size || file.size > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error('Choose a file within the supported upload size.')
  }
  const requestSession = async () => {
    const response = await fetch('/api/upload-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: inferMimeType(file),
        fileSize: file.size,
        purpose,
        preferredKeyIndex
      })
    })
    if (!response.ok) throw new Error(await readError(response, 'Unable to start the upload.'))
    return await response.json() as { uploadUrl: string; uploadToken: string }
  }

  const session = await requestSession()
  try {
    await uploadToResumableUrl(session.uploadUrl, file, onProgress)
    return session.uploadToken
  } catch {
    if (file.size > MAX_INLINE_UPLOAD_BYTES) {
      throw new Error('Direct upload to Google failed. Check your connection or try another network, or upload a smaller file.')
    }
    // The first upload may already have reached Google. Use a fresh session for the fallback.
    const proxySession = await requestSession()
    await uploadViaServerProxy(proxySession.uploadToken, file)
    onProgress?.(99)
    return proxySession.uploadToken
  }
}

import type { AdvancedOptions } from '@/store/transcriptStore'

/**
 * Reads newline-delimited JSON stream from /api/transcribe and emits progress & results.
 */
async function readTranscriptionStream(
  body: ReadableStream<Uint8Array>,
  onEvent?: (event: TranscribeProgressEvent) => void
): Promise<TranscribeResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: TranscribeResult | null = null
  let errorMessage = ''
  let chunkCount = 0

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let event: StreamEvent
    try {
      event = JSON.parse(trimmed) as StreamEvent
    } catch {
      return
    }

    chunkCount++
    if (event.type === 'result') {
      const { type: _type, ...rest } = event
      result = rest
    } else if (event.type === 'error') {
      errorMessage = event.error
    } else {
      onEvent?.(event)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
    }
  }

  if (buffer.trim()) {
    handleLine(buffer)
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  if (!result) {
    throw new Error(
      errorMessage ||
      (chunkCount > 0
        ? 'Transcription stream ended unexpectedly before completion. Please check your network connection and try again.'
        : 'Transcription stream disconnected. Please check your network and try again.')
    )
  }

  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('signal_admin_sync')
      bc.postMessage({ type: 'transcription_completed', time: Date.now() })
      bc.close()
    }
  } catch {}

  return result
}

export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void,
  options?: AdvancedOptions,
  preferredKeyIndex?: number
): Promise<TranscribeResult> {
  if (!input.file) throw new Error('Please select an audio or video file to transcribe.')
  if (input.file.size > MAX_MEDIA_UPLOAD_BYTES) throw new Error('This file exceeds the supported upload size.')
  const accountId = useTranscriptStore.getState().accountId

  onEvent?.({ type: 'status', phase: 'uploading' })
  let file = input.file
  let duration = 0
  try {
    // The preparation function bounds video decoding independently of the HTTP body limit.
    const prepared = await prepareMediaForUpload(file)
    file = prepared.file
    duration = prepared.duration
    if (file !== input.file && useTranscriptStore.getState().file === input.file) {
      useTranscriptStore.getState().setAudioBlob(file)
    }
  } catch {
    file = input.file
  }

  if (file.size <= MAX_INLINE_UPLOAD_BYTES && duration < 150) {
    const formData = new FormData()
    formData.append('file', file, input.file.name)
    if (duration > 0) formData.append('duration', String(duration))
    if (options) formData.append('options', JSON.stringify(options))
    if (typeof preferredKeyIndex === 'number') formData.append('keyIndex', String(preferredKeyIndex))

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'x-stream': '1' },
      body: formData
    })
    if (response.ok && response.body) return readTranscriptionStream(response.body, onEvent)
    if (response.status !== 413) {
      throw new Error(await readError(response, `Transcription request failed (${response.status}).`))
    }
  }

  const uploadToken = await uploadMediaForProcessing(file, 'transcription', (progress) => {
    onEvent?.({ type: 'progress', progress })
  }, preferredKeyIndex)
  onEvent?.({ type: 'status', phase: 'processing', duration })
  let id: string
  try {
    id = await requestTranscriptionJob({ uploadToken, duration, options })
  } catch (error) {
    if (!(error instanceof BackgroundJobsUnavailable)) throw error
    // Only fall back when the server confirms no job could have been created.
    // Send the signed reference, never the large file, through the function.
    onEvent?.({ type: 'status', phase: 'processing', message: 'Keep this tab open until transcription finishes.' })
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-stream': '1' },
      body: JSON.stringify({ uploadToken, duration, options })
    })
    if (!response.ok || !response.body) {
      throw new Error(await readError(response, `Transcription request failed (${response.status}).`))
    }
    return readTranscriptionStream(response.body, onEvent)
  }
  if (accountId) await savePendingMedia(accountId, id, input.file).catch(() => {})
  const result = await waitForTranscriptionJob(id, onEvent)
  if (accountId && result.id) await recoverPendingMedia(accountId, id, result.id).catch(() => {})
  return result
}
