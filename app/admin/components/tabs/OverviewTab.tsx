'use client'

import React from 'react'
import {
  TrendingUp,
  Globe,
  Layers,
  Clock,
  Download
} from 'lucide-react'
import type { AdminStats, DateRangeOption } from '../../types'
import { exportTelemetryToCsv } from '../../utils/adminHelpers'

interface OverviewTabProps {
  stats: AdminStats
  currentTime: Date
  selectedRange: DateRangeOption
}

export function OverviewTab({ stats, currentTime, selectedRange }: OverviewTabProps) {
  const maxHourlyCount = Math.max(1, ...(stats?.hourlyActivity || [1]))

  return (
    <div className="flex flex-col gap-8">
      {/* Batch Processing Queue Health Card */}
      {stats.batchQueue && (
        <div className="rounded-3xl border border-blue-200/60 dark:border-blue-900/40 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 p-6 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ${
                    stats.batchQueue.totalBatches > 0 ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Batch Processing Queue Health & Turnaround
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Telemetry metrics for multi-file bulk uploads and parallel speech recognition pipelines.
              </p>
            </div>
            <span
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                stats.batchQueue.totalBatches > 0
                  ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400'
              }`}
            >
              {stats.batchQueue.avgSpeed} Turnaround
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Total Batch Jobs</span>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                {stats.batchQueue.totalBatches}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Batch Success Rate</span>
              <p
                className={`text-xl font-extrabold mt-0.5 ${
                  stats.batchQueue.totalBatches > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {stats.batchQueue.successRate}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Batch Audio Handled</span>
              <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {stats.batchQueue.audioMinutes} mins
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Completed vs Failed</span>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                {stats.batchQueue.successful} <span className="text-xs text-slate-400 font-normal">ok</span> /{' '}
                <span className={stats.batchQueue.failed > 0 ? 'text-red-500' : 'text-slate-400'}>
                  {stats.batchQueue.failed}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Chart */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {stats.range.isHourly
                  ? selectedRange === 'yesterday'
                    ? "Yesterday's Hourly Audio Activity"
                    : "Today's 24-Hour Activity Timeline"
                  : 'Transcription Volume by Day'}
              </h2>
              <span className="rounded-md bg-blue-50 dark:bg-blue-950/80 border border-blue-200/70 dark:border-blue-900/60 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                Cambodia Time (ICT / UTC+7)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stats.range.isHourly
                ? 'Hourly distribution of audio minutes and request traffic in Cambodia local time (00:00 to 23:00 ICT).'
                : 'Daily audio minutes and request volume across all users in active window.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-500"></div>
              <span>Audio (mins)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-500"></div>
              <span>Requests</span>
            </div>
            <button
              onClick={() => exportTelemetryToCsv(stats.dailyStats, selectedRange)}
              disabled={!stats.dailyStats || stats.dailyStats.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              title="Download timeline telemetry to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Visual Dual Bar Chart (Audio Minutes & Requests) */}
        <div className="mt-4 flex h-48 items-end justify-between gap-1 sm:gap-2 pt-6 border-b border-slate-100 dark:border-slate-800 px-1">
          {stats.dailyStats.map((item, idx) => {
            const maxDur = Math.max(0.1, ...stats.dailyStats.map((d) => d.duration))
            const maxReq = Math.max(1, ...stats.dailyStats.map((d) => d.requests))

            const durPercent =
              item.duration > 0
                ? Math.min(100, Math.max(10, Math.round((item.duration / maxDur) * 100)))
                : 0
            const reqPercent =
              item.requests > 0
                ? Math.min(100, Math.max(10, Math.round((item.requests / maxReq) * 100)))
                : 0

            // In hourly view, highlight current hour if viewing today
            const currentHourStr = `${String(currentTime.getHours()).padStart(2, '0')}:00`
            const isCurrentHour =
              stats.range.isHourly && item.date === currentHourStr && selectedRange === 'today'
            const isToday =
              !stats.range.isHourly && item.date === new Date().toISOString().split('T')[0]

            return (
              <div
                key={item.date || idx}
                className="group relative flex flex-1 max-w-7 sm:max-w-10 flex-col items-center h-full justify-end cursor-pointer"
              >
                {/* Tooltip on Hover */}
                <div className="absolute -top-14 z-30 hidden group-hover:flex flex-col items-center rounded-xl bg-slate-950/95 border border-slate-800 text-white px-3 py-1.5 text-[10px] shadow-2xl whitespace-nowrap pointer-events-none backdrop-blur-md">
                  <span className="font-bold text-slate-200">
                    {item.date} {stats.range.isHourly ? 'ICT' : ''}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-mono">
                    <span className="text-sky-400 font-semibold">{item.duration.toFixed(1)}m audio</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-indigo-300 font-semibold">
                      {item.requests} req{item.requests === 1 ? '' : 's'}
                    </span>
                    {item.errors > 0 && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="text-rose-400 font-semibold">{item.errors} err</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Paired Bar Group: Blue = Audio mins, Indigo = Requests */}
                <div className="flex h-full w-full items-end justify-center gap-0.5 sm:gap-1 px-0.5">
                  {/* Audio Bar (Blue) */}
                  <div
                    style={{ height: durPercent > 0 ? `${durPercent}%` : '3px' }}
                    className={`w-1/2 rounded-t-xs sm:rounded-t-sm transition-all group-hover:brightness-125 ${
                      durPercent > 0
                        ? isCurrentHour || isToday
                          ? 'bg-gradient-to-t from-blue-600 to-sky-400 shadow-sm shadow-blue-500/40 ring-1 ring-blue-400'
                          : 'bg-gradient-to-t from-blue-500 to-sky-400 shadow-xs shadow-blue-500/20'
                        : 'bg-slate-200 dark:bg-slate-800/80'
                    }`}
                  />
                  {/* Requests Bar (Indigo) */}
                  <div
                    style={{ height: reqPercent > 0 ? `${reqPercent}%` : '3px' }}
                    className={`w-1/2 rounded-t-xs sm:rounded-t-sm transition-all group-hover:brightness-125 ${
                      reqPercent > 0
                        ? isCurrentHour || isToday
                          ? 'bg-gradient-to-t from-indigo-600 to-purple-400 shadow-sm shadow-purple-500/40 ring-1 ring-purple-400'
                          : 'bg-gradient-to-t from-indigo-500 to-purple-400 shadow-xs shadow-indigo-500/20'
                        : 'bg-slate-200 dark:bg-slate-800/80'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-axis labels */}
        {stats.range.isHourly ? (
          <div className="flex justify-between text-[10px] font-mono text-slate-400 px-1">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>23:00</span>
          </div>
        ) : (
          <div className="flex justify-between text-[10px] font-mono text-slate-400 px-1">
            <span>{stats.dailyStats[0]?.date || 'Past'}</span>
            <span>{stats.dailyStats[Math.floor(stats.dailyStats.length / 2)]?.date || 'Mid'}</span>
            <span className="text-blue-500 font-bold">
              {stats.dailyStats[stats.dailyStats.length - 1]?.date || 'Today'}
            </span>
          </div>
        )}
      </div>

      {/* Grid of 3 Distribution Breakdowns: Languages, Input Types, Peak Hours */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Language Breakdown */}
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-500" />
              <span>Language Detection</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">In Range</span>
          </div>

          <div className="flex flex-col gap-3 mt-1">
            {stats.languages && stats.languages.length > 0 ? (
              stats.languages.map((l) => (
                <div key={l.language} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{l.language}</span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                      {l.count} ({l.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${l.percentage}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">No language data recorded yet.</p>
            )}
          </div>
        </div>

        {/* Input Mode & Formats */}
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500" />
              <span>Input Modes & Formats</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">In Range</span>
          </div>

          <div className="flex flex-col gap-3 mt-1">
            {stats.inputModes?.map((im) => (
              <div key={im.mode} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{im.mode} Upload</span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono">
                    {im.count} ({im.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${im.percentage}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                  />
                </div>
              </div>
            ))}

            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-1.5">
              {stats.formats?.map((f) => (
                <span
                  key={f.format}
                  className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono text-slate-600 dark:text-slate-400"
                >
                  .{f.format} ({f.count})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 24-Hour Activity Heatmap */}
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span>24-Hour Peak Activity</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">Cambodia Time (ICT)</span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Usage distribution across the hours of the day (00:00 to 23:00 ICT).
          </p>

          <div className="flex items-end gap-1 h-28 pt-4 border-b border-slate-100 dark:border-slate-800">
            {stats.hourlyActivity?.map((count, hr) => {
              const hPercent = Math.min(100, Math.max(6, Math.round((count / maxHourlyCount) * 100)))
              return (
                <div key={hr} className="group relative flex flex-1 flex-col items-center h-full justify-end">
                  <div className="absolute -top-7 z-20 hidden group-hover:flex rounded bg-slate-950 text-white px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap">
                    {hr}:00 ICT — {count} req{count === 1 ? '' : 's'}
                  </div>
                  <div
                    style={{ height: `${hPercent}%` }}
                    className={`w-full rounded-t-xs transition-all ${
                      count > 0 ? 'bg-amber-500/80 dark:bg-amber-400/80' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>
    </div>
  )
}
