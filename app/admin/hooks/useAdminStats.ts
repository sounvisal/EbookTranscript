'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AdminStats, DateRangeOption, RefreshIntervalOption } from '../types'

export function useAdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>('30d')
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date())

  // Configurable Refresh Interval ('off' | '15s' | '30s' | '60s')
  const [refreshInterval, setRefreshInterval] = useState<RefreshIntervalOption>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('signal_admin_refresh_interval') as RefreshIntervalOption | null
      if (saved && ['off', '15s', '30s', '60s'].includes(saved)) return saved
    }
    return '30s'
  })

  const handleSetRefreshInterval = useCallback((interval: RefreshIntervalOption) => {
    setRefreshInterval(interval)
    if (typeof window !== 'undefined') {
      localStorage.setItem('signal_admin_refresh_interval', interval)
    }
  }, [])

  // Fetch stats with dynamic date range
  const fetchStats = useCallback(
    async (silent = false, range: DateRangeOption = selectedRange) => {
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
    },
    [selectedRange]
  )

  // Handle date range change
  const handleRangeChange = (range: DateRangeOption) => {
    setSelectedRange(range)
    fetchStats(false, range)
  }

  // Auto-polling with user-configurable interval and visibility API
  useEffect(() => {
    if (refreshInterval === 'off') return

    const ms = refreshInterval === '15s' ? 15000 : refreshInterval === '30s' ? 30000 : 60000
    let pollTimer: NodeJS.Timeout | null = null

    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = setInterval(() => {
        if (!document.hidden) {
          fetchStats(true, selectedRange)
        }
      }, ms)
    }

    startPolling()

    const handleVisibilityChange = () => {
      if (document.hidden && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      } else if (!document.hidden) {
        fetchStats(true, selectedRange)
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchStats, selectedRange, refreshInterval])

  return {
    stats,
    loading,
    errorMsg,
    selectedRange,
    isSyncing,
    lastSyncTime,
    refreshInterval,
    setRefreshInterval: handleSetRefreshInterval,
    fetchStats,
    handleRangeChange
  }
}
