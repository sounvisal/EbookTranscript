import type { TranscriptSegment } from '@/lib/transcript'
import { prepareMediaForUpload } from '@/lib/clientAudio'
import { useTranscriptStore } from '@/store/transcriptStore'

export type TranscribeProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number; message?: string }
  | { type: 'progress'; progress: number }

export type TranscribeResult = {
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
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
 * Uploads a file directly to Gemini Files API from the browser.
 * This bypasses Vercel Serverless 4.5MB request body limits completely (supporting files up to 2GB).
 */
async function directUploadToGemini(
  file: File,
  apiKey: string,
  host: string,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  const mimeType = inferMimeType(file)
  const boundary = '----GeminiBoundary' + Math.random().toString(16).slice(2)
  const metadata = JSON.stringify({
    file: {
      mimeType,
      displayName: file.name
    }
  })

  const preamble = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  const epilogue = `\r\n--${boundary}--`

  const bodyBlob = new Blob([preamble, file, epilogue], {
    type: `multipart/related; boundary=${boundary}`
  })

  // Route through /gemini-proxy so requests originate from Vercel's US/EU edge (bypassing client geo-restrictions)
  const isBrowser = typeof window !== 'undefined'
  const uploadUrl = isBrowser ? '/gemini-proxy/upload/v1beta/files' : `https://${host}/upload/v1beta/files`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl, true)
    xhr.setRequestHeader('x-goog-api-client', 'transcript-client/1.0')
    xhr.setRequestHeader('x-goog-api-key', apiKey)
    xhr.setRequestHeader('X-Goog-Upload-Protocol', 'multipart')
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`)

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.file) {
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
      reject(new Error('Network error during file upload.'))
    }

    xhr.send(bodyBlob)
  })
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

/**
 * Server Upload Proxy fallback (/api/upload-proxy) for environments where direct
 * browser connections to Google are blocked (e.g. strict corporate ad blockers).
 * For files <= 4MB, proxies the entire file in one 'upload, finalize' call.
 */
async function uploadViaServerProxy(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  onProgress?.(15)

  const uploadRes = await fetch('/api/upload-proxy', {
    method: 'POST',
    headers: {
      'x-upload-url': uploadUrl,
      'x-upload-offset': '0',
      'x-upload-command': 'upload, finalize'
    },
    body: file
  })

  if (!uploadRes.ok) {
    const errJson = await uploadRes.json().catch(() => null)
    throw new Error(errJson?.error || `Proxy upload failed (${uploadRes.status})`)
  }

  const data = await uploadRes.json().catch(() => ({}))
  if (!data?.file?.uri) {
    throw new Error('Upload proxy completed but failed to register media file.')
  }

  onProgress?.(99)
  return data.file
}

import type { AdvancedOptions } from '@/store/transcriptStore'

/**
 * Calls /api/transcribe in streaming mode and forwards real progress events.
 * For local files, uses Resumable Server Proxy upload to support files up to 2GB without 413 errors.
 */
export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void,
  options?: AdvancedOptions
): Promise<TranscribeResult> {
  let requestInit: RequestInit = { method: 'POST' }

  if (input.file) {
    onEvent?.({ type: 'status', phase: 'uploading' })

    // Step 0: Optimize media for upload (extract compact speech audio if pure audio or supported)
    let fileToUpload = input.file
    let mediaDuration = 0
    try {
      const prepared = await prepareMediaForUpload(input.file)
      fileToUpload = prepared.file
      mediaDuration = prepared.duration
      if (prepared.file && prepared.file !== input.file) {
        useTranscriptStore.getState().setAudioBlob(prepared.file)
      }
    } catch {
      fileToUpload = input.file
    }

    // 1. Get direct upload authorization & rotated key from server
    const requestSession = async () => {
      const sessionRes = await fetch('/api/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileToUpload.name,
          mimeType: inferMimeType(fileToUpload),
          fileSize: fileToUpload.size,
          clientOrigin: typeof window !== 'undefined' ? window.location.origin : undefined
        })
      })

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => null)
        throw new Error(errData?.error || 'Please sign in to transcribe files.')
      }

      return (await sessionRes.json()) as {
        apiKey: string
        keyIndex: number
        host: string
        uploadUrl?: string
      }
    }

    let { apiKey, keyIndex, host, uploadUrl } = await requestSession()

    // 2. Upload file: prioritize direct resumable upload (supports up to 2GB, 0 Vercel limits, no 8MB chunk error)
    let uploadedFile: { uri: string; name: string; mimeType: string } | null = null

    if (uploadUrl) {
      try {
        uploadedFile = await uploadToResumableUrl(uploadUrl, fileToUpload, (progress) => {
          onEvent?.({ type: 'progress', progress })
        })
      } catch (directErr: any) {
        console.warn('Direct resumable upload attempt 1 failed:', directErr)
        // If file is within Vercel body limit (<= 4MB), fallback to same-origin /gemini-proxy multipart upload
        if (fileToUpload.size <= 4 * 1024 * 1024) {
          try {
            uploadedFile = await directUploadToGemini(fileToUpload, apiKey, host, (progress) => {
              onEvent?.({ type: 'progress', progress })
            })
          } catch {
            throw directErr
          }
        } else {
          // For large files (> 4MB), request a fresh session (rotates key and avoids terminated uploadUrl)
          try {
            console.log('Retrying large file upload with fresh upload session...')
            const retrySession = await requestSession()
            apiKey = retrySession.apiKey
            keyIndex = retrySession.keyIndex
            host = retrySession.host
            uploadUrl = retrySession.uploadUrl

            if (uploadUrl) {
              uploadedFile = await uploadToResumableUrl(uploadUrl, fileToUpload, (progress) => {
                onEvent?.({ type: 'progress', progress })
              })
            } else {
              throw directErr
            }
          } catch (retryErr) {
            throw retryErr || directErr
          }
        }
      }
    } else {
      // Fallback: direct multipart upload
      uploadedFile = await directUploadToGemini(fileToUpload, apiKey, host, (progress) => {
        onEvent?.({ type: 'progress', progress })
      })
    }

    if (!uploadedFile?.uri) {
      throw new Error('Upload completed but did not return a valid file URI.')
    }

    onEvent?.({ type: 'status', phase: 'processing', duration: mediaDuration })

    // 3. Send lightweight 200-byte JSON request to /api/transcribe
    requestInit = {
      method: 'POST',
      headers: {
        'x-stream': '1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType || fileToUpload.type || 'audio/wav',
        displayName: input.file.name,
        duration: mediaDuration,
        keyIndex,
        options
      })
    }
  } else if (input.url) {
    requestInit = {
      method: 'POST',
      headers: { 'x-stream': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.url, options })
    }
  } else {
    throw new Error('Choose a file or paste a media link first.')
  }

  const res = await fetch('/api/transcribe', requestInit)

  // Errors before the stream starts (auth, etc.) come back as plain JSON.
  if (!res.ok || !res.body) {
    let errorMsg = ''
    try {
      const data = await res.json()
      errorMsg = data?.error || data?.message || ''
    } catch {
      try {
        errorMsg = await res.text()
      } catch {}
    }
    if (res.status === 401) {
      throw new Error(errorMsg || 'Please sign in to transcribe files.')
    }
    throw new Error(errorMsg || `Server transcription request failed (${res.status} ${res.statusText || 'Error'})`)
  }

  const reader = res.body.getReader()
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
