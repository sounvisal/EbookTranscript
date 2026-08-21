'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  FileAudio,
  FileText,
  Link2,
  Loader2,
  Trash2
} from 'lucide-react'
import { downloadTxt } from '@/lib/download'
import { getPlainTranscriptText } from '@/lib/transcript'
import { useSession, signIn } from 'next-auth/react'

const PAGE_SIZE = 15

type TranscriptRecord = {
  id: string
  text?: string
  source: string
  filename: string | null
  duration: number | null
  wordCount: number | null
  language: string | null
  createdAt: string
}

type HistoryResponse = {
  items: TranscriptRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function getPageNumbers(page: number, totalPages: number) {
  const visibleCount = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(page - 2, totalPages - visibleCount + 1))
  return Array.from({ length: visibleCount }, (_, index) => start + index)
}

function getSourceName(item: TranscriptRecord) {
  if (item.filename) return item.filename
  if (item.source && !['file', 'voice_record', 'live_voice'].includes(item.source)) return item.source
  return 'Transcript'
}

export default function HistoryPage() {
  const { status } = useSession()
  const [history, setHistory] = useState<TranscriptRecord[]>([])
  const [details, setDetails] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [copiedDetailId, setCopiedDetailId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (pageToLoad: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/history?page=${pageToLoad}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load transcript history.')

      const data: HistoryResponse = await response.json()
      setHistory(data.items)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setExpandedId(null)

      if (data.page !== pageToLoad) setPage(data.page)
    } catch (fetchError) {
      console.error('Failed to fetch history', fetchError)
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load transcript history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchHistory(page)
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [fetchHistory, page, status])

  const loadTranscriptText = async (id: string) => {
    if (details[id] !== undefined) return details[id]

    setLoadingDetailId(id)
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load this transcript.')

      const item: TranscriptRecord = await response.json()
      const text = getPlainTranscriptText(item.text || '')
      setDetails((current) => ({ ...current, [id]: text }))
      return text
    } catch (detailError) {
      console.error('Failed to load transcript', detailError)
      setError(detailError instanceof Error ? detailError.message : 'Unable to load this transcript.')
      return null
    } finally {
      setLoadingDetailId(null)
    }
  }

  const togglePreview = async (item: TranscriptRecord) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(item.id)
    await loadTranscriptText(item.id)
  }

  const handleDownload = async (item: TranscriptRecord, event: React.MouseEvent) => {
    event.stopPropagation()
    const text = await loadTranscriptText(item.id)
    if (text !== null) downloadTxt(text, getSourceName(item))
  }

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setDeletingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to delete this transcript.')

      setDetails((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })

      if (history.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        await fetchHistory(page)
      }
    } catch (deleteError) {
      console.error('Failed to delete transcript', deleteError)
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this transcript.')
    } finally {
      setDeletingId(null)
    }
  }

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FileText className="h-6 w-6" /></span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Your transcript history</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Sign in to view, download, and manage transcripts saved to your account.</p>
        <button onClick={() => signIn()} className="mt-7 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">Sign in to view history</button>
      </div>
    )
  }

  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastItem = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Transcript history</h1>
          <p className="mt-2 text-sm text-slate-500">Review source details and manage previous transcriptions.</p>
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">{total.toLocaleString()} saved</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => fetchHistory(page)} className="font-semibold hover:text-red-900">Try again</button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/30">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm font-medium text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center p-16 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileText className="h-5 w-5" /></span>
            <h2 className="font-semibold text-slate-800">No transcripts yet</h2>
            <p className="mt-1 text-sm text-slate-500">Completed transcripts will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Source / link name</th>
                  <th className="w-32 px-4 py-3.5">Language</th>
                  <th className="w-28 px-4 py-3.5 text-right">Words</th>
                  <th className="w-40 px-4 py-3.5">Date</th>
                  <th className="w-36 px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => {
                  const sourceName = getSourceName(item)
                  const isLink = !item.filename && item.source !== 'file'
                  const isExpanded = expandedId === item.id
                  const detailText = details[item.id]

                  return (
                    <Fragment key={item.id}>
                      <tr onClick={() => togglePreview(item)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                        <td className="max-w-md px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isLink ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
                              {isLink ? <Link2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900" title={sourceName}>{sourceName}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{isLink ? 'Media link' : 'Uploaded file'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">{item.language || 'Auto'}</span></td>
                        <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-600">{item.wordCount?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={(event) => handleDownload(item, event)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Download TXT"><Download className="h-4 w-4" /></button>
                            <button onClick={(event) => handleDelete(item.id, event)} disabled={deletingId === item.id} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Delete">
                              {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                            <span className="ml-1 p-1 text-slate-400">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="border-t border-slate-100 bg-slate-50/70 px-5 py-5">
                            {loadingDetailId === item.id && detailText === undefined ? (
                              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading transcript…</div>
                            ) : (
                              <div className="relative max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 pr-24 text-sm leading-6 text-slate-700">
                                <button
                                  onClick={() => {
                                    if (detailText) {
                                      navigator.clipboard.writeText(detailText)
                                      setCopiedDetailId(item.id)
                                      setTimeout(() => setCopiedDetailId((current) => (current === item.id ? null : current)), 2000)
                                    }
                                  }}
                                  className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                    copiedDetailId === item.id ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                >
                                  {copiedDetailId === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  {copiedDetailId === item.id ? 'Copied' : 'Copy'}
                                </button>
                                <p className="whitespace-pre-wrap">{detailText || 'No transcript text available.'}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">Showing {firstItem}–{lastItem} of {total.toLocaleString()} transcripts</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
              {getPageNumbers(page, totalPages).map((pageNumber) => (
                <button key={pageNumber} onClick={() => setPage(pageNumber)} disabled={loading} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${pageNumber === page ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{pageNumber}</button>
              ))}
              <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || loading} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
