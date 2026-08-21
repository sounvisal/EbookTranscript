'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileAudio, AlertCircle, Link2, Sparkles, X, ArrowRight } from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'
import { transcribeWithProgress } from '@/lib/transcribeClient'

export default function MediaUploadZone() {
  const { file, setFile, status, setStatus, setProgress, setTranscript, errorMessage, setErrorMessage } = useTranscriptStore()
  const [sourceUrl, setSourceUrl] = useState('')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      setFile(acceptedFiles[0])
      setErrorMessage(null)
      if (status === 'error') setStatus('idle')
    }
  }, [setErrorMessage, setFile, status, setStatus])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'],
      'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv']
    },
    maxSize: MAX_MEDIA_UPLOAD_BYTES
  })

  const submitRequest = async (input: { file?: File; url?: string }) => {
    setStatus('uploading')
    setErrorMessage(null)
    setProgress(0)

    try {
      setStatus('processing')
      // Real progress streamed from the transcribe API.
      const data = await transcribeWithProgress(input, (event) => {
        if (event.type === 'progress') {
          setProgress(event.progress)
        }
      })

      setTranscript({
        text: data.text,
        segments: data.segments,
        source: data.source || input.file?.name || input.url || 'MEDIA INPUT',
        language: data.language,
        duration: data.duration,
        kind: 'transcript'
      })
    } catch (error) {
      console.error(error)
      setErrorMessage(error instanceof Error ? error.message : 'Transcription failed.')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {status === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage || 'Transcription failed. Try another file or direct media link.'}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5">
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all sm:py-12 ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/40'
              }`}
            >
              <input {...getInputProps()} />
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                <FileAudio className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h2 className="text-lg font-semibold text-slate-900">
                {isDragActive ? 'Drop your audio or video file here' : 'Upload audio or video'}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">Drag and drop a file here, or click to browse</p>
              <p className="mt-3 text-xs text-slate-400">
                MP3, WAV, M4A, MP4, WEBM, MOV or FLAC · up to {MAX_MEDIA_UPLOAD_MB} MB
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-wider text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              or paste a media link
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <label htmlFor="media-url" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Link2 className="h-4 w-4 text-blue-600" />
                Audio or video URL
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="media-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => {
                    setSourceUrl(event.target.value)
                    setErrorMessage(null)
                    if (status === 'error') setStatus('idle')
                  }}
                  placeholder="https://example.com/media.mp4 or YouTube link"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => submitRequest({ url: sourceUrl.trim() })}
                  disabled={!sourceUrl.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Transcribe link</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Direct audio/video links and YouTube videos are supported.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="preview" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50/70 to-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
                >
                  <FileAudio className="h-6 w-6" style={{ color: '#ffffff' }} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900" title={file.name}>{file.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · Auto language detection ready
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
                Change file
              </button>
            </div>

            {/* High-visibility primary action button */}
            <button
              type="button"
              onClick={() => submitRequest({ file })}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: '1px solid #1d4ed8',
                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.35)'
              }}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-base font-bold transition-all hover:opacity-95 active:scale-[0.99] cursor-pointer"
            >
              <Sparkles className="h-5 w-5" style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>Start Transcription Now</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
