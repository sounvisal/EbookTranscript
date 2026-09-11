'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  Flame,
  Gauge,
  Globe,
  HardDrive,
  HelpCircle,
  Info,
  Key,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  PieChart,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  X,
  Zap
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type DateRangeOption = 'today' | 'yesterday' | '7d' | '30d' | 'all'

type KeyDiagnostic = {
  index: number
  masked: string
  status: 'healthy' | 'warning' | 'rate_limited' | 'invalid' | 'error'
  latencyMs: number
  httpStatus: number
  message: string
  modelsCount?: number
  lastChecked: string
}

type ErrorCluster = {
  id: string
  name: string
  severity: 'high' | 'medium' | 'low' | 'info'
  count: number
  percentage: string
  remediation: string
  sampleErrors: Array<{ id: string; message: string; timestamp: string }>
}

type AdminStats = {
  range: {
    active: string
    startTime: string
    endTime: string
    daysCount: number
  }
  overview: {
    totalUsers: number
    newUsersToday: number
    newUsersThisWeek: number
    newUsersInRange: number
    totalTranscripts: number
    allTimeTranscripts: number
    totalAudioMinutes: number
    totalAudioHours: string
    totalWords: number
    successRate: string
  }
  batchQueue?: {
    totalBatches: number
    successful: number
    failed: number
    successRate: string
    audioMinutes: number
    avgSpeed: string
  }
  errorClusters?: ErrorCluster[]
  tokens: {
    tokensToday: number
    inputTokensToday: number
    outputTokensToday: number
    tokensInRange: number
    inputTokensInRange: number
    outputTokensInRange: number
    estimatedCostTodayUSD: string
    estimatedCostRangeUSD: string
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
  languages: Array<{
    language: string
    count: number
    percentage: string
  }>
  inputModes: Array<{
    mode: string
    count: number
    percentage: string
  }>
  formats: Array<{
    format: string
    count: number
    percentage: string
  }>
  hourlyActivity: number[]
  keyFleet: Array<{
    index: number
    masked: string
    status: 'active' | 'standby'
    modelPriority: string
    loadSharePercent?: number
    routedRequestsToday?: number
  }>
  telegram: {
    configured: boolean
    chatId: string | null
  }
  recentTranscripts: Array<{
    id: string
    filename: string
    duration: number
    wordCount: number
    language: string
    createdAt: string
    userEmail: string
    userId?: string | null
    textExcerpt?: string
    fullTextLength?: number
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
      metadata: Record<string, unknown> | null
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
  lastActive: string
  transcriptionCount: number
  totalAudioMinutes: number
  totalTokens: number
}

type UserDossier = {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
  createdAt: string
  lastActive: string
  quota: {
    usedMinutes: number
    limitMinutes: number
    remainingMinutes: number
    isAdmin: boolean
  }
  stats: {
    totalTranscripts: number
    totalAudioMinutes: number
    totalTokens: number
    successRate: string
  }
  recentTranscripts: Array<{
    id: string
    filename: string
    duration: number
    wordCount: number
    language: string
    createdAt: string
  }>
  recentErrors: Array<{
    id: string
    errorType: string
    errorMessage: string
    fileFormat: string
    createdAt: string
  }>
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [loading, setLoading] = useState(true)
  const [clearingErrors, setClearingErrors] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'users' | 'keys' | 'tokens' | 'errors'>('overview')
  const [selectedError, setSelectedError] = useState<AdminStats['errors']['recent'][0] | null>(null)

  // 1. Time Machine Date Range State
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>('30d')

  // 2. API Key Ping Diagnostics State
  const [pingResults, setPingResults] = useState<Record<number, KeyDiagnostic>>({})
  const [isPingingKeys, setIsPingingKeys] = useState(false)

  // 3. User Intelligence Dossier State
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userDossier, setUserDossier] = useState<UserDossier | null>(null)
  const [dossierLoading, setDossierLoading] = useState(false)

  // 4. Transcript Content Inspector State
  const [inspectingTranscript, setInspectingTranscript] = useState<AdminStats['recentTranscripts'][0] | null>(null)
  const [copiedTranscript, setCopiedTranscript] = useState(false)

  // 5. Telegram Operations Modal State
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)
  const [dispatchingDigest, setDispatchingDigest] = useState(false)

  // 6. Error Cluster Active View
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null)

  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date())
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // Live second-by-second ticking clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3800)
  }

  // Fetch stats with dynamic date range
  const fetchStats = useCallback(async (silent = false, range: DateRangeOption = selectedRange) => {
    if (!silent) setLoading(true)
    setIsSyncing(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/admin/stats?range=${range}`, { cache: 'no-store' })
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
  }, [selectedRange])

  // Fetch user directory
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

  // Handle date range change
  const handleRangeChange = (range: DateRangeOption) => {
    setSelectedRange(range)
    fetchStats(false, range)
  }

  // Diagnostic Ping All Keys
  const handlePingAllKeys = async () => {
    setIsPingingKeys(true)
    try {
      const res = await fetch('/api/admin/keys/ping', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to ping Gemini API keys.')
      }
      const map: Record<number, KeyDiagnostic> = {}
      data.keys.forEach((k: KeyDiagnostic) => {
        map[k.index] = k
      })
      setPingResults(map)
      showNotification(`Diagnostic complete: ${data.healthyCount}/${data.totalKeys} keys healthy.`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ping probe failed.')
    } finally {
      setIsPingingKeys(false)
    }
  }

  // Open User Intelligence Dossier
  const handleInspectUser = async (userId: string) => {
    setSelectedUserId(userId)
    setDossierLoading(true)
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`)
      const data = await res.json()
      if (res.ok && data.dossier) {
        setUserDossier(data.dossier)
      } else {
        throw new Error(data.error || 'User dossier not found')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to inspect user.')
      setSelectedUserId(null)
    } finally {
      setDossierLoading(false)
    }
  }

  // Export Users to CSV
  const handleExportUsersCsv = () => {
    if (users.length === 0) return
    const headers = ['User ID', 'Name', 'Email', 'Role', 'Joined Date', 'Last Active', 'Transcripts Count', 'Audio Minutes', 'Total Tokens']
    const rows = users.map((u) => [
      `"${u.id}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.role}"`,
      `"${new Date(u.createdAt).toISOString()}"`,
      `"${new Date(u.lastActive).toISOString()}"`,
      u.transcriptionCount,
      u.totalAudioMinutes,
      u.totalTokens
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `transcript_users_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showNotification('✅ User directory exported to CSV.')
  }

  // Copy transcript text to clipboard
  const handleCopyTranscript = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedTranscript(true)
    setTimeout(() => setCopiedTranscript(false), 2200)
    showNotification('Transcript copied to clipboard!')
  }

  // Send Evening Digest Now
  const handleDispatchEveningDigest = async () => {
    setDispatchingDigest(true)
    try {
      const res = await fetch('/api/admin/telegram/daily-report', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch daily digest.')
      }
      showNotification('📊 Evening Digest dispatched to Telegram!')
      setTelegramModalOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Digest dispatch failed.')
    } finally {
      setDispatchingDigest(false)
    }
  }

  // Role Management
  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    if (userId === session?.user?.id && newRole !== 'admin') {
      alert('You cannot revoke administrative privileges from your own account.')
      return
    }
    setActionUserId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Role update failed.')
      }
      showNotification(`User role updated to ${newRole.toUpperCase()}.`)
      fetchUsers(true)
      if (userDossier && userDossier.id === userId) {
        setUserDossier({ ...userDossier, role: newRole })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error changing role.')
    } finally {
      setActionUserId(null)
    }
  }

  // Delete User
  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to permanently delete user: ${userEmail}? All their transcripts and metrics will be purged.`)) {
      return
    }
    setActionUserId(userId)
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user.')
      }
      showNotification(`User ${userEmail} was deleted.`)
      fetchUsers(true)
      fetchStats(true, selectedRange)
      if (selectedUserId === userId) {
        setSelectedUserId(null)
        setUserDossier(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setActionUserId(null)
    }
  }

  // Clear Errors
  const handleClearErrors = async () => {
    if (!confirm('Are you sure you want to clear all error log entries? This action cannot be undone.')) return
    setClearingErrors(true)
    try {
      const res = await fetch('/api/admin/stats', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to clear error logs.')
      showNotification('All error logs have been cleared.')
      fetchStats(true, selectedRange)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear error logs.')
    } finally {
      setClearingErrors(false)
    }
  }

  // Test Telegram
  const handleTestTelegram = async () => {
    setTestingTelegram(true)
    try {
      const res = await fetch('/api/admin/telegram/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Telegram test alert failed.')
      }
      showNotification('✅ Live test alert delivered to Telegram!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Telegram test failed.')
    } finally {
      setTestingTelegram(false)
    }
  }

  // Lifecycle
  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'admin') {
      if (status === 'unauthenticated') setLoading(false)
      return
    }

    fetchStats(false, selectedRange)
    fetchUsers(false)

    let pollTimer: NodeJS.Timeout | null = null
    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = setInterval(() => {
        if (!document.hidden) {
          fetchStats(true, selectedRange)
          fetchUsers(true)
        }
      }, 12000)
    }

    startPolling()
    const handleVisibilityChange = () => {
      if (document.hidden && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      } else if (!document.hidden) {
        fetchStats(true, selectedRange)
        fetchUsers(true)
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (pollTimer) clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [status, session, fetchStats, fetchUsers, selectedRange])

  // Auth gate
  if (status === 'loading' || (loading && !stats)) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Connecting to Intelligence Telemetry...</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Access Restricted</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          You must be authenticated with an administrative account to inspect telemetry, API key rotation, or manage users.
        </p>
      </div>
    )
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase())
    const matchesRole = userRoleFilter === 'all' ? true : u.role === userRoleFilter
    return matchesSearch && matchesRole
  })

  const maxHourlyCount = Math.max(1, ...(stats?.hourlyActivity || [1]))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-20 pt-4 px-4 sm:px-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-950/90 dark:bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur-xl border border-white/10"
          >
            <Sparkles className="h-4 w-4 text-blue-400 dark:text-white" />
            <span>{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Live Pulse Bar */}
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
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">Live Telemetry</span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
              {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Telegram Command Center Button */}
          <button
            onClick={() => setTelegramModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-all active:scale-95 cursor-pointer border border-sky-500/20"
            title="Open Telegram Bot Operations & Alert Rules"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Telegram Hub</span>
          </button>

          <button
            onClick={() => {
              fetchStats(true, selectedRange)
              fetchUsers(true)
            }}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-bold text-white dark:text-slate-950 shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Feature 6: Date Range Filter (Time Machine) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="font-bold text-slate-900 dark:text-white">Time Machine:</span>
          <span>Viewing telemetry data from</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {stats ? new Date(stats.range.startTime).toLocaleDateString() : 'Loading...'}
          </span>
          <span>to</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {stats ? new Date(stats.range.endTime).toLocaleDateString() : 'Now'}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 p-1">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: 'all', label: 'All Time' }
          ].map((r) => {
            const isCurrent = selectedRange === r.id
            return (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id as DateRangeOption)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI Cards Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
      )}

      {/* Navigation Tab Switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 p-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 no-scrollbar">
        {[
          { id: 'overview', label: 'Telemetry & Analytics', icon: Activity },
          { id: 'feed', label: 'Live Activity Feed', icon: Radio },
          { id: 'users', label: `User Directory (${users.length})`, icon: Users },
          { id: 'keys', label: `API Key Fleet & Models (${stats?.keyFleet?.length || 1})`, icon: Cpu },
          { id: 'tokens', label: 'Tokens & Quotas', icon: BarChart3 },
          { id: 'errors', label: `Error Intel & Clusters (${stats?.errors.recent.length || 0})`, icon: AlertTriangle }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-800/40'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: OVERVIEW & TELEMETRY */}
      {activeTab === 'overview' && stats && (
        <div className="flex flex-col gap-8">
          {/* Feature 4: Batch Processing Queue Health Card */}
          {stats.batchQueue && (
            <div className="rounded-3xl border border-blue-200/60 dark:border-blue-900/40 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 p-6 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Batch Processing Queue Health & Turnaround
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Telemetry metrics for multi-file bulk uploads and parallel speech recognition pipelines.
                  </p>
                </div>
                <span className="rounded-xl bg-blue-100 dark:bg-blue-950/80 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
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
                  <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
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
                    {stats.batchQueue.successful} <span className="text-xs text-slate-400 font-normal">ok</span> / <span className="text-red-500">{stats.batchQueue.failed}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Activity Chart */}
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span>Transcription Volume by Day</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily audio minutes and request volume across all users in active window.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500"></div>
                  <span>Audio (mins)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-indigo-400 opacity-60"></div>
                  <span>Requests</span>
                </div>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div className="mt-4 flex h-48 items-end gap-1.5 sm:gap-2 pt-6 border-b border-slate-100 dark:border-slate-800">
              {stats.dailyStats.map((day) => {
                const maxDur = Math.max(1, ...stats.dailyStats.map((d) => d.duration))
                const heightPercent = Math.min(100, Math.max(4, Math.round((day.duration / maxDur) * 100)))
                const isToday = day.date === new Date().toISOString().split('T')[0]

                return (
                  <div
                    key={day.date}
                    className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                  >
                    <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center rounded-lg bg-slate-950 text-white px-2.5 py-1 text-[10px] shadow-xl whitespace-nowrap pointer-events-none">
                      <span className="font-bold">{day.date}</span>
                      <span>{day.duration.toFixed(1)} mins | {day.requests} reqs</span>
                    </div>

                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-md transition-all group-hover:brightness-125 ${
                        isToday
                          ? 'bg-gradient-to-t from-blue-600 to-indigo-500 shadow-sm shadow-blue-500/40'
                          : day.duration > 0
                            ? 'bg-blue-500/70 dark:bg-blue-500/50'
                            : 'bg-slate-200 dark:bg-slate-800 h-[3px]!'
                      }`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>{stats.dailyStats[0]?.date || 'Past'}</span>
              <span>{stats.dailyStats[Math.floor(stats.dailyStats.length / 2)]?.date || 'Mid'}</span>
              <span className="text-blue-500 font-bold">{stats.dailyStats[stats.dailyStats.length - 1]?.date || 'Today'}</span>
            </div>
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
                        <span className="text-slate-500 dark:text-slate-400 font-mono">{l.count} ({l.percentage}%)</span>
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
                      <span className="text-slate-500 dark:text-slate-400 font-mono">{im.count} ({im.percentage}%)</span>
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
                    <span key={f.format} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
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
                <span className="text-xs text-slate-400 font-medium">Local Time</span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Usage distribution across the hours of the day (00:00 to 23:00).
              </p>

              <div className="flex items-end gap-1 h-28 pt-4 border-b border-slate-100 dark:border-slate-800">
                {stats.hourlyActivity?.map((count, hr) => {
                  const hPercent = Math.min(100, Math.max(6, Math.round((count / maxHourlyCount) * 100)))
                  return (
                    <div
                      key={hr}
                      className="group relative flex flex-1 flex-col items-center h-full justify-end"
                    >
                      <div className="absolute -top-7 z-20 hidden group-hover:flex rounded bg-slate-950 text-white px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap">
                        {hr}:00 — {count}
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
      )}

      {/* TAB 2: LIVE ACTIVITY FEED (Feature 8: Transcript Content Inspector) */}
      {activeTab === 'feed' && stats && (
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
                {stats.recentTranscripts && stats.recentTranscripts.length > 0 ? (
                  stats.recentTranscripts.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setInspectingTranscript(t)}
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
      )}

      {/* TAB 3: USER DIRECTORY (Feature 5: User Intelligence Dossier & CSV Export) */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span>User Directory & Intelligence Dossiers</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any user to inspect their quota consumption, upload history, and personal failure logs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* CSV Export Button */}
              <button
                onClick={handleExportUsersCsv}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Download user directory and telemetry metrics to CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Role filter */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as typeof userRoleFilter)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">All Roles ({users.length})</option>
                <option value="admin">Admins ({users.filter((u) => u.role === 'admin').length})</option>
                <option value="user">Standard Users ({users.filter((u) => u.role === 'user').length})</option>
              </select>
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 px-4">Role</th>
                  <th className="pb-3 px-4">Last Active</th>
                  <th className="pb-3 px-4 text-center">Transcripts</th>
                  <th className="pb-3 px-4 text-center">Audio (mins)</th>
                  <th className="pb-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {usersLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                    </td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const isSelf = u.email === session?.user?.email
                    const isAdmin = u.role === 'admin'

                    return (
                      <tr
                        key={u.id}
                        onClick={() => handleInspectUser(u.id)}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {u.name}
                              {isSelf && (
                                <span className="rounded-md bg-blue-100 dark:bg-blue-950 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{u.email}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                              isAdmin
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {new Date(u.lastActive).toLocaleDateString()} {new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono text-slate-900 dark:text-white">
                          {u.transcriptionCount}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600 dark:text-slate-300">
                          {u.totalAudioMinutes}m
                        </td>
                        <td className="py-3 pl-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleInspectUser(u.id)}
                              className="rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                            >
                              Dossier
                            </button>

                            {isAdmin ? (
                              <button
                                onClick={() => handleRoleChange(u.id, 'user')}
                                disabled={actionUserId === u.id || isSelf}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                                title="Demote to standard user"
                              >
                                <UserX className="h-3 w-3 text-amber-500" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRoleChange(u.id, 'admin')}
                                disabled={actionUserId === u.id}
                                className="flex items-center gap-1 rounded-lg bg-blue-600 dark:bg-blue-500 px-2 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40 transition-all cursor-pointer"
                                title="Promote to administrator"
                              >
                                <UserCheck className="h-3 w-3" />
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                disabled={actionUserId === u.id}
                                className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete user account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      No users found matching query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: API KEY FLEET & MODELS (Feature 3: Live Key Ping & Diagnostics) */}
      {activeTab === 'keys' && stats && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="h-4 w-4 text-amber-500" />
                  <span>Configured Gemini API Keys & Rotation Fleet</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rotated across incoming transcription jobs to balance rate limits. Click "Ping All Keys" to check live latency and 429 status.
                </p>
              </div>

              {/* Ping All Keys Diagnostic Button */}
              <button
                onClick={handlePingAllKeys}
                disabled={isPingingKeys}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isPingingKeys ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                <span>Ping All Keys ({stats.keyFleet?.length || 1})</span>
              </button>
            </div>

            {/* Key Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {stats.keyFleet?.map((k) => {
                const diagnostic = pingResults[k.index]
                const hasPing = !!diagnostic

                return (
                  <div
                    key={k.index}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                        Key #{k.index + 1}
                      </span>

                      {/* Live Diagnostic Status Pill */}
                      {hasPing ? (
                        <span
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            diagnostic.status === 'healthy'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : diagnostic.status === 'warning'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              diagnostic.status === 'healthy'
                                ? 'bg-emerald-500'
                                : diagnostic.status === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500 animate-pulse'
                            }`}
                          />
                          {diagnostic.status === 'healthy'
                            ? `${diagnostic.latencyMs}ms`
                            : diagnostic.status === 'rate_limited'
                              ? '429 Rate Limit'
                              : diagnostic.status === 'invalid'
                                ? 'Invalid Key'
                                : 'Error'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                          Standby Ready
                        </span>
                      )}
                    </div>

                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {k.masked}
                    </p>

                    {/* Per-Key Load Balancing Meter */}
                    <div className="flex flex-col gap-1 border-t border-slate-200/60 dark:border-slate-800/80 pt-2.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">Today's Traffic Share:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                          ~{k.loadSharePercent || 33}% ({k.routedRequestsToday || 0} reqs)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${k.loadSharePercent || 33}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                        />
                      </div>
                    </div>

                    {hasPing && (
                      <p className="text-[10px] text-slate-500 font-mono">
                        Probe: {diagnostic.message}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Model Usage Table */}
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-violet-500" />
                <span>Model Volume & Usage Metrics</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Requests handled, tokens consumed, and audio duration by each AI model in active window.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3 pr-4">Model Identifier</th>
                    <th className="pb-3 px-4">Requests</th>
                    <th className="pb-3 px-4">Audio Duration</th>
                    <th className="pb-3 pl-4 text-right">Tokens Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stats.models?.map((m) => (
                    <tr key={m.model} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4 font-bold font-mono text-slate-900 dark:text-white">
                        {m.model}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                        {m.requests}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                        {m.durationMinutes} mins
                      </td>
                      <td className="py-3 pl-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {m.tokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TOKENS & ESTIMATED COSTS */}
      {activeTab === 'tokens' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-500" />
                <span>Token Ledger (In Active Window)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detailed breakdown of prompt audio input tokens and generated text output tokens.
              </p>
            </div>

            <div className="flex flex-col gap-3 mt-2">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/80">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Input Audio Tokens</span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                  {stats.tokens.inputTokensInRange.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/80">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Output Text Tokens</span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                  {stats.tokens.outputTokensInRange.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">Total Tokens</span>
                <span className="text-base font-extrabold font-mono text-blue-700 dark:text-blue-300">
                  {stats.tokens.tokensInRange.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span>Estimated Gemini API Cost Projection</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standard tier rates: $0.075 / 1M audio input tokens, $0.30 / 1M text output tokens.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-center mt-2">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Estimated Cost in Selected Window</span>
              <p className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 my-2 font-mono">
                ${stats.tokens.estimatedCostRangeUSD}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Today's Cost: ${stats.tokens.estimatedCostTodayUSD} USD (Free tier quota provides 1,500 daily requests per key).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: ERROR INTEL & CLUSTERING (Feature 4: Error Clustering) */}
      {activeTab === 'errors' && stats && (
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
              {stats.errorClusters?.map((cluster) => {
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
                          "{cluster.sampleErrors[0].message}"
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

              <button
                onClick={handleClearErrors}
                disabled={clearingErrors || stats.errors.recent.length === 0}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear All Logs</span>
              </button>
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
                  {stats.errors.recent.length > 0 ? (
                    stats.errors.recent.map((err) => (
                      <tr key={err.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pr-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(err.createdAt).toLocaleDateString()} {new Date(err.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                            onClick={() => setSelectedError(err)}
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
      )}

      {/* Feature 5: Slide-Over User Intelligence Dossier Drawer */}
      <AnimatePresence>
        {selectedUserId && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-lg">
                    {userDossier?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {userDossier?.name || 'User Dossier'}
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {userDossier?.email}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedUserId(null)
                    setUserDossier(null)
                  }}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {dossierLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-xs text-slate-400">Loading User Dossier & Metrics...</p>
                </div>
              ) : userDossier ? (
                <div className="flex flex-col gap-6 text-xs">
                  {/* Quota Progress Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200/70 dark:border-blue-900/50 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Today's Audio Quota
                      </span>
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                        {userDossier.quota.isAdmin
                          ? 'Unlimited (Admin)'
                          : `${userDossier.quota.usedMinutes} / ${userDossier.quota.limitMinutes} mins`}
                      </span>
                    </div>

                    {!userDossier.quota.isAdmin && (
                      <div className="flex flex-col gap-1">
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, Math.round((userDossier.quota.usedMinutes / userDossier.quota.limitMinutes) * 100))}%` }}
                            className={`h-full rounded-full ${
                              userDossier.quota.usedMinutes >= userDossier.quota.limitMinutes
                                ? 'bg-red-500'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {userDossier.quota.remainingMinutes} minutes remaining today. Resets at midnight UTC+7.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* High-level stats */}
                  <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block font-sans">Transcripts</span>
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {userDossier.stats.totalTranscripts}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block font-sans">Total Audio</span>
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {userDossier.stats.totalAudioMinutes}m
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block font-sans">Success Rate</span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {userDossier.stats.successRate}%
                      </span>
                    </div>
                  </div>

                  {/* Account Timeline Info */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex flex-col gap-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Member Since:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {new Date(userDossier.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last Active:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {new Date(userDossier.lastActive).toLocaleDateString()} {new Date(userDossier.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Tokens:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {userDossier.stats.totalTokens.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Recent Transcripts */}
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      Recent Transcriptions ({userDossier.recentTranscripts.length})
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                      {userDossier.recentTranscripts.length > 0 ? (
                        userDossier.recentTranscripts.map((t) => (
                          <div
                            key={t.id}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-800 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileAudio className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="truncate font-medium text-slate-900 dark:text-white">{t.filename}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                              {Math.round(t.duration)}s • {t.language}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic py-2">No transcriptions created yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Recent Errors */}
                  {userDossier.recentErrors.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="font-bold text-red-600 dark:text-red-400 text-xs">
                        Incident History ({userDossier.recentErrors.length})
                      </span>
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                        {userDossier.recentErrors.map((e) => (
                          <div
                            key={e.id}
                            className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/50 dark:border-red-900/40 flex flex-col gap-1"
                          >
                            <span className="font-bold text-red-700 dark:text-red-400 text-[10px]">
                              {e.errorType} • {new Date(e.createdAt).toLocaleTimeString()}
                            </span>
                            <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] truncate">
                              {e.errorMessage}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feature 8: Read-Only Transcript Content Inspector Modal */}
      <AnimatePresence>
        {inspectingTranscript && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden flex flex-col gap-4 max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                  <FileText className="h-5 w-5" />
                  <span>Transcript Content Inspector</span>
                </div>
                <button
                  onClick={() => setInspectingTranscript(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Quality & Cadence Header */}
              {(() => {
                const durationMins = (inspectingTranscript.duration || 1) / 60
                const wpm = Math.round((inspectingTranscript.wordCount || 0) / Math.max(0.1, durationMins))
                const isNatural = wpm >= 110 && wpm <= 170

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-400 block text-[10px]">LANGUAGE</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{inspectingTranscript.language}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-400 block text-[10px]">WORDS</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{inspectingTranscript.wordCount.toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-400 block text-[10px]">DURATION</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{Math.floor(inspectingTranscript.duration / 60)}m {Math.round(inspectingTranscript.duration % 60)}s</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-400 block text-[10px]">CADENCE</span>
                      <span className={`font-bold ${isNatural ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                        {wpm} WPM {isNatural ? '🟢' : '🟡'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Transcript Text Box */}
              <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-sm">
                    {inspectingTranscript.filename}
                  </span>
                  <button
                    onClick={() => handleCopyTranscript(inspectingTranscript.textExcerpt || '')}
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                  >
                    {copiedTranscript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedTranscript ? 'Copied' : 'Copy Text'}</span>
                  </button>
                </div>

                <div className="overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200/80 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans max-h-72">
                  {inspectingTranscript.textExcerpt || 'No transcript text stored for this record.'}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
                <span>Created by: <span className="font-mono text-slate-600 dark:text-slate-300">{inspectingTranscript.userEmail}</span></span>
                <button
                  onClick={() => setInspectingTranscript(null)}
                  className="rounded-xl bg-slate-900 dark:bg-white px-4 py-1.5 text-xs font-bold text-white dark:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feature 7: Telegram Operations Hub Modal */}
      <AnimatePresence>
        {telegramModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden flex flex-col gap-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-sky-500 font-bold text-sm">
                  <Send className="h-5 w-5" />
                  <span>Telegram Intelligence Operations</span>
                </div>
                <button
                  onClick={() => setTelegramModalOpen(false)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                {/* Active Bot Connection */}
                <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200/60 dark:border-sky-900/50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sky-900 dark:text-sky-200 block">Bot Connection: Active</span>
                    <span className="text-[11px] text-sky-700 dark:text-sky-400 font-mono">
                      Chat ID: {stats?.telegram.chatId || 'Not Configured'}
                    </span>
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>

                {/* Automated Rules Summary */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex flex-col gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider">
                    Automated Alert Rules:
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">🚨 Error Spike Rule:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Trigger on &ge;3 errors / 10m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">📢 Direct User Reports:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Real-time Push</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">📊 Evening Recap:</span>
                    <span className="font-semibold text-sky-600 dark:text-sky-400">Scheduled (Phnom Penh)</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    onClick={handleDispatchEveningDigest}
                    disabled={dispatchingDigest}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/20 hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {dispatchingDigest ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    <span>Dispatch Evening Digest Now</span>
                  </button>

                  <button
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {testingTelegram ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span>Send Quick Ping Test Alert</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Raw Error Detail Modal */}
      <AnimatePresence>
        {selectedError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                  <ShieldAlert className="h-5 w-5" />
                  <span>Incident Telemetry Inspector</span>
                </div>
                <button
                  onClick={() => setSelectedError(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col gap-4 mt-4 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-400 uppercase text-[10px]">Error Message</span>
                  <p className="rounded-xl bg-red-50 dark:bg-red-950/40 p-3 font-mono font-medium text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-900/50">
                    {selectedError.errorMessage}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">ENDPOINT</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedError.endpoint}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">FORMAT</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedError.fileFormat}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">USER</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{selectedError.userEmail}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">TIME</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedError.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {selectedError.metadata && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-400 uppercase text-[10px]">Payload Metadata & Diagnostics</span>
                    <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 border border-slate-800">
                      {JSON.stringify(selectedError.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedError(null)}
                  className="rounded-xl bg-slate-900 dark:bg-white px-4 py-2 text-xs font-bold text-white dark:text-slate-900 transition-colors cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
