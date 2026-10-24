'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Database,
  Search,
  Trash2,
  RefreshCw,
  Loader2,
  Clock,
  Zap,
  FileText,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react'

interface CacheEntry {
  id: string
  audioHash: string
  language: string
  duration: number
  createdAt: string
  textPreview: string
}

interface CacheStats {
  totalCached: number
  totalAudioMinutes: number
  totalAudioHours: string
  estimatedTokensSaved: number
  estimatedRequestsSaved: number
}

export function CacheManagementTab() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [entries, setEntries] = useState<CacheEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const fetchCache = useCallback(async (query = '') => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/cache?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setEntries(data.entries)
      }
    } catch (err) {
      console.error('Failed to load cache data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCache()
  }, [fetchCache])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCache(search)
  }

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Are you sure you want to evict this transcript from the cache? Re-uploading this exact audio will incur a fresh API request.')) {
      return
    }

    try {
      setActionId(id)
      const res = await fetch(`/api/admin/cache?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        if (stats) {
          setStats({ ...stats, totalCached: Math.max(0, stats.totalCached - 1) })
        }
        setFeedback('Cache item evicted successfully.')
        setTimeout(() => setFeedback(null), 3000)
      }
    } catch {
      alert('Failed to delete cache item.')
    } finally {
      setActionId(null)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('⚠️ WARNING: Clear the entire transcript cache? All duplicate-upload instant hits will be reset.')) {
      return
    }

    try {
      setClearingAll(true)
      const res = await fetch('/api/admin/cache?clearAll=true', {
        method: 'DELETE'
      })
      if (res.ok) {
        setEntries([])
        if (stats) {
          setStats({
            ...stats,
            totalCached: 0,
            totalAudioMinutes: 0,
            totalAudioHours: '0.0',
            estimatedTokensSaved: 0,
            estimatedRequestsSaved: 0
          })
        }
        setFeedback('Entire transcript cache cleared.')
        setTimeout(() => setFeedback(null), 3000)
      }
    } catch {
      alert('Failed to clear cache.')
    } finally {
      setClearingAll(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Cached Audio</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Database className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {stats?.totalCached ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Zero-cost repeated files</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Audio Duration Saved</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {stats?.totalAudioHours ?? '0.0'} hrs
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">({stats?.totalAudioMinutes ?? 0} total mins)</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">API Calls Saved</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {stats?.estimatedRequestsSaved ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Preserved Gemini quota</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Est. Tokens Saved</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {(stats?.estimatedTokensSaved ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Bypassed LLM processing</p>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Main Table Card */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span>Transcript Cache Intelligence</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Media SHA-256 hash deduplication cache. Identical files return in 0.1s without hitting Gemini API rate limits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search hash or content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>

            <button
              onClick={() => fetchCache(search)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleClearAll}
              disabled={clearingAll || entries.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200/80 dark:border-red-800/60 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Purge All Cache</span>
            </button>
          </div>
        </div>

        {/* Cache Entries Table */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pr-4">Audio SHA-256 Hash</th>
                <th className="pb-3 px-4">Language</th>
                <th className="pb-3 px-4 text-center">Duration</th>
                <th className="pb-3 px-4">Preview Excerpt</th>
                <th className="pb-3 px-4">Cached At</th>
                <th className="pb-3 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <span>Loading cached transcripts...</span>
                  </td>
                </tr>
              ) : entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-4 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                      {entry.audioHash.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {entry.language}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                      {Math.round(entry.duration)}s
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-500 dark:text-slate-400 text-[11px]" title={entry.textPreview}>
                      {entry.textPreview || '<No transcript content>'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(entry.createdAt).toLocaleDateString()}{' '}
                      {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        disabled={actionId === entry.id}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors cursor-pointer"
                        title="Evict this cache entry"
                      >
                        {actionId === entry.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                    No cached transcript records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
