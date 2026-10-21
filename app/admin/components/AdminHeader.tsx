'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, Send, RefreshCw, Clock } from 'lucide-react'
import type { RefreshIntervalOption } from '../types'

interface AdminHeaderProps {
  currentTime: Date
  isSyncing: boolean
  lastSyncTime: Date
  refreshInterval: RefreshIntervalOption
  onRefreshIntervalChange: (interval: RefreshIntervalOption) => void
  onSync: () => void
  onOpenTelegram: () => void
}

export function AdminHeader({
  currentTime,
  isSyncing,
  lastSyncTime,
  refreshInterval,
  onRefreshIntervalChange,
  onSync,
  onOpenTelegram
}: AdminHeaderProps) {
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000))
      setSecondsAgo(diff)
    }
    update()
    const timer = setInterval(update, 2000)
    return () => clearInterval(timer)
  }, [lastSyncTime])

  const formatLastSync = () => {
    if (isSyncing) return 'Syncing...'
    if (secondsAgo < 5) return 'Synced just now'
    if (secondsAgo < 60) return `Synced ${secondsAgo}s ago`
    const mins = Math.floor(secondsAgo / 60)
    return `Synced ${mins}m ago`
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Admin Intelligence & Operations
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Live API key fleet diagnostics, batch processing metrics, and user dossier intelligence.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Live Clock & Relative Sync Pill */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">
            {formatLastSync()}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
            {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Configurable Auto-Refresh Interval Selector */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 p-1 text-xs border border-slate-200/60 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Auto:
          </span>
          {(['off', '15s', '30s', '60s'] as RefreshIntervalOption[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onRefreshIntervalChange(opt)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                refreshInterval === opt
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={opt === 'off' ? 'Disable auto-refresh' : `Refresh automatically every ${opt}`}
            >
              {opt === 'off' ? 'Off' : opt}
            </button>
          ))}
        </div>

        {/* Telegram Command Center Button */}
        <button
          onClick={onOpenTelegram}
          className="flex items-center gap-2 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 px-3.5 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-all active:scale-95 cursor-pointer border border-sky-500/20 shadow-xs"
          title="Open Telegram Bot Operations & 2-Way Interactive Controls"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Telegram</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
        </button>

        {/* Sync Button */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-bold text-white dark:text-slate-950 shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
          title="Sync telemetry now (Shortcut: R)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sync</span>
          <kbd className="hidden sm:inline-block px-1 py-0.5 rounded bg-white/20 dark:bg-slate-900/20 text-[10px] font-mono leading-none">
            R
          </kbd>
        </button>
      </div>
    </div>
  )
}
