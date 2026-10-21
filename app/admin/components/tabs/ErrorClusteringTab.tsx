'use client'

import React from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  Trash2,
  Download
} from 'lucide-react'
import type { AdminStats } from '../../types'
import { exportErrorsToCsv } from '../../utils/adminHelpers'

interface ErrorClusteringTabProps {
  errors: AdminStats['errors']
  errorClusters?: AdminStats['errorClusters']
  activeClusterId: string | null
  setActiveClusterId: (id: string | null) => void
  onInspectError: (err: AdminStats['errors']['recent'][0]) => void
  onClearErrors: () => void
  clearingErrors: boolean
}

export function ErrorClusteringTab({
  errors,
  errorClusters,
  activeClusterId,
  setActiveClusterId,
  onInspectError,
  onClearErrors,
  clearingErrors
}: ErrorClusteringTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Error Clustering Section */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <span>Error Clustering & Root Cause Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Errors automatically bucketed by root cause with immediate remediation advice for operators.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
          {errorClusters?.map((cluster) => {
            const isSelected = activeClusterId === cluster.id

            return (
              <div
                key={cluster.id}
                onClick={() => setActiveClusterId(isSelected ? null : cluster.id)}
                className={`flex flex-col gap-2.5 rounded-2xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">
                    {cluster.name}
                  </span>
                  <span className="rounded-full bg-red-100 dark:bg-red-950/80 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-400 font-mono">
                    {cluster.count} ({cluster.percentage}%)
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
                  <span className="font-bold block text-[10px] uppercase text-amber-600 dark:text-amber-400 mb-0.5">
                    🛠 Remediation Advice
                  </span>
                  {cluster.remediation}
                </div>

                {cluster.sampleErrors.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-slate-200/60 dark:border-slate-800 pt-2">
                    <span className="text-[10px] uppercase text-slate-400 font-semibold">Latest Incident Excerpt:</span>
                    <p className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                      &quot;{cluster.sampleErrors[0].message}&quot;
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Raw Error Logs Table */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>Raw Error Log Entries</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Individual telemetry failure reports captured across client uploads and API execution.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportErrorsToCsv(errors.recent)}
              disabled={errors.recent.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              title="Download incident logs to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClearErrors}
              disabled={clearingErrors || errors.recent.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Logs</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pr-4">Timestamp</th>
                <th className="pb-3 px-4">Error Message</th>
                <th className="pb-3 px-4">Type</th>
                <th className="pb-3 px-4">Format</th>
                <th className="pb-3 px-4">User</th>
                <th className="pb-3 pl-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {errors.recent.length > 0 ? (
                errors.recent.map((err) => (
                  <tr key={err.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(err.createdAt).toLocaleDateString()}{' '}
                      {new Date(err.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 max-w-sm truncate font-semibold text-slate-900 dark:text-white">
                      {err.errorMessage}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded-md bg-red-100 dark:bg-red-950/60 px-2 py-0.5 font-bold text-red-700 dark:text-red-400 text-[10px]">
                        {err.errorType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {err.fileFormat}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {err.userEmail}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        onClick={() => onInspectError(err)}
                        className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✨ Zero active error incidents in this period!
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
