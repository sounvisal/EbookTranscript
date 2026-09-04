'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileAudio, AlertCircle, Link2, Sparkles, X, ArrowRight, Music, Film, CheckCircle2, RefreshCw } from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'
import { motion, AnimatePresence } from 'framer-motion'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'
import { transcribeWithProgress } from '@/lib/transcribeClient'
import AdvancedOptionsDrawer from './AdvancedOptionsDrawer'

import ReportErrorButton from '@/components/common/ReportErrorButton'

export default function MediaUploadZone() {
  const {
    file,
    setFile,
    status,
    setStatus,
    setProgress,
    setTranscript,
    errorMessage,
    setErrorMessage,
    advancedOptions
  } = useTranscriptStore()
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
      const data = await transcribeWithProgress(
        input,
        (event) => {
          if (event.type === 'status' && event.phase === 'processing') {
            setStatus('processing')
          }
          if (event.type === 'progress') {
            setProgress(event.progress)
          }
        },
        advancedOptions
      )

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Unable to process media</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Please try again or try another audio/video file.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setStatus('idle')
                if (file) submitRequest({ file })
                else if (sourceUrl.trim()) submitRequest({ url: sourceUrl.trim() })
              }}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 dark:bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-amber-700 active:scale-95 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Try Again</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFile(null)
                setSourceUrl('')
                setStatus('idle')
                setErrorMessage(null)
              }}
              className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
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
                  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 scale-[1.01]'
                  : 'border-slate-300/80 dark:border-slate-800 bg-gradient-to-b from-white/80 to-slate-50/50 dark:from-slate-900/60 dark:to-slate-950/40 hover:border-blue-500/70 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 shadow-xs'
              }`}
            >
              <input {...getInputProps()} />
              <div className="relative mb-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/80 dark:from-blue-950/80 dark:to-blue-900/40 text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-blue-500/20 transition-transform duration-300 group-hover:scale-110">
                  <FileAudio className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-slate-900 shadow-xs ring-1 ring-black/5 dark:ring-white/10 text-slate-500 dark:text-slate-400">
                  <Music className="h-3 w-3" />
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isDragActive ? 'Drop your audio or video file here' : 'Drop audio or video here'}
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                or <span className="font-semibold text-blue-600 dark:text-blue-400 underline-offset-2 group-hover:underline">browse files</span> from your computer
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">MP3</span>
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">WAV</span>
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">M4A</span>
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">MP4</span>
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">WEBM</span>
                <span className="rounded-md bg-slate-100/90 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">MOV</span>
                <span className="text-slate-400 dark:text-slate-500">· up to {MAX_MEDIA_UPLOAD_MB} MB</span>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800" />
              <span>or paste media link</span>
              <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800" />
            </div>

            {/* Apple Card: Link Input */}
            <div className="apple-glass-card rounded-2xl p-4 sm:p-5">
              <label htmlFor="media-url" className="mb-2.5 flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                  className="min-w-0 flex-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/80 dark:focus:ring-blue-900/40"
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
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                Supports direct video/audio URLs, TikTok, Twitter/X, Instagram, and YouTube.
              </p>
            </div>

            {/* Advanced Options Drawer (Custom Vocabulary, Speaker Diarization, Language) */}
            <AdvancedOptionsDrawer />
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col gap-5 rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-b from-blue-50/50 via-white to-white dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-950/90 p-6 sm:p-7 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4 border-b border-blue-100/80 dark:border-slate-800 pb-5">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  {file.type.startsWith('video/') ? (
                    <Film className="h-6 w-6 text-white" />
                  ) : (
                    <FileAudio className="h-6 w-6 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-950 dark:text-white" title={file.name}>
                    {file.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="rounded-md bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200/80 dark:ring-slate-700 font-mono text-slate-700 dark:text-slate-300">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ready for AI Analysis
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFile(null)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 hover:text-red-600 active:scale-95 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Change</span>
              </button>
            </div>

            {/* Advanced Options Drawer in File Preview */}
            <AdvancedOptionsDrawer />

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
