import { useState, useCallback, useMemo } from 'react'
import type { ManagedUser, UserDossier, DateRangeOption } from '../types'

interface UseUsersParams {
  session: { user?: { id?: string; email?: string | null } } | null
  showNotification: (msg: string) => void
  fetchStats: (silent?: boolean, range?: DateRangeOption) => Promise<void>
  selectedRange: DateRangeOption
}

export function useUsers({ session, showNotification, fetchStats, selectedRange }: UseUsersParams) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userDossier, setUserDossier] = useState<UserDossier | null>(null)
  const [dossierLoading, setDossierLoading] = useState(false)

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

  // Reset User Daily Quota
  const handleResetQuota = async (userId: string) => {
    setActionUserId(userId)
    try {
      const res = await fetch('/api/admin/users/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'reset' })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset quota.')
      }
      showNotification('✅ Daily quota reset to 0 minutes.')
      if (selectedUserId === userId) {
        handleInspectUser(userId)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error resetting quota.')
    } finally {
      setActionUserId(null)
    }
  }

  // Grant Bonus Minutes
  const handleBoostQuota = async (userId: string, minutes: number = 60) => {
    setActionUserId(userId)
    try {
      const res = await fetch('/api/admin/users/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'boost', bonusMinutes: minutes })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to grant bonus minutes.')
      }
      showNotification(`✅ Granted +${minutes} bonus minutes.`)
      if (selectedUserId === userId) {
        handleInspectUser(userId)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error granting bonus minutes.')
    } finally {
      setActionUserId(null)
    }
  }

  // Close user dossier
  const closeUserDossier = () => {
    setSelectedUserId(null)
    setUserDossier(null)
  }

  // Computed filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearch.toLowerCase())
      const matchesRole = userRoleFilter === 'all' ? true : u.role === userRoleFilter
      return matchesSearch && matchesRole
    })
  }, [users, userSearch, userRoleFilter])

  return {
    users,
    usersLoading,
    actionUserId,
    userSearch,
    setUserSearch,
    userRoleFilter,
    setUserRoleFilter,
    selectedUserId,
    userDossier,
    dossierLoading,
    filteredUsers,
    fetchUsers,
    handleInspectUser,
    handleRoleChange,
    handleDeleteUser,
    handleExportUsersCsv,
    handleResetQuota,
    handleBoostQuota,
    closeUserDossier
  }
}
