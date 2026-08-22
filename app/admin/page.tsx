'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  DollarSign,
  FileAudio,
  HardDrive,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  Zap
} from 'lucide-react'

type AdminStats = {
  overview: {
    totalUsers: number
    newUsersToday: number
    newUsersThisWeek: number
    totalTranscripts: number
    totalAudioMinutes: number
    totalAudioHours: string
    totalWords: number
    successRate: string
  }
  tokens: {
    tokensToday: number
    inputTokensToday: number
    outputTokensToday: number
    totalTokensThirtyDays: number
    estimatedCostTodayUSD: string
  }
  models: Array<{
    model: string
    requests: number
    tokens: number
    durationMinutes: number
  }>
  dailyStats: Array<{
    date: string
    tokens: number
    requests: number
    duration: number
    errors: number
  }>
  errors: {
    totalErrors: number
    errorsToday: number
    recent: Array<{
      id: string
      endpoint: string
      errorMessage: string
      errorType: string
      model: string
      fileFormat: string
      userEmail: string
      createdAt: string
    }>
  }
}

type ManagedUser = {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  transcriptionCount: number
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [clearingErrors, setClearingErrors] = useState(false)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tokens' | 'models' | 'errors'>('overview')

  const [isSyncing, setIsSyncing] = useState(false)
  const [isTabActive, setIsTabActive] = useState(true)
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date())

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3500)
  }

  // Fetch stats smoothly (silent background update prevents full-page flash)
  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setIsSyncing(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error('Failed to load admin statistics.')
      }
      const data: AdminStats = await res.json()
      setStats(data)
      setLastSyncTime(new Date())
    } catch (err) {
      console.error(err)
      if (!silent) {
        setErrorMsg(err instanceof Error ? err.message : 'Error loading dashboard.')
      }
    } finally {
      if (!silent) setLoading(false)
      setIsSyncing(false)
    }
  }, [])

  // Fetch users smoothly
  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setUsersLoading(true)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      if (!silent) setUsersLoading(false)
    }
  }, [])

  // Smart Polling & Auto-Sleep Lifecycle
  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'admin') {
      if (status === 'unauthenticated') setLoading(false)
      return
    }

    // Initial fetch
    fetchStats(false)
    fetchUsers(false)

    // 1. Cross-tab activity listener (e.g. immediate update when transcription occurs)
    let bc: BroadcastChannel | null = null
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('signal_admin_sync')
        bc.onmessage = () => {
          // Immediately refresh stats on incoming transcription activity
          fetchStats(true)
          fetchUsers(true)
        }
      }
    } catch {}

    // 2. Tab Visibility & Auto-Sleep handler
    let pollTimer: NodeJS.Timeout | null = null

    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      // Poll every 10 seconds while tab is active
      pollTimer = setInterval(() => {
        if (!document.hidden) {
          fetchStats(true)
          fetchUsers(true)
        }
      }, 10000)
    }

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabActive(false)
        stopPolling() // Go to sleep when tab is hidden
      } else {
        setIsTabActive(true)
        // Immediately wake up and refresh
        fetchStats(true)
        fetchUsers(true)
        startPolling()
      }
    }

    const handleWindowFocus = () => {
      setIsTabActive(true)
      fetchStats(true)
      fetchUsers(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    // Start initial active polling
    startPolling()

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      if (bc) bc.close()
    }
  }, [fetchStats, fetchUsers, session, status])

  const handleRoleChange = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const confirmMsg = newRole === 'admin'
      ? 'Promote this user to Admin? They will have full dashboard access.'
      : 'Demote this user to regular User role?'
    if (!confirm(confirmMsg)) return

    setActionUserId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      })
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        )
        showNotification(`Role updated to ${newRole.toUpperCase()} successfully.`)
      } else {
        const err = await res.json()
        alert(err?.error || 'Failed to update user role.')
      }
    } catch (err) {
      console.error(err)
      alert('Error updating role.')
    } finally {
      setActionUserId(null)
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete user "${email}"? This action cannot be undone.`)) return

    setActionUserId(userId)
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        showNotification(`User ${email} deleted successfully.`)
        fetchStats()
      } else {
        const err = await res.json()
        alert(err?.error || 'Failed to delete user.')
      }
    } catch (err) {
      console.error(err)
      alert('Error deleting user.')
    } finally {
      setActionUserId(null)
    }
  }

  const handleClearErrors = async () => {
    if (!confirm('Are you sure you want to clear all error diagnostic logs?')) return
    setClearingErrors(true)
    try {
      const res = await fetch('/api/admin/stats', { method: 'DELETE' })
      if (res.ok) {
        await fetchStats()
        showNotification('Error logs cleared.')
      }
    } catch (err) {
      console.error('Failed to clear errors:', err)
    } finally {
      setClearingErrors(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  if (status === 'unauthenticated' || (status === 'authenticated' && session?.user?.role !== 'admin')) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Lock className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold text-slate-900">404 - Page Not Found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page does not exist or you do not have permission to view this resource.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-12">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Admin Intelligence</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            System & Operations Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Live telemetry, daily AI token tracking, user management, and error diagnostics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isTabActive ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>{isSyncing ? 'Syncing...' : 'Live Sync Active'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span>Sleeping (Tab Inactive)</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              fetchStats(false)
              fetchUsers(false)
            }}
            disabled={loading || usersLoading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || loading || usersLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh Now</span>
          </button>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-xs text-emerald-900 shadow-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <span className="font-bold">Strict User Privacy Guarantee:</span> Telemetry and user tables strictly monitor infrastructure metrics, token load, and operational status. User transcript text is never logged or exposed.
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Overview & KPIs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Users ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tokens')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'tokens'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>Token Usage</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'models'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>AI Models</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'errors'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Errors & Diagnostics ({stats?.errors.totalErrors || 0})</span>
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span>Loading admin metrics...</span>
          </div>
        </div>
      ) : errorMsg ? (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p className="font-semibold">{errorMsg}</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Top Metric Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Users</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Users className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">{stats?.overview.totalUsers || 0}</span>
                    <span className="text-xs font-semibold text-emerald-600">+{stats?.overview.newUsersToday || 0} today</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">+{stats?.overview.newUsersThisWeek || 0} this week</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tokens Today</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <Zap className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">
                      {(stats?.tokens.tokensToday || 0).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Est. cost: {stats?.tokens.estimatedCostTodayUSD}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Processed Audio</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <Clock className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">{stats?.overview.totalAudioHours || '0.0'} hrs</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{(stats?.overview.totalWords || 0).toLocaleString()} words transcribed</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Success Rate</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">{stats?.overview.successRate}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{stats?.overview.totalTranscripts} total requests</p>
                </div>
              </div>

              {/* Quick Summary Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">Recent Model Activity</h3>
                  <div className="mt-4 divide-y divide-slate-100">
                    {stats?.models.map((m) => (
                      <div key={m.model} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <Cpu className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-slate-800 text-sm">{m.model}</span>
                        </div>
                        <div className="text-right text-xs">
                          <span className="font-bold text-slate-900">{m.requests} requests</span>
                          <span className="text-slate-400 block">{m.tokens.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">System Health & Stability</h3>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                      <span className="text-xs font-medium text-slate-600">Active Database Host</span>
                      <span className="text-xs font-bold text-slate-900">Neon AWS PostgreSQL (US-East-2)</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                      <span className="text-xs font-medium text-slate-600">Email Gateway</span>
                      <span className="text-xs font-bold text-emerald-600">Resend API Connected</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                      <span className="text-xs font-medium text-slate-600">30-Day Processed Tokens</span>
                      <span className="text-xs font-bold text-slate-900">{(stats?.tokens.totalTokensThirtyDays || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">User Management</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Manage accounts, control administrator roles, and monitor user request activity.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-4 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold">No users found matching your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">User</th>
                        <th className="px-5 py-3.5">Role</th>
                        <th className="px-5 py-3.5">Transcriptions</th>
                        <th className="px-5 py-3.5">Joined Date</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const isCurrent = session?.user?.id === u.id || session?.user?.email === u.email
                        const isAdmin = u.role === 'admin'

                        return (
                          <tr key={u.id} className="transition-colors hover:bg-slate-50/60">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                  {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{u.name}</span>
                                    {isCurrent && (
                                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-500">{u.email}</span>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                                  isAdmin
                                    ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isAdmin ? <ShieldCheck className="h-3.5 w-3.5 text-purple-600" /> : <Users className="h-3 w-3 text-slate-500" />}
                                <span>{isAdmin ? 'Admin' : 'User'}</span>
                              </span>
                            </td>

                            <td className="px-5 py-4 font-semibold text-slate-700">
                              {u.transcriptionCount} requests
                            </td>

                            <td className="px-5 py-4 text-slate-500">
                              {new Date(u.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* Role toggle button */}
                                <button
                                  type="button"
                                  disabled={actionUserId === u.id || isCurrent}
                                  onClick={() => handleRoleChange(u.id, u.role)}
                                  title={isAdmin ? 'Demote to User' : 'Promote to Admin'}
                                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    isAdmin
                                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                      : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                  }`}
                                >
                                  {isAdmin ? 'Demote' : 'Make Admin'}
                                </button>

                                {/* Delete button */}
                                <button
                                  type="button"
                                  disabled={actionUserId === u.id || isCurrent}
                                  onClick={() => handleDeleteUser(u.id, u.email)}
                                  title="Delete user"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TOKEN USAGE */}
          {activeTab === 'tokens' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-400">Audio Input Tokens Today</span>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {(stats?.tokens.inputTokensToday || 0).toLocaleString()}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Calculated from media seconds processed</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-400">Text Output Tokens Today</span>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {(stats?.tokens.outputTokensToday || 0).toLocaleString()}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Calculated from words generated</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-400">Total Tokens Today</span>
                  <div className="mt-2 text-2xl font-bold text-blue-600">
                    {(stats?.tokens.tokensToday || 0).toLocaleString()}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Estimated cost: {stats?.tokens.estimatedCostTodayUSD}</p>
                </div>
              </div>

              {/* 14-Day History Table */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900">Daily Token Consumption History (Last 14 Days)</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Requests</th>
                        <th className="py-3 px-4">Duration (Min)</th>
                        <th className="py-3 px-4">Total Tokens</th>
                        <th className="py-3 px-4">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats?.dailyStats.map((row) => (
                        <tr key={row.date} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-semibold text-slate-800">{row.date}</td>
                          <td className="py-3 px-4">{row.requests}</td>
                          <td className="py-3 px-4">{row.duration.toFixed(1)} m</td>
                          <td className="py-3 px-4 font-bold text-blue-600">{row.tokens.toLocaleString()}</td>
                          <td className="py-3 px-4">
                            <span className={row.errors > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>
                              {row.errors}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI MODELS */}
          {activeTab === 'models' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Configured AI Model Performance</h3>
              <p className="text-xs text-slate-500 mt-1">Breakdown of media requests processed per model.</p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {stats?.models.map((m) => (
                  <div key={m.model} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                    <span className="font-bold text-sm text-slate-900 block truncate" title={m.model}>
                      {m.model}
                    </span>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Requests</span>
                        <span className="font-semibold text-slate-900">{m.requests}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tokens</span>
                        <span className="font-semibold text-blue-600">{m.tokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Audio Processed</span>
                        <span className="font-semibold text-slate-900">{m.durationMinutes.toFixed(1)} mins</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: ERROR DIAGNOSTICS & TELEGRAM ALERTS */}
          {activeTab === 'errors' && (
            <div className="space-y-6">
              {/* Telegram Incident Alert Card */}
              <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
                      <Send className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Telegram Intelligence & Daily Digest</h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Real-time error alerts, new user sign-up notices, and automated 5:30 PM daily usage reports dispatched to Telegram.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/admin/telegram/test', { method: 'POST' })
                          const data = await res.json()
                          if (res.ok) {
                            showNotification('Telegram test alert sent successfully!')
                          } else {
                            alert(`Telegram Test Error: ${data.error || 'Check your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID'}`)
                          }
                        } catch {
                          alert('Failed to send Telegram test alert.')
                        }
                      }}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 active:scale-95"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Test Bot Alert</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/admin/telegram/daily-report', { method: 'POST' })
                          const data = await res.json()
                          if (res.ok) {
                            showNotification('5:30 PM Daily Digest sent to Telegram!')
                          } else {
                            alert(`Report Error: ${data.error || 'Failed to dispatch report'}`)
                          }
                        } catch {
                          alert('Failed to send daily digest report.')
                        }
                      }}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Send Daily Report Now</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Log Table */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 p-5">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Error Diagnostic Logs</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Real-time error traces captured from transcribe API to troubleshoot user issues.
                    </p>
                  </div>
                  {stats && stats.errors.recent.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearErrors}
                      disabled={clearingErrors}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{clearingErrors ? 'Clearing...' : 'Clear All Errors'}</span>
                    </button>
                  )}
                </div>

              {stats?.errors.recent.length === 0 ? (
                <div className="p-12 text-center text-emerald-600">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-bold">Zero errors detected!</p>
                  <p className="text-xs text-slate-400 mt-1">All transcription endpoints are running smoothly.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-4">Endpoint</th>
                        <th className="py-3 px-4">Error Message</th>
                        <th className="py-3 px-4">Model</th>
                        <th className="py-3 px-4">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats?.errors.recent.map((err) => (
                        <tr key={err.id} className="hover:bg-red-50/40">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {new Date(err.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{err.endpoint}</td>
                          <td className="py-3 px-4 font-mono text-red-600 max-w-xs truncate" title={err.errorMessage}>
                            {err.errorMessage}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{err.model || 'N/A'}</td>
                          <td className="py-3 px-4 text-slate-500">{err.userEmail || 'Anonymous'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
)
}
