'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMediaBlob } from '@/lib/mediaStorage'
import { resumeTranscriptionJob } from '@/lib/transcribeClient'
import { createTranscriptSlug } from '@/lib/transcriptSlug'
import { useTranscriptStore } from '@/store/transcriptStore'

type Job = { id: string; fileName: string; status: string }

export default function RecentTranscriptions({ accountId }: { accountId: string }) {
  const router = useRouter()
  const activeRequest = useRef<AbortController>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => () => activeRequest.current?.abort(), [])

  const loadJobs = async () => {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/transcribe/jobs', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      setJobs(await response.json())
    } catch {
      setMessage('Could not load recent jobs. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const openJob = async (job: Job) => {
    const request = new AbortController()
    activeRequest.current = request
    setBusy(true)
    setMessage('Connecting to transcription…')
    try {
      const transcript = await resumeTranscriptionJob(job.id, (event) => {
        if (event.type === 'progress') setMessage(`Transcribing… ${event.progress}%`)
      }, request.signal)
      if (!transcript.id) throw new Error('The transcript is unavailable.')

      const audio = await getMediaBlob(accountId, transcript.id, job.id)
      const store = useTranscriptStore.getState()
      if (request.signal.aborted || store.accountId !== accountId) return
      store.setTranscriptWithAudio(transcript, null, null, audio)
      router.replace('/transcribe/' + encodeURIComponent(createTranscriptSlug(job.fileName, transcript.id)))
    } catch (error) {
      if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not open this job.')
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }

  return (
    <section aria-label="Recent transcription jobs" className="mt-5 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
      <button type="button" disabled={busy} onClick={loadJobs} className="font-semibold text-blue-700 disabled:opacity-60 dark:text-blue-300">
        {jobs ? 'Refresh recent jobs' : 'Recent jobs'}
      </button>
      {jobs && (jobs.length ? (
        <ul className="mt-3 space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{job.fileName}</span>
              <button type="button" disabled={busy} onClick={() => openJob(job)} className="shrink-0 rounded-lg border px-2 py-1 text-xs dark:border-slate-700">
                {job.status === 'complete' ? 'Open' : job.status === 'failed' ? 'See error' : 'Reconnect'}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-slate-500">No recent background transcription jobs.</p>)}
      {message && <p role="status" className="mt-2 text-slate-600 dark:text-slate-400">{message}</p>}
    </section>
  )
}
