'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Filter,
  Headphones,
  Link2,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { downloadTxt } from '@/lib/download'
import { getPlainTranscriptText } from '@/lib/transcript'
import { useSession, signIn } from 'next-auth/react'
import { useTranscriptStore } from '@/store/transcriptStore'

const PAGE_SIZE = 15

type TranscriptRecord = {
  id: string
  text?: string
  rawText?: string
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
  languages?: string[]
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
  const router = useRouter()
  const { status } = useSession()
  const [history, setHistory] = useState<TranscriptRecord[]>([])
  const [details, setDetails] = useState<Record<string, string>>({})
  const [rawDetails, setRawDetails] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [copiedDetailId, setCopiedDetailId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all')
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([])

  const fetchHistory = useCallback(async (pageToLoad: number, search = searchQuery, lang = selectedLanguage) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('page', pageToLoad.toString())
      if (search.trim()) params.set('q', search.trim())
      if (lang && lang !== 'all') params.set('lang', lang)

      const response = await fetch(`/api/history?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load transcript history.')

      const data: HistoryResponse = await response.json()
      setHistory(data.items)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      if (data.languages) setAvailableLanguages(data.languages)
      setExpandedId(null)

      if (data.page !== pageToLoad) setPage(data.page)
    } catch (fetchError) {
      console.error('Failed to fetch history', fetchError)
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load transcript history.')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedLanguage])

  // Debounced search
  useEffect(() => {
    if (status !== 'authenticated') return
    const timer = setTimeout(() => {
      setPage(1)
      fetchHistory(1, searchQuery, selectedLanguage)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedLanguage, status])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchHistory(page, searchQuery, selectedLanguage)
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [status, page])

  const loadTranscriptRecord = async (id: string) => {
    if (details[id] !== undefined) {
      return { text: details[id], rawText: rawDetails[id] || details[id] }
    }

    setLoadingDetailId(id)
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load this transcript.')

      const item: TranscriptRecord = await response.json()
      const text = getPlainTranscriptText(item.text || '')
      const rawText = item.rawText || item.text || ''
      setDetails((current) => ({ ...current, [id]: text }))
      setRawDetails((current) => ({ ...current, [id]: rawText }))
      return { text, rawText }
    } catch (detailError) {
      console.error('Failed to load transcript', detailError)
      setError(detailError instanceof Error ? detailError.message : 'Unable to load this transcript.')
      return null
    } finally {
      setLoadingDetailId(null)
    }
  }

  const loadTranscriptText = async (id: string) => {
    const record = await loadTranscriptRecord(id)
    return record ? record.text : null
  }

  const handleReviewInPlayer = async (item: TranscriptRecord, event: React.MouseEvent) => {
    event.stopPropagation()
    const record = await loadTranscriptRecord(item.id)
    if (!record) return

    useTranscriptStore.getState().setTranscriptWithAudio({
      text: record.rawText || record.text,
      source: getSourceName(item),
      duration: item.duration || 0,
      language: item.language || 'auto'
    }, null)

    router.push('/#workspace')
  }

  const togglePreview = async (item: TranscriptRecord) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(item.id)
    await loadTranscriptText(item.id)
  }

  const handleCopy = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const text = await loadTranscriptText(id)
    if (text === null) return

    try {
      await navigator.clipboard.writeText(text)
      setCopiedDetailId(id)
      setTimeout(() => setCopiedDetailId(null), 2000)
    } catch (copyError) {
      console.error('Failed to copy', copyError)
      setError('Unable to copy transcript to clipboard.')
    }
  }

  const handleDownload = async (item: TranscriptRecord, event: React.MouseEvent) => {
    event.stopPropagation()
    const text = await loadTranscriptText(item.id)
    if (text !== null) downloadTxt(text, getSourceName(item))
  }

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!confirm('Are you sure you want to delete this transcript?')) return
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
        await fetchHistory(page, searchQuery, selectedLanguage)
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Transcript History</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Sign in to view, download, search, and manage transcripts saved to your account.
        </p>
        <button
          onClick={() => signIn()}
          className="apple-btn-primary mt-6 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all active:scale-95 cursor-pointer"
        >
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Transcript History
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Search past transcripts, inspect audio duration, and export text files.
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 px-3.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs backdrop-blur-md">
          {total.toLocaleString()} Saved Jobs
        </span>
      </div>

      {/* Search & Filter Controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by keywords, filename, or source..."
            className="w-full rounded-2xl border border-slate-200/80 bg-white/90 py-2.5 pl-10 pr-9 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-500 transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Language Filter */}
        {availableLanguages.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Filter:
            </span>
            <button
              onClick={() => setSelectedLanguage('all')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedLanguage === 'all'
                  ? 'bg-slate-900 text-white dark:bg-blue-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              All
            </button>
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-all ${
                  selectedLanguage === lang
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-200/80 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 backdrop-blur-md">
          <span>{error}</span>
          <button onClick={() => fetchHistory(page)} className="font-semibold underline hover:text-red-900 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* macOS Style Table Card */}
      <div className="apple-glass-card overflow-hidden rounded-3xl transition-all">
        {loading ? (
          <div className="flex items-center justify-center gap-2.5 p-20 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span>Loading history…</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center p-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
              <FileText className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              {searchQuery ? 'No matching transcripts found' : 'No transcripts yet'}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {searchQuery ? `Try searching for different keywords.` : 'Transcripts you generate will automatically be saved and organized here.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Clear search query
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead className="border-b border-slate-200/60 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Source / File Name</th>
                  <th className="w-32 px-4 py-4">Language</th>
                  <th className="w-28 px-4 py-4 text-right">Words</th>
                  <th className="w-40 px-4 py-4">Date</th>
                  <th className="w-36 px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/80">
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
                          isExpanded
                            ? 'bg-blue-50/30 dark:bg-blue-950/20'
                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="max-w-md px-6 py-4">
                          <div className="flex min-w-0 items-center gap-3.5">
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${
                                isLink
                                  ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 ring-1 ring-purple-500/10'
                                  : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 ring-1 ring-blue-500/10'
                              }`}
                            >
                              {isLink ? <Link2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={sourceName}>
                                {sourceName}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                {isLink ? 'Web / Video link' : 'Uploaded media'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-slate-100/90 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700">
                            {item.language || 'Auto'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                          {item.wordCount?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(event) => handleReviewInPlayer(item, event)}
                              className="rounded-full p-2 text-slate-400 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/50 dark:hover:text-purple-400 transition-colors cursor-pointer"
                              title="Review in Audio Player & Karaoke Sync"
                            >
                              <Headphones className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(event) => handleDownload(item, event)}
                              className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400 transition-colors cursor-pointer"
                              title="Download TXT"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(event) => handleDelete(item.id, event)}
                              disabled={deletingId === item.id}
                              className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors disabled:opacity-40 cursor-pointer"
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

                      {/* Expandable Preview */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/50 dark:bg-slate-900/40 px-6 py-5 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  Transcript Preview
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(event) => handleReviewInPlayer(item, event)}
                                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-95 cursor-pointer"
                                    title="Open in player with sync highlighter"
                                  >
                                    <Headphones className="h-3.5 w-3.5" /> Review in Player
                                  </button>
                                  <button
                                    onClick={(event) => handleCopy(item.id, event)}
                                    className="flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                  >
                                    {copiedDetailId === item.id ? (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5" /> Copy
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={(event) => handleDownload(item, event)}
                                    className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                                  >
                                    <Download className="h-3.5 w-3.5" /> Download TXT
                                  </button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto whitespace-pre-wrap">
                                {loadingDetailId === item.id ? (
                                  <div className="flex items-center justify-center p-6 text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading full transcript...
                                  </div>
                                ) : (
                                  detailText || 'No transcript text available.'
                                )}
                              </div>
                            </div>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-800 px-6 py-4">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages} ({total} items)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {getPageNumbers(page, totalPages).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                    p === page
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
