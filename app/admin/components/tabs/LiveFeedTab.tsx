'use client'

import React from 'react'
import { Radio, FileAudio } from 'lucide-react'
import type { AdminStats } from '../../types'

interface LiveFeedTabProps {
  recentTranscripts: AdminStats['recentTranscripts']
  onInspectTranscript: (t: AdminStats['recentTranscripts'][0]) => void
}

export function LiveFeedTab({
  recentTranscripts,
  onInspectTranscript
}: LiveFeedTabProps) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-500" />
            <span>Live Platform Transcriptions Stream</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any transcription row to inspect the generated text, language quality, and audio cadence.
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
          Interactive Quality Stream
        </span>
      </div>

      <div className="overflow-x-auto mt-2">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
              <th className="pb-3 pr-4">Media File</th>
              <th className="pb-3 px-4">Language</th>
              <th className="pb-3 px-4">Duration</th>
              <th className="pb-3 px-4">Word Count</th>
              <th className="pb-3 px-4">User</th>
              <th className="pb-3 px-4">Time</th>
              <th className="pb-3 pl-4 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {recentTranscripts && recentTranscripts.length > 0 ? (
              recentTranscripts.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onInspectTranscript(t)}
                  className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer group"
                >
                  <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2 max-w-xs truncate">
                    <FileAudio className="h-4 w-4 shrink-0 text-blue-500 group-hover:scale-110 transition-transform" />
                    <span className="truncate">{t.filename}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="rounded-md bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
                      {t.language}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                    {Math.floor(t.duration / 60)}m {Math.round(t.duration % 60)}s
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                    {t.wordCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                    {t.userEmail}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      View Text
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                  No recent transcriptions logged in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
