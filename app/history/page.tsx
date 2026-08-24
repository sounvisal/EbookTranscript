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
  Trash2,
  Sparkles
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
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/70 text-blue-600 shadow-xs ring-1 ring-blue-500/15">
          <FileText className="h-7 w-7" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">Transcript History</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Sign in to view, download, and manage transcripts saved to your account.
        </p>
        <button
          onClick={() => signIn()}
          className="apple-btn-primary mt-6 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all active:scale-95 cursor-pointer"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastItem = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
            Transcript History
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Review past transcription jobs, inspect audio metrics, and export text files.
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs backdrop-blur-md">
          {total.toLocaleString()} Saved Jobs
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 backdrop-blur-md">
          <span>{error}</span>
          <button onClick={() => fetchHistory(page)} className="font-semibold underline hover:text-red-900 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* macOS Style Table Card */}
      <div className="apple-glass-card overflow-hidden rounded-3xl transition-all">
        {loading ? (
          <div className="flex items-center justify-center gap-2.5 p-20 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span>Loading history…</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center p-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FileText className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-bold text-slate-800">No transcripts yet</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Transcripts you generate will automatically be saved and organized here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead className="border-b border-slate-200/60 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">Source / File Name</th>
                  <th className="w-32 px-4 py-4">Language</th>
                  <th className="w-28 px-4 py-4 text-right">Words</th>
                  <th className="w-40 px-4 py-4">Date</th>
                  <th className="w-36 px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {history.map((item) => {
                  const sourceName = getSourceName(item)
                  const isLink = !item.filename && item.source !== 'file'
                  const isExpanded = expandedId === item.id
                  const detailText = details[item.id]

                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => togglePreview(item)}
                        className={`group cursor-pointer transition-colors duration-150 ${
                          isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="max-w-md px-6 py-4">
                          <div className="flex min-w-0 items-center gap-3.5">
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${
                                isLink ? 'bg-purple-50 text-purple-600 ring-1 ring-purple-500/10' : 'bg-blue-50 text-blue-600 ring-1 ring-blue-500/10'
                              }`}
                            >
                              {isLink ? <Link2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900" title={sourceName}>
                                {sourceName}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                {isLink ? 'Web / Video link' : 'Uploaded media'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-slate-100/90 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/60">
                            {item.language || 'Auto'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-xs font-mono text-slate-600">
                          {item.wordCount?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-slate-500">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(event) => handleDownload(item, event)}
                              className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Download TXT"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(event) => handleDelete(item.id, event)}
                              disabled={deletingId === item.id}
                              className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 cursor-pointer"
                              title="Delete"
                            >
                              {deletingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                            <span className="ml-1 p-1 text-slate-400">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="border-t border-slate-100 bg-slate-50/50 p-5 sm:p-6">
                            {loadingDetailId === item.id && detailText === undefined ? (
                              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                <span>Loading transcript preview…</span>
                              </div>
                            ) : (
                              <div className="relative max-h-72 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/90 p-5 pr-24 text-xs sm:text-sm leading-relaxed text-slate-800 shadow-2xs">
                                <button
                                  onClick={() => {
                                    if (detailText) {
                                      navigator.clipboard.writeText(detailText)
                                      setCopiedDetailId(item.id)
                                      setTimeout(() => setCopiedDetailId((current) => (current === item.id ? null : current)), 2000)
                                    }
                                  }}
                                  className={`absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                                    copiedDetailId === item.id
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                >
                                  {copiedDetailId === item.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  <span>{copiedDetailId === item.id ? 'Copied' : 'Copy'}</span>
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
          <div className="flex flex-col gap-3 border-t border-slate-200/60 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-slate-500">
              Showing {firstItem}–{lastItem} of {total.toLocaleString()} saved transcripts
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || loading}
                className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              {getPageNumbers(page, totalPages).map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  disabled={loading}
                  className={`h-8 min-w-8 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    pageNumber === page
                      ? 'apple-btn-primary text-white shadow-xs'
                      : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || loading}
                className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
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
