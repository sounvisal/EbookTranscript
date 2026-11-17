'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Job = { id: string; fileName: string; status: string; attempts: number; createdAt: string; startedAt: string | null; expiresAt: string; model: string | null; elapsedSeconds: number | null; error: string | null; canRetry: boolean; user: { email: string | null } }
type Jobs = { available: boolean; items: Job[]; total: number; counts: Record<string, number> }
type Audit = { id: string; action: string; createdAt: string; adminEmail: string | null }
const filters = ['all', 'running', 'queued', 'failed', 'interrupted', 'expired', 'complete']
const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not started'

export function JobsTab() {
  const [data, setData] = useState<Jobs | null>(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState<Date | null>(null)
  const [selected, setSelected] = useState<Job | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef(0)
  const detailRequest = useRef(0)
  const detailPanel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (selected) { detailPanel.current?.scrollIntoView({ block: 'nearest' }); detailPanel.current?.focus({ preventScroll: true }) }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    const sequence = ++request.current
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/jobs?status=${status}&search=${encodeURIComponent(search)}&page=${page}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load jobs.')
      if (sequence !== request.current) return
      setData(result); setUpdated(new Date()); setError('')
    } catch (error) { if (sequence === request.current) setError(error instanceof Error ? error.message : 'Unable to load jobs.') }
    finally { if (sequence === request.current) setBusy(false) }
  }, [status, search, page])
  useEffect(() => {
    setData(null)
    const timer = setTimeout(refresh, 250)
    const poll = setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => { clearTimeout(timer); clearInterval(poll); request.current++ }
  }, [refresh])
  useEffect(() => () => { detailRequest.current++ }, [])
  const inspect = async (job: Job) => {
    const sequence = ++detailRequest.current
    setSelected(job); setAudit([]); setDetailError('')
    try {
      const response = await fetch(`/api/admin/jobs?id=${encodeURIComponent(job.id)}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load job details.')
      if (sequence !== detailRequest.current) return
      if (!result.items[0]) throw new Error('This job is no longer available.')
      setSelected(result.items[0]); setAudit(result.audit || [])
    } catch (error) { if (sequence === detailRequest.current) setDetailError(error instanceof Error ? error.message : 'Could not load job details.') }
  }
  const retry = async (job: Job) => {
    setRetrying(job.id); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id, action: 'retry' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not retry job.')
      setNotice(`${job.fileName} was submitted for retry.`)
      await refresh()
      if (selected?.id === job.id) await inspect(job)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not retry job.') }
    finally { setRetrying(null) }
  }
  return <section className="space-y-5" aria-labelledby="jobs-title">
    <div className="flex items-start justify-between gap-3"><div><h2 id="jobs-title" className="text-xl font-semibold">Jobs</h2><p className="mt-1 text-sm text-slate-500">Inspect and recover individual background transcriptions.</p></div><button onClick={refresh} disabled={busy} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">{busy ? 'Refreshing…' : 'Refresh jobs'}</button></div>
    <p className="text-xs text-slate-500">Covers server background jobs. Browser uploads and streaming requests are not counted here. Refreshes every 15 seconds while visible{updated ? ` · Updated ${updated.toLocaleTimeString()}` : ''}.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}{data ? ' Showing the last successful update.' : ''}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Search jobs" placeholder="Find a file, email, or job ID" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" /><select aria-label="Job status" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700">{filters.map(filter => <option value={filter} key={filter}>{filter === 'all' ? 'All statuses' : filter[0].toUpperCase() + filter.slice(1)}</option>)}</select></div>
    {data?.available && <div className="flex flex-wrap gap-2">{['running', 'queued', 'failed', 'interrupted'].map(filter => <button key={filter} onClick={() => { setStatus(filter); setPage(1) }} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs capitalize dark:bg-slate-800">{filter}: {data.counts[filter] ?? 0}</button>)}</div>}
    {!data && !error && <p role="status" className="py-8 text-center text-sm text-slate-500">Loading jobs…</p>}
    {data && !data.available && <p className="rounded-2xl border p-6 text-sm">Background job data is unavailable on this database. Apply the existing transcription-jobs migration to enable this panel. Saved transcripts remain in Activity and History.</p>}
    {data?.available && <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {data.items.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No jobs match this view.</p>}
        {data.items.map(job => <div key={job.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 last:border-0 dark:border-slate-800">
          <button onClick={() => inspect(job)} className="min-w-0 basis-full text-left sm:flex-1"><span className="block break-all text-sm font-semibold sm:truncate">{job.fileName}</span><span className="block truncate text-xs text-slate-500">{job.user.email || 'Unknown user'} · {date(job.createdAt)}</span></button>
          <div className="flex-1 text-left text-xs sm:flex-none sm:text-right"><span className={`block font-medium capitalize ${['failed', 'expired', 'interrupted'].includes(job.status) ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>{job.status}</span><span className="text-slate-500">Attempt {job.attempts}{job.elapsedSeconds !== null ? ` · ${job.elapsedSeconds}s` : ''}</span></div>
          <button aria-label={`Details for ${job.fileName}`} onClick={() => inspect(job)} className="rounded-lg px-3 py-2 text-xs font-semibold text-blue-600">Details</button>
          {job.canRetry && <button disabled={retrying !== null} onClick={() => retry(job)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:bg-slate-800">{retrying === job.id ? 'Retrying…' : 'Retry'}</button>}
        </div>)}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500"><span>{data.total} jobs · Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span><div className="flex gap-3"><button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)} className="p-2 disabled:opacity-30">Previous</button><button disabled={page * 25 >= data.total || busy} onClick={() => setPage(page + 1)} className="p-2 disabled:opacity-30">Next</button></div></div>
    </>}
    {selected && <section ref={detailPanel} tabIndex={-1} aria-label="Job details" className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-900">
      <div className="flex justify-between gap-4"><h3 className="min-w-0 break-all font-semibold">{selected.fileName}</h3><button onClick={() => { detailRequest.current++; setSelected(null) }} className="text-sm text-blue-600">Close</button></div>
      {detailError && <p role="alert" className="text-sm text-red-600">{detailError}</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries({ Status: selected.status, User: selected.user.email || 'Unknown', Model: selected.model || 'Not recorded yet', Attempts: String(selected.attempts), Created: date(selected.createdAt), Started: date(selected.startedAt), 'Upload expires': date(selected.expiresAt), 'Job ID': selected.id }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>
      {selected.error && <p className="break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">{selected.error}</p>}
      {['failed', 'expired', 'interrupted'].includes(selected.status) && !selected.canRetry && <p className="text-sm text-slate-500">This job cannot be retried. Ask the user to upload the file again.</p>}
      <div><h4 className="text-sm font-semibold">Admin actions</h4>{audit.length ? audit.map(entry => <p key={entry.id} className="mt-2 text-xs text-slate-500">{entry.action} · {entry.adminEmail || 'Administrator'} · {date(entry.createdAt)}</p>) : <p className="mt-2 text-xs text-slate-500">No admin actions recorded.</p>}</div>
    </section>}
  </section>
}
