'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Custom hooks
import { useAdminStats } from './hooks/useAdminStats'
import { useUsers } from './hooks/useUsers'
import { useTelegramOps } from './hooks/useTelegramOps'
import { useFleetDiagnostics } from './hooks/useFleetDiagnostics'

// Core layout components
import { AdminHeader } from './components/AdminHeader'
import { KPICards } from './components/KPICards'
import { TabNavigation } from './components/TabNavigation'
import { TimeMachineFilter } from './components/TimeMachineFilter'
import { AdminSkeleton } from './components/AdminSkeleton'
import { AdminErrorBoundary } from './components/AdminErrorBoundary'

// Modular tab panels
import { OverviewTab } from './components/tabs/OverviewTab'
import { LiveFeedTab } from './components/tabs/LiveFeedTab'
import { UserManagementTab } from './components/tabs/UserManagementTab'
import { FleetHealthTab } from './components/tabs/FleetHealthTab'
import { CacheManagementTab } from './components/tabs/CacheManagementTab'
import { AuditLogsTab } from './components/tabs/AuditLogsTab'
import { TokenIntelligenceTab } from './components/tabs/TokenIntelligenceTab'
import { ErrorClusteringTab } from './components/tabs/ErrorClusteringTab'

// Slide-overs and modals
import { UserDossierDrawer } from './components/modals/UserDossierDrawer'
import { TranscriptInspectorModal } from './components/modals/TranscriptInspectorModal'
import { TelegramControlModal } from './components/modals/TelegramControlModal'
import { ErrorDetailModal } from './components/modals/ErrorDetailModal'

// Types
import type { AdminStats } from './types'
import type { TabId } from './components/TabNavigation'

