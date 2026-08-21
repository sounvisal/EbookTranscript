'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileAudio, AlertCircle, Check, Copy, Download, Loader2, X, PlayCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'
import { getPlainTranscriptText } from '@/lib/transcript'
import { downloadTxt } from '@/lib/download'
import type { TranscriptSegment } from '@/lib/transcript'
import { transcribeWithProgress } from '@/lib/transcribeClient'
import { prepareMediaForUpload } from '@/lib/clientAudio'

// Max files a user can queue at once, and how far apart we kick off each
// request. Every job still runs concurrently ("max at the same time"); the
// small stagger just avoids firing a single burst that trips the free-tier
// requests-per-minute limit and causes 429 errors.
const MAX_BATCH_FILES = 10
const STAGGER_MS = 700
// Cap how many transcriptions run at once. Firing all files simultaneously
// spikes the free-tier per-minute quota and makes them fail in bursts, so we
// keep a small number in flight and start the rest as slots free up.
const MAX_CONCURRENT_JOBS = 2

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
  // Track which jobs have already been saved to history so we never double-save.
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
        // Fast client-side audio preparation (bypasses Vercel 4.5MB limit)
        const fileToUpload = await prepareMediaForUpload(job.file)

        // Real progress: driven by Gemini's streamed transcript timestamps.
        const data = await transcribeWithProgress({ file: fileToUpload }, (event) => {
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
        updateJob(job.id, {
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Transcription failed'
        })
      }
    },
    [updateJob]
  )

  const runAll = async () => {
    const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'error')
    if (!pending.length) return

    setRunning(true)

    // Process with a bounded number in flight so we don't trip the per-minute
    // rate limit. Each worker picks up the next queued file as it frees up.
    let cursor = 0
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_JOBS, pending.length) },
      async (_unused, workerIndex) => {
        // Stagger the initial starts so the first requests don't land together.
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
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'
        } ${running ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input {...getInputProps()} />
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
          <FileAudio className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{isDragActive ? 'Drop files here' : 'Add up to 10 files'}</h2>
        <p className="mt-2 text-sm text-slate-600">Drag and drop audio or video, or click to browse</p>
        <p className="mt-4 text-xs text-slate-500">Up to {MAX_MEDIA_UPLOAD_MB} MB per file · 2 files process at a time</p>
      </div>

      {jobs.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">{jobs.length} of {MAX_BATCH_FILES} files · {completedCount} complete</span>
          <button onClick={clearAll} disabled={running} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40">Clear all</button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <AnimatePresence>
          {jobs.map((job) => (
            <motion.div key={job.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileAudio className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{job.file.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{(job.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.status === 'queued' && !running && (
                    <button onClick={() => removeJob(job.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${job.file.name}`}><X className="h-4 w-4" /></button>
                  )}
                </div>
              </div>

              {job.status === 'processing' && (
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-blue-600" animate={{ width: `${job.progress}%` }} transition={{ duration: 0.4, ease: 'linear' }} /></div>
              )}

              {job.status === 'error' && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{job.error}</span></div>
              )}

              {job.status === 'complete' && job.transcript && (
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    {getPlainTranscriptText(job.transcript.text || '', job.transcript.segments)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleCopy(job)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${copiedId === job.id ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                      {copiedId === job.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedId === job.id ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => handleDownload(job)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Download TXT</button>
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
          className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-5 text-lg font-bold transition-all disabled:cursor-not-allowed"
          style={{
            backgroundColor: running || !hasPending ? '#e2e8f0' : '#2563eb',
            color: running || !hasPending ? '#64748b' : '#ffffff',
            border: '2px solid ' + (running || !hasPending ? '#cbd5e1' : '#2563eb'),
            boxShadow: running || !hasPending ? 'none' : '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
          }}
        >
          {running ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Transcribing files…</span>
            </>
          ) : (
            <>
              <PlayCircle className="h-6 w-6" style={{ color: '#ffffff' }} />
              <span>
                Transcribe {jobs.filter((job) => job.status === 'queued' || job.status === 'error').length} file{jobs.filter((job) => job.status === 'queued' || job.status === 'error').length === 1 ? '' : 's'}
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
    processing: { label: 'Processing', className: 'bg-blue-50 text-blue-700' },
    complete: { label: 'Complete', className: 'bg-emerald-50 text-emerald-700' },
    error: { label: 'Failed', className: 'bg-red-50 text-red-700' }
  }
  const { label, className } = config[status]
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>{label}</span>
}
