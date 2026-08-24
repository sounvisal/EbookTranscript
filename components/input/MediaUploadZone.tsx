'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileAudio, AlertCircle, Link2, Sparkles, X, ArrowRight, Music, Film, CheckCircle2 } from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'
import { transcribeWithProgress } from '@/lib/transcribeClient'

import ReportErrorButton from '@/components/common/ReportErrorButton'

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
      // Real progress streamed from the direct-to-Gemini transcribe client.
      const data = await transcribeWithProgress(input, (event) => {
        if (event.type === 'status' && event.phase === 'processing') {
          setStatus('processing')
        }
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
      const errorMsg = error instanceof Error ? error.message : 'Transcription failed.'
      setErrorMessage(errorMsg)
      setStatus('error')

      // Automatically dispatch error incident alert in background
      fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage: errorMsg,
          filename: input.file?.name || input.url,
          fileSizeBytes: input.file?.size,
          inputType: input.file ? 'file' : 'url',
          userComment: 'Automated failure detection alert'
        })
      }).catch(() => {})
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {status === 'error' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-sm text-red-700 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span className="font-medium">{errorMessage || 'Transcription failed. Try another file or direct media link.'}</span>
          </div>
          <ReportErrorButton
            errorMessage={errorMessage || 'Transcription failed.'}
            filename={file?.name || sourceUrl || undefined}
            fileSizeBytes={file?.size}
            inputType={file ? 'file' : 'url'}
            className="self-end sm:self-auto shrink-0 rounded-full"
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6">
            {/* Apple Drag & Drop Zone */}
            <div
              {...getRootProps()}
              className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-300 sm:py-14 ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50/60 scale-[1.01]'
                  : 'border-slate-300/80 bg-gradient-to-b from-white/80 to-slate-50/50 hover:border-blue-500/70 hover:bg-blue-50/20 shadow-xs'
              }`}
            >
              <input {...getInputProps()} />
              <div className="relative mb-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/80 text-blue-600 shadow-xs ring-1 ring-blue-500/20 transition-transform duration-300 group-hover:scale-110">
                  <FileAudio className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-black/5 text-slate-500">
                  <Music className="h-3 w-3" />
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                {isDragActive ? 'Drop your audio or video file here' : 'Drop audio or video here'}
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
                or <span className="font-semibold text-blue-600 underline-offset-2 group-hover:underline">browse files</span> from your computer
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">MP3</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">WAV</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">M4A</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">MP4</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">WEBM</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5">MOV</span>
                <span className="text-slate-400">· up to {MAX_MEDIA_UPLOAD_MB} MB</span>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <div className="h-px flex-1 bg-slate-200/80" />
              <span>or paste media link</span>
              <div className="h-px flex-1 bg-slate-200/80" />
            </div>

            {/* Apple Card: Link Input */}
            <div className="apple-glass-card rounded-2xl p-4 sm:p-5">
              <label htmlFor="media-url" className="mb-2.5 flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800">
                <Link2 className="h-4 w-4 text-blue-600" />
                <span>Web link or YouTube video URL</span>
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
                  placeholder="https://example.com/audio.mp3 or YouTube link"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/80"
                />
                <button
                  type="button"
                  onClick={() => submitRequest({ url: sourceUrl.trim() })}
                  disabled={!sourceUrl.trim()}
                  className="apple-btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>Transcribe Link</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Supports direct video/audio URLs, TikTok, Twitter/X, Instagram, and YouTube.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col gap-5 rounded-3xl border border-blue-200/80 bg-gradient-to-b from-blue-50/50 via-white to-white p-6 sm:p-7 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4 border-b border-blue-100/80 pb-5">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  {file.type.startsWith('video/') ? (
                    <Film className="h-6 w-6 text-white" />
                  ) : (
                    <FileAudio className="h-6 w-6 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-950" title={file.name}>
                    {file.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200/80 font-mono">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ready for AI Analysis
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFile(null)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600 active:scale-95 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Change</span>
              </button>
            </div>

            {/* Apple Primary Action Button */}
            <button
              type="button"
              onClick={() => submitRequest({ file })}
              className="apple-btn-primary flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white transition-all cursor-pointer"
            >
              <Sparkles className="h-5 w-5 animate-pulse text-white" />
              <span className="tracking-tight text-white">Start Transcription Now</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
