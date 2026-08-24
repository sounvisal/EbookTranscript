'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileAudio, AlertCircle, Check, Copy, Download, Loader2, X, PlayCircle, Layers, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'
import { getPlainTranscriptText } from '@/lib/transcript'
import { downloadTxt } from '@/lib/download'
import type { TranscriptSegment } from '@/lib/transcript'
import { transcribeWithProgress } from '@/lib/transcribeClient'
import ReportErrorButton from '@/components/common/ReportErrorButton'

// Max files a user can queue at once
const MAX_BATCH_FILES = 10
const STAGGER_MS = 400
// Process up to 3 files concurrently in parallel across the rotated Gemini keys
const MAX_CONCURRENT_JOBS = 3

type BatchJobStatus = 'queued' | 'processing' | 'complete' | 'error'

type BatchTranscript = {
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
}

type BatchJob = {
  id: string
  file: File
  status: BatchJobStatus
  progress: number
  transcript?: BatchTranscript
  error?: string
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function BatchUploadZone() {
  const [jobs, setJobs] = useState<BatchJob[]>([])
  const [running, setRunning] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const savedRef = useRef<Set<string>>(new Set())

  const updateJob = useCallback((id: string, patch: Partial<BatchJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)))
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles?.length) return
    setJobs((current) => {
      const remainingSlots = MAX_BATCH_FILES - current.length
      const incoming = acceptedFiles.slice(0, Math.max(0, remainingSlots)).map((file) => ({
        id: createId(),
        file,
        status: 'queued' as BatchJobStatus,
        progress: 0
      }))
      return [...current, ...incoming]
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'],
      'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv']
    },
    maxSize: MAX_MEDIA_UPLOAD_BYTES,
    disabled: running
  })

  const removeJob = (id: string) => {
    if (running) return
    setJobs((current) => current.filter((job) => job.id !== id))
  }

  const clearAll = () => {
    if (running) return
    setJobs([])
    savedRef.current = new Set()
  }

  const saveToHistory = async (job: BatchJob, plainText: string) => {
    if (savedRef.current.has(job.id)) return
    savedRef.current.add(job.id)
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: plainText,
          source: 'file',
          filename: job.file.name,
          duration: job.transcript?.duration || 0,
          wordCount: plainText.split(/\s+/).filter(Boolean).length,
          language: job.transcript?.language || 'auto'
        })
      })
    } catch (error) {
      console.error('Batch autosave failed:', error)
      savedRef.current.delete(job.id)
    }
  }

  const runJob = useCallback(
    async (job: BatchJob) => {
      updateJob(job.id, { status: 'processing', progress: 0, error: undefined })

      try {
        const data = await transcribeWithProgress({ file: job.file }, (event) => {
          if (event.type === 'progress') {
            updateJob(job.id, { progress: event.progress })
          }
        })

        const transcript: BatchTranscript = {
          text: data.text,
          segments: data.segments,
          language: data.language,
          duration: data.duration
        }
        updateJob(job.id, { status: 'complete', progress: 100, transcript })

        const plainText = getPlainTranscriptText(transcript.text || '', transcript.segments)
        await saveToHistory({ ...job, transcript }, plainText)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Transcription failed'
        updateJob(job.id, {
          status: 'error',
          progress: 0,
          error: errorMsg
        })

        fetch('/api/report-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            errorMessage: errorMsg,
            filename: job.file.name,
            fileSizeBytes: job.file.size,
            inputType: 'batch',
            userComment: 'Automated batch failure detection alert'
          })
        }).catch(() => {})
      }
    },
    [updateJob]
  )

  const runAll = async () => {
    const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'error')
    if (!pending.length) return

    setRunning(true)

    let cursor = 0
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_JOBS, pending.length) },
      async (_unused, workerIndex) => {
        await delay(workerIndex * STAGGER_MS)
        while (true) {
          const index = cursor
          cursor += 1
          if (index >= pending.length) break
          await runJob(pending[index])
        }
      }
    )

    await Promise.all(workers)
    setRunning(false)
  }

  const handleCopy = (job: BatchJob) => {
    if (!job.transcript) return
    const plainText = getPlainTranscriptText(job.transcript.text || '', job.transcript.segments)
    navigator.clipboard.writeText(plainText)
    setCopiedId(job.id)
    setTimeout(() => setCopiedId((current) => (current === job.id ? null : current)), 2000)
  }

  const handleDownload = (job: BatchJob) => {
    if (!job.transcript) return
    const plainText = getPlainTranscriptText(job.transcript.text || '', job.transcript.segments)
    downloadTxt(plainText, job.file.name)
  }

  const completedCount = jobs.filter((job) => job.status === 'complete').length
  const hasPending = jobs.some((job) => job.status === 'queued' || job.status === 'error')

  return (
    <div className="flex flex-col gap-6">
      {/* Apple Drag & Drop Card */}
      <div
        {...getRootProps()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-300 sm:py-12 ${
          isDragActive
            ? 'border-purple-500 bg-purple-50/60 scale-[1.01]'
            : 'border-slate-300/80 bg-gradient-to-b from-white/80 to-slate-50/50 hover:border-purple-500/70 hover:bg-purple-50/20 shadow-xs'
        } ${running ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input {...getInputProps()} />
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-purple-50 to-purple-100/80 text-purple-600 shadow-xs ring-1 ring-purple-500/20 transition-transform duration-300 group-hover:scale-110">
          <Layers className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
          {isDragActive ? 'Drop batch files here' : 'Queue up to 10 files'}
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
          Drag and drop multiple audio or video files to transcribe in parallel
        </p>
        <p className="mt-3 text-[11px] font-medium text-slate-400">
          Up to {MAX_MEDIA_UPLOAD_MB} MB per file · Rotated multi-key concurrent processing
        </p>
      </div>

      {jobs.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-600">
          <span>
            {jobs.length} of {MAX_BATCH_FILES} files · {completedCount} completed
          </span>
          <button
            onClick={clearAll}
            disabled={running}
            className="rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 hover:text-red-600 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Queue items */}
      <div className="flex flex-col gap-3">
        <AnimatePresence>
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="apple-glass-card rounded-2xl p-4 sm:p-5 transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-500/10">
                    <FileAudio className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900" title={job.file.name}>
                      {job.file.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {(job.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.status === 'queued' && !running && (
                    <button
                      onClick={() => removeJob(job.id)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                      aria-label={`Remove ${job.file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {job.status === 'processing' && (
                <div className="mt-3 relative h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-black/5">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-600"
                    animate={{ width: `${job.progress}%` }}
                    transition={{ duration: 0.35, ease: 'linear' }}
                  />
                </div>
              )}

              {job.status === 'error' && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-red-50/90 p-3 text-xs text-red-700">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                    <span className="font-medium">{job.error}</span>
                  </div>
                  <ReportErrorButton
                    errorMessage={job.error || 'Batch transcription failed.'}
                    filename={job.file.name}
                    fileSizeBytes={job.file.size}
                    inputType="batch"
                    className="self-end sm:self-auto shrink-0 rounded-full"
                  />
                </div>
              )}

              {job.status === 'complete' && job.transcript && (
                <div className="mt-3 flex flex-col gap-3 border-t border-slate-100/80 pt-3">
                  <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-700 font-normal">
                    {getPlainTranscriptText(job.transcript.text || '', job.transcript.segments)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(job)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                        copiedId === job.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {copiedId === job.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === job.id ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownload(job)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-400" />
                      <span>TXT</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {jobs.length > 0 && (
        <button
          onClick={runAll}
          disabled={running || !hasPending}
          className={`apple-btn-primary mt-2 flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {running ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing Queue in Parallel…</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span>
                Transcribe {jobs.filter((job) => job.status === 'queued' || job.status === 'error').length} Queue Item
                {jobs.filter((job) => job.status === 'queued' || job.status === 'error').length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: BatchJobStatus }) {
  const config: Record<BatchJobStatus, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-slate-100 text-slate-600' },
    processing: { label: 'Processing', className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-500/20' },
    complete: { label: 'Complete', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20' },
    error: { label: 'Failed', className: 'bg-red-50 text-red-700 ring-1 ring-red-500/20' }
  }
  const { label, className } = config[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>{label}</span>
}
