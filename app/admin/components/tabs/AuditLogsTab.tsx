'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Search,
  RefreshCw,
  Loader2,
  Calendar,
  Lock,
  UserCheck,
  Zap,
  Trash2,
  Database,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface AuditLogEntry {
  id: string
  adminId: string
  adminEmail: string
  action: string
  targetId?: string | null
  metadata?: any
  ipAddress: string
  createdAt: string
}

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async (q = '', act = 'all') => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/audit-logs?q=${encodeURIComponent(q)}&action=${encodeURIComponent(act)}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setTotalCount(data.totalCount || 0)
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs(search, actionFilter)
  }, [fetchLogs, search, actionFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchLogs(search, actionFilter)
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ROLE_CHANGE':
        return { label: 'Role Change', bg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300/60' }
      case 'USER_DELETE':
        return { label: 'User Deleted', bg: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-300/60' }
      case 'QUOTA_RESET':
        return { label: 'Quota Reset', bg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300/60' }
      case 'QUOTA_BOOST':
        return { label: 'Bonus Quota', bg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-300/60' }
      case 'CLEAR_TRANSCRIPT_CACHE':
      case 'DELETE_CACHE_ITEM':
        return { label: 'Cache Purge', bg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border-purple-300/60' }
      case 'PING_FLEET':
        return { label: 'Fleet Diagnostic', bg: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 border-sky-300/60' }
      case 'CLEAR_ERRORS':
        return { label: 'Cleared Errors', bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300/60' }
      default:
        return { label: action, bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300/60' }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              <span>Admin Security & Audit Logs ({totalCount})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable forensic log of all administrative operations, user role modifications, quota adjustments, and cache evictions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search email, action, IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Actions</option>
              <option value="ROLE_CHANGE">Role Changes</option>
              <option value="QUOTA_RESET">Quota Resets</option>
              <option value="QUOTA_BOOST">Bonus Grants</option>
              <option value="USER_DELETE">User Deletions</option>
              <option value="CLEAR_TRANSCRIPT_CACHE">Cache Purges</option>
              <option value="PING_FLEET">Fleet Diagnostics</option>
            </select>

            <button
              onClick={() => fetchLogs(search, actionFilter)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pr-4">Timestamp</th>
                <th className="pb-3 px-4">Admin Operator</th>
                <th className="pb-3 px-4">Action</th>
                <th className="pb-3 px-4">Target Resource</th>
                <th className="pb-3 px-4">IP Address</th>
                <th className="pb-3 pl-4 text-right">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <span>Loading security audit records...</span>
                  </td>
                </tr>
              ) : logs.length > 0 ? (
                logs.map((log) => {
                  const badge = getActionBadge(log.action)
                  const isExpanded = expandedId === log.id

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pr-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(log.createdAt).toLocaleDateString()}{' '}
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {log.adminEmail}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {log.targetId ? `${log.targetId.slice(0, 14)}...` : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {log.ipAddress}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          {log.metadata ? (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            >
                              <span>Details</span>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && log.metadata && (
                        <tr className="bg-slate-50/80 dark:bg-slate-950/60">
                          <td colSpan={6} className="py-2.5 px-4">
                            <pre className="max-h-40 overflow-y-auto rounded-xl bg-slate-900 p-3 text-[11px] font-mono text-emerald-400 leading-relaxed border border-slate-800">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                    No audit records found.
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