function AdminDashboardContent() {
  const router = useRouter()
  const { data: session, status } = useSession()

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [notification, setNotification] = useState<string | null>(null)
  const [selectedError, setSelectedError] = useState<AdminStats['errors']['recent'][0] | null>(null)
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null)
  const [inspectingTranscript, setInspectingTranscript] = useState<AdminStats['recentTranscripts'][0] | null>(null)
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [clearingErrors, setClearingErrors] = useState(false)

  // Notification helper
  const showNotification = useCallback((msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3800)
  }, [])

  // Domain hooks
  const statsHook = useAdminStats()
  const usersHook = useUsers({
    session,
    showNotification,
    fetchStats: statsHook.fetchStats,
    selectedRange: statsHook.selectedRange
  })
  const telegramHook = useTelegramOps({ showNotification })
  const fleetHook = useFleetDiagnostics({
    showNotification,
    fetchStats: statsHook.fetchStats,
    selectedRange: statsHook.selectedRange
  })

  // Live second-by-second clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Copy transcript text to clipboard
  const handleCopyTranscript = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedTranscript(true)
    setTimeout(() => setCopiedTranscript(false), 2200)
    showNotification('Transcript copied to clipboard!')
  }

  // Clear all error logs
  const handleClearErrors = async () => {
    if (!confirm('Are you sure you want to clear all error log entries? This action cannot be undone.')) return
    setClearingErrors(true)
    try {
      const res = await fetch('/api/admin/stats', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to clear error logs.')
      showNotification('All error logs have been cleared.')
      statsHook.fetchStats(true, statsHook.selectedRange)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear error logs.')
    } finally {
      setClearingErrors(false)
    }
  }

  // Manual sync handler
  const handleSync = useCallback(() => {
    statsHook.fetchStats(true, statsHook.selectedRange)
    usersHook.fetchUsers(true)
  }, [statsHook, usersHook])

  // Initial data fetch on auth, or stealth-redirect non-admin users
  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role === 'admin') {
        statsHook.fetchStats(false, statsHook.selectedRange)
        usersHook.fetchUsers(false)
      } else {
        // Silently redirect non-admin users to workspace without showing error panels
        router.replace('/transcribe')
      }
    } else if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, session, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global Keyboard Shortcuts (R to sync, 1-6 for tabs, Esc to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        if (inspectingTranscript) setInspectingTranscript(null)
        if (selectedError) setSelectedError(null)
        if (usersHook.selectedUserId) usersHook.closeUserDossier()
        if (telegramHook.telegramModalOpen) telegramHook.closeTelegramModal()
        return
      }

      if (isInput) return

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        handleSync()
        showNotification('Refreshing telemetry data...')
        return
      }

      const tabMap: Record<string, TabId> = {
        '1': 'overview',
        '2': 'feed',
        '3': 'users',
        '4': 'keys',
        '5': 'cache',
        '6': 'audit',
        '7': 'tokens',
        '8': 'errors'
      }

      if (tabMap[e.key]) {
        e.preventDefault()
        setActiveTab(tabMap[e.key])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    inspectingTranscript,
    selectedError,
    usersHook,
    telegramHook,
    handleSync,
    showNotification
  ])

  const stats = statsHook.stats
  const loading = statsHook.loading

  // Auth & Initial loading state with Apple-grade skeleton
  if (status === 'loading' || (loading && !stats)) {
    return <AdminSkeleton />
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
    return <AdminSkeleton />
  }

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

      {/* Header with smart refresh interval and relative sync status */}
      <AdminHeader
        currentTime={currentTime}
        isSyncing={statsHook.isSyncing}
        lastSyncTime={statsHook.lastSyncTime}
        refreshInterval={statsHook.refreshInterval}
        onRefreshIntervalChange={statsHook.setRefreshInterval}
        onSync={handleSync}
        onOpenTelegram={telegramHook.openTelegramModal}
      />

      {/* Time Machine Filter */}
      <TimeMachineFilter
        selectedRange={statsHook.selectedRange}
        onRangeChange={statsHook.handleRangeChange}
        startTime={stats?.range.startTime || ''}
        endTime={stats?.range.endTime || ''}
      />

      {/* KPI Cards */}
      {stats && <KPICards stats={stats} />}

      {/* Navigation Tab Switcher */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        usersCount={usersHook.users.length}
        keyFleetCount={stats?.keyFleet?.length || 1}
        recentErrorsCount={stats?.errors.recent.length || 0}
      />

      {/* TAB 1: OVERVIEW & TELEMETRY */}
      {activeTab === 'overview' && stats && (
        <OverviewTab
          stats={stats}
          currentTime={currentTime}
          selectedRange={statsHook.selectedRange}
        />
      )}

      {/* TAB 2: LIVE ACTIVITY FEED */}
      {activeTab === 'feed' && stats && (
        <LiveFeedTab
          recentTranscripts={stats.recentTranscripts}
          onInspectTranscript={setInspectingTranscript}
        />
      )}

      {/* TAB 3: USER DIRECTORY & DOSSIERS */}
      {activeTab === 'users' && (
        <UserManagementTab
          users={usersHook.users}
          filteredUsers={usersHook.filteredUsers}
          usersLoading={usersHook.usersLoading}
          actionUserId={usersHook.actionUserId}
          userSearch={usersHook.userSearch}
          setUserSearch={usersHook.setUserSearch}
          userRoleFilter={usersHook.userRoleFilter}
          setUserRoleFilter={usersHook.setUserRoleFilter}
          onInspectUser={usersHook.handleInspectUser}
          onRoleChange={usersHook.handleRoleChange}
          onDeleteUser={usersHook.handleDeleteUser}
          onResetQuota={usersHook.handleResetQuota}
          onBoostQuota={usersHook.handleBoostQuota}
          onExportCsv={usersHook.handleExportUsersCsv}
          currentAdminEmail={session?.user?.email}
        />
      )}

      {/* TAB 4: API KEY FLEET & MODELS */}
      {activeTab === 'keys' && stats && (
        <FleetHealthTab
          keyFleet={stats.keyFleet}
          fleetHealth={stats.fleetHealth}
          models={stats.models}
          pingResults={fleetHook.pingResults}
          isPingingKeys={fleetHook.isPingingKeys}
          probingFleet={fleetHook.probingFleet}
          onPingAllKeys={fleetHook.handlePingAllKeys}
          onProbeFleet={fleetHook.handleProbeFleet}
          onOpenTelegram={telegramHook.openTelegramModal}
        />
      )}

      {/* TAB 5: TRANSCRIPT CACHE INTELLIGENCE & PURGE */}
      {activeTab === 'cache' && <CacheManagementTab />}

      {/* TAB 6: SECURITY AUDIT LOGS */}
      {activeTab === 'audit' && <AuditLogsTab />}

      {/* TAB 7: TOKENS & ESTIMATED COSTS */}
      {activeTab === 'tokens' && stats && (
        <TokenIntelligenceTab tokens={stats.tokens} />
      )}

      {/* TAB 8: ERROR INTEL & CLUSTERING */}
      {activeTab === 'errors' && stats && (
        <ErrorClusteringTab
          errors={stats.errors}
          errorClusters={stats.errorClusters}
          activeClusterId={activeClusterId}
          setActiveClusterId={setActiveClusterId}
          onInspectError={setSelectedError}
          onClearErrors={handleClearErrors}
          clearingErrors={clearingErrors}
        />
      )}

      {/* User Intelligence Dossier Drawer */}
      <UserDossierDrawer
        isOpen={Boolean(usersHook.selectedUserId)}
        userDossier={usersHook.userDossier}
        dossierLoading={usersHook.dossierLoading}
        onClose={usersHook.closeUserDossier}
        onResetQuota={usersHook.handleResetQuota}
        onBoostQuota={usersHook.handleBoostQuota}
      />

      {/* Transcript Content Inspector Modal */}
      <TranscriptInspectorModal
        inspectingTranscript={inspectingTranscript}
        copiedTranscript={copiedTranscript}
        onCopyTranscript={handleCopyTranscript}
        onClose={() => setInspectingTranscript(null)}
      />

      {/* Telegram Control Center Modal */}
      <TelegramControlModal
        isOpen={telegramHook.telegramModalOpen}
        onClose={telegramHook.closeTelegramModal}
        telegramSetup={telegramHook.telegramSetup}
        loadingTelegramSetup={telegramHook.loadingTelegramSetup}
        registeringWebhook={telegramHook.registeringWebhook}
        disconnectingWebhook={telegramHook.disconnectingWebhook}
        dispatchingDigest={telegramHook.dispatchingDigest}
        testingTelegram={telegramHook.testingTelegram}
        onRegisterWebhook={telegramHook.handleRegisterWebhook}
        onDeleteWebhook={telegramHook.handleDeleteWebhook}
        onDispatchEveningDigest={telegramHook.handleDispatchEveningDigest}
        onTestTelegram={telegramHook.handleTestTelegram}
        chatId={stats?.telegram.chatId}
      />

      {/* Error Detail Inspector Modal */}
      <ErrorDetailModal
        selectedError={selectedError}
        onClose={() => setSelectedError(null)}
      />
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <AdminErrorBoundary>
      <AdminDashboardContent />
    </AdminErrorBoundary>
  )
}
