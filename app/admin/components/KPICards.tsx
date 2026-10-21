'use client'

import { Users, Clock, FileAudio, CheckCircle2, Key, Zap } from 'lucide-react'
import type { AdminStats } from '../types'

interface KPICardsProps {
  stats: AdminStats
}

export function KPICards({ stats }: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Total Users */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">Total Users</span>
          <Users className="h-4 w-4 text-blue-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          {stats.overview.totalUsers}
        </p>
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
          +{stats.overview.newUsersInRange} in range
        </p>
      </div>

      {/* Audio Spoken */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">Audio Spoken</span>
          <Clock className="h-4 w-4 text-indigo-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          {stats.overview.totalAudioHours}h
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {stats.overview.totalAudioMinutes} mins in range
        </p>
      </div>

      {/* Transcriptions */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">Transcriptions</span>
          <FileAudio className="h-4 w-4 text-violet-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          {stats.overview.totalTranscripts}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {stats.overview.totalWords.toLocaleString()} words
        </p>
      </div>

      {/* Success Rate */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">Success Rate</span>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
        <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
          {stats.overview.successRate}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {stats.errors.totalErrors} errors logged
        </p>
      </div>

      {/* API Key Fleet */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">API Key Fleet</span>
          <Key className="h-4 w-4 text-amber-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          {stats.keyFleet?.length || 1}
        </p>
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
          Auto-rotated pool
        </p>
      </div>

      {/* Tokens in Window */}
      <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold">Tokens in Window</span>
          <Zap className="h-4 w-4 text-blue-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
          {stats.tokens.tokensInRange > 1000 ? `${(stats.tokens.tokensInRange / 1000).toFixed(1)}k` : stats.tokens.tokensInRange}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          ${stats.tokens.estimatedCostRangeUSD} est.
        </p>
      </div>
    </div>
  )
}
