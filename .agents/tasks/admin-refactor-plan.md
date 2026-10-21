# Admin Dashboard Refactoring Implementation Plan

## Overview
Refactor the monolithic `app/admin/page.tsx` (876+ lines, 30,000+ chars) into a clean modular architecture with separation of concerns: UI components, data hooks, and utility functions.

**Target**: Reduce `page.tsx` to under 200 lines while improving maintainability, testability, and code reuse.

---

## Phase 1: Create Shared Types File

- [ ] **1. Create `app/admin/types.ts` for all shared TypeScript types**
   
   Extract and consolidate all type definitions from the monolithic file into a central types module.
   
   **Types to move:**
   - `DateRangeOption = 'today' | 'yesterday' | '7d' | '30d' | 'all'`
   - `KeyDiagnostic` interface (11 fields)
   - `TelegramSetupState` interface (4 fields)
   - `ErrorCluster` interface (6 fields)
   - `AdminStats` interface (14 nested properties)
   - `ManagedUser` interface (8 fields)
   - `UserDossier` interface (8 nested properties)
   
   **Files:** `app/admin/types.ts` (new)
   
   **Verify:** Run `npm run build` and confirm no TypeScript errors. Check that types are exported and can be imported from `./types`.

---

## Phase 2: Extract Custom Hooks (Data Layer)

### Hook 1: useAdminStats

- [ ] **2. Create `app/admin/hooks/useAdminStats.ts` - Main statistics fetching and time range management**
   
   **State variables to include:**
   - `stats: AdminStats | null`
   - `loading: boolean`
   - `errorMsg: string | null`
   - `selectedRange: DateRangeOption`
   - `isSyncing: boolean`
   - `lastSyncTime: Date`
   
   **Functions to include:**
   - `fetchStats(silent?: boolean, range?: DateRangeOption): Promise<void>`
   - `handleRangeChange(range: DateRangeOption): void`
   - Auto-polling logic with visibility API (12s interval)
   - Cleanup for polling timer
   
   **Return signature:**
   ```typescript
   {
     stats: AdminStats | null
     loading: boolean
     errorMsg: string | null
     selectedRange: DateRangeOption
     isSyncing: boolean
     lastSyncTime: Date
     fetchStats: (silent?: boolean, range?: DateRangeOption) => Promise<void>
     handleRangeChange: (range: DateRangeOption) => void
   }
   ```
   
   **Dependencies:** `useEffect`, `useCallback`, `useState`, `AdminStats`, `DateRangeOption` types
   
   **Files:** `app/admin/hooks/useAdminStats.ts` (new)
   
   **Verify:** Run `npm run build`. Test the hook by importing it in page.tsx temporarily.

### Hook 2: useUsers

- [ ] **3. Create `app/admin/hooks/useUsers.ts` - User directory management and CRUD operations**
   
   **State variables to include:**
   - `users: ManagedUser[]`
   - `usersLoading: boolean`
   - `actionUserId: string | null` (tracks which user action is in progress)
   - `userSearch: string`
   - `userRoleFilter: 'all' | 'admin' | 'user'`
   - `selectedUserId: string | null` (for dossier modal)
   - `userDossier: UserDossier | null`
   - `dossierLoading: boolean`
   
   **Functions to include:**
   - `fetchUsers(silent?: boolean): Promise<void>`
   - `handleInspectUser(userId: string): Promise<void>`
   - `handleRoleChange(userId: string, newRole: 'admin' | 'user', currentUserEmail?: string): Promise<void>`
   - `handleDeleteUser(userId: string, userEmail: string): Promise<void>`
   - `handleExportUsersCsv(): void`
   - `setUserSearch(search: string): void`
   - `setUserRoleFilter(filter: 'all' | 'admin' | 'user'): void`
   - `closeUserDossier(): void`
   
   **Return signature:**
   ```typescript
   {
     users: ManagedUser[]
     usersLoading: boolean
     actionUserId: string | null
     userSearch: string
     userRoleFilter: 'all' | 'admin' | 'user'
     selectedUserId: string | null
     userDossier: UserDossier | null
     dossierLoading: boolean
     filteredUsers: ManagedUser[]
     fetchUsers: (silent?: boolean) => Promise<void>
     handleInspectUser: (userId: string) => Promise<void>
     handleRoleChange: (userId: string, newRole: 'admin' | 'user', currentUserEmail?: string) => Promise<void>
     handleDeleteUser: (userId: string, userEmail: string) => Promise<void>
     handleExportUsersCsv: () => void
     setUserSearch: (search: string) => void
     setUserRoleFilter: (filter: 'all' | 'admin' | 'user') => void
     closeUserDossier: () => void
   }
   ```
   
   **Computed values:**
   - `filteredUsers` - computed from `users`, `userSearch`, `userRoleFilter`
   
   **Files:** `app/admin/hooks/useUsers.ts` (new)
   
   **Verify:** Run `npm run build`. Import in page.tsx and verify all functions work.

### Hook 3: useTelegramOps

- [ ] **4. Create `app/admin/hooks/useTelegramOps.ts` - Telegram bot operations and webhook management**
   
   **State variables to include:**
   - `telegramModalOpen: boolean`
   - `testingTelegram: boolean`
   - `dispatchingDigest: boolean`
   - `telegramSetup: TelegramSetupState | null`
   - `loadingTelegramSetup: boolean`
   - `registeringWebhook: boolean`
   - `disconnectingWebhook: boolean`
   
   **Functions to include:**
   - `openTelegramModal(): void`
   - `closeTelegramModal(): void`
   - `handleTestTelegram(): Promise<void>`
   - `handleDispatchEveningDigest(): Promise<void>`
   - `fetchTelegramSetup(): Promise<void>`
   - `handleRegisterWebhook(): Promise<void>`
   - `handleDeleteWebhook(): Promise<void>`
   
   **Return signature:**
   ```typescript
   {
     telegramModalOpen: boolean
     testingTelegram: boolean
     dispatchingDigest: boolean
     telegramSetup: TelegramSetupState | null
     loadingTelegramSetup: boolean
     registeringWebhook: boolean
     disconnectingWebhook: boolean
     openTelegramModal: () => void
     closeTelegramModal: () => void
     handleTestTelegram: () => Promise<void>
     handleDispatchEveningDigest: () => Promise<void>
     fetchTelegramSetup: () => Promise<void>
     handleRegisterWebhook: () => Promise<void>
     handleDeleteWebhook: () => Promise<void>
   }
   ```
   
   **Effect:** Auto-fetch telegram setup when modal opens
   
   **Files:** `app/admin/hooks/useTelegramOps.ts` (new)
   
   **Verify:** Run `npm run build`. Test Telegram modal functionality.

### Hook 4: useFleetDiagnostics

- [ ] **5. Create `app/admin/hooks/useFleetDiagnostics.ts` - API key fleet health and diagnostics**
   
   **State variables to include:**
   - `pingResults: Record<number, KeyDiagnostic>`
   - `isPingingKeys: boolean`
   - `probingFleet: boolean`
   
   **Functions to include:**
   - `handlePingAllKeys(): Promise<void>`
   - `handleProbeFleet(): Promise<void>`
   - `clearPingResults(): void`
   
   **Return signature:**
   ```typescript
   {
     pingResults: Record<number, KeyDiagnostic>
     isPingingKeys: boolean
     probingFleet: boolean
     handlePingAllKeys: () => Promise<void>
     handleProbeFleet: (onSuccess: () => void) => Promise<void>
     clearPingResults: () => void
   }
   ```
   
   **Note:** `handleProbeFleet` accepts callback to trigger stats refresh
   
   **Files:** `app/admin/hooks/useFleetDiagnostics.ts` (new)
   
   **Verify:** Run `npm run build`. Test key ping and fleet probe.

---

## Phase 3: Create Utility Functions

- [ ] **6. Create `app/admin/utils/adminHelpers.ts` - Shared utility functions**
   
   **Functions to include:**
   - `formatTimeAgo(date: Date | string): string` - human-readable time differences
   - `exportToCsv(data: unknown[][], filename: string): void` - generic CSV export
   - `calculateMaxValue(data: number[]): number` - for chart scaling
   - `copyToClipboard(text: string): Promise<void>` - wrapper for clipboard API
   
   **Files:** `app/admin/utils/adminHelpers.ts` (new)
   
   **Verify:** Run `npm run build`. Unit test each function with sample data.

---

## Phase 4: Extract UI Components

### Header and Navigation

- [ ] **7. Create `app/admin/components/AdminHeader.tsx` - Header with live pulse, sync button, and time display**
   
   **Props interface:**
   ```typescript
   {
     currentTime: Date
     isSyncing: boolean
     onSync: () => void
     onOpenTelegram: () => void
   }
   ```
   
   **JSX sections to move:**
   - Header container with ShieldCheck icon
   - Title and subtitle
   - Live telemetry badge with pulsing indicator
   - Current time display
   - Telegram bot button
   - Sync button
   
   **Icons used:** `ShieldCheck`, `Send`, `RefreshCw`, `Sparkles`
   
   **Files:** `app/admin/components/AdminHeader.tsx` (new)
   
   **Verify:** Import in page.tsx, render with props, confirm visual match.

- [ ] **8. Create `app/admin/components/TabNavigation.tsx` - Tab switcher for main sections**
   
   **Props interface:**
   ```typescript
   {
     activeTab: 'overview' | 'feed' | 'users' | 'keys' | 'tokens' | 'errors'
     onTabChange: (tab: typeof activeTab) => void
     userCount: number
     keyFleetCount: number
     errorCount: number
   }
   ```
   
   **Tab definitions:**
   - Overview (Activity icon)
   - Feed (Radio icon)
   - Users (Users icon) - shows count
   - Keys (Cpu icon) - shows fleet count
   - Tokens (BarChart3 icon)
   - Errors (AlertTriangle icon) - shows error count
   
   **Files:** `app/admin/components/TabNavigation.tsx` (new)
   
   **Verify:** Test tab switching, verify counts display correctly.

### KPI and Time Machine

- [ ] **9. Create `app/admin/components/KPICards.tsx` - Grid of 6 KPI metric cards**
   
   **Props interface:**
   ```typescript
   {
     stats: AdminStats
   }
   ```
   
   **Cards to render (6 total):**
   1. Total Users (Users icon, blue) - shows `totalUsers`, `newUsersInRange`
   2. Audio Spoken (Clock icon, indigo) - shows `totalAudioHours`, `totalAudioMinutes`
   3. Transcriptions (FileAudio icon, violet) - shows `totalTranscripts`, `totalWords`
   4. Success Rate (CheckCircle2 icon, emerald) - shows `successRate`, `totalErrors`
   5. API Key Fleet (Key icon, amber) - shows `keyFleet.length`
   6. Tokens in Window (Zap icon, blue) - shows `tokensInRange`, `estimatedCostRangeUSD`
   
   **Grid layout:** `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6`
   
   **Files:** `app/admin/components/KPICards.tsx` (new)
   
   **Verify:** Render with sample stats, verify formatting and icons.

- [ ] **10. Create `app/admin/components/TimeMachineFilter.tsx` - Date range selector component**
   
   **Props interface:**
   ```typescript
   {
     selectedRange: DateRangeOption
     onRangeChange: (range: DateRangeOption) => void
     startTime: string
     endTime: string
   }
   ```
   
   **Range buttons:** today, yesterday, 7d, 30d, all
   
   **Files:** `app/admin/components/TimeMachineFilter.tsx` (new)
   
   **Verify:** Test range selection, verify date display updates.

### Charts and Visualizations

- [ ] **11. Create `app/admin/components/charts/DailyStatsChart.tsx` - Main activity timeline chart**
   
   **Props interface:**
   ```typescript
   {
     dailyStats: AdminStats['dailyStats']
     isHourly: boolean
     currentTime: Date
     selectedRange: DateRangeOption
   }
   ```
   
   **Features:**
   - Bar chart with hover tooltips
   - Highlights current hour (if hourly view) or current day
   - X-axis labels change based on hourly vs daily
   - Responsive gap spacing
   
   **Files:** `app/admin/components/charts/DailyStatsChart.tsx` (new)
   
   **Verify:** Render with sample data, test hover states, verify current period highlight.

- [ ] **12. Create `app/admin/components/charts/HourlyActivityChart.tsx` - 24-hour heatmap**
   
   **Props interface:**
   ```typescript
   {
     hourlyActivity: number[]
   }
   ```
   
   **Features:**
   - 24 bars (0-23 hours)
   - Hover tooltip shows hour and count
   - Responsive height scaling
   
   **Files:** `app/admin/components/charts/HourlyActivityChart.tsx` (new)
   
   **Verify:** Render with 24-element array, test hover tooltips.

- [ ] **13. Create `app/admin/components/charts/DistributionCharts.tsx` - Language, format, and input mode breakdowns**
   
   **Props interface:**
   ```typescript
   {
     languages: AdminStats['languages']
     inputModes: AdminStats['inputModes']
     formats: AdminStats['formats']
   }
   ```
   
   **Contains 3 card sections:**
   1. Language Detection (Globe icon, emerald) - progress bars
   2. Input Modes & Formats (Layers icon, violet) - progress bars + format badges
   3. 24-Hour Peak Activity (Clock icon, amber) - hourly bars (delegates to HourlyActivityChart)
   
   **Grid layout:** `grid-cols-1 md:grid-cols-3`
   
   **Files:** `app/admin/components/charts/DistributionCharts.tsx` (new)
   
   **Verify:** Render all three sections, verify styling consistency.

### Error Clustering

- [ ] **14. Create `app/admin/components/ErrorClusterPanel.tsx` - Error clustering visualization and raw error log**
   
   **Props interface:**
   ```typescript
   {
     errorClusters: AdminStats['errorClusters']
     errors: AdminStats['errors']
     selectedError: AdminStats['errors']['recent'][0] | null
     activeClusterId: string | null
     clearingErrors: boolean
     onClusterClick: (id: string | null) => void
     onErrorClick: (error: AdminStats['errors']['recent'][0]) => void
     onCloseErrorDetail: () => void
     onClearErrors: () => Promise<void>
   }
   ```
   
   **Sections:**
   1. Error clustering grid - clickable cards with severity badges
   2. Raw error log table - scrollable with error details
   3. Error detail modal (if selectedError is set)
   
   **Files:** `app/admin/components/ErrorClusterPanel.tsx` (new)
   
   **Verify:** Test cluster selection, error detail modal, clear errors action.

### Fleet Health and Keys

- [ ] **15. Create `app/admin/components/FleetHealthPanel.tsx` - API key fleet and model health dashboard**
   
   **Props interface:**
   ```typescript
   {
     keyFleet: AdminStats['keyFleet']
     fleetHealth: AdminStats['fleetHealth']
     models: AdminStats['models']
     pingResults: Record<number, KeyDiagnostic>
     isPingingKeys: boolean
     probingFleet: boolean
     onPingAllKeys: () => Promise<void>
     onProbeFleet: () => Promise<void>
     onOpenTelegram: () => void
   }
   ```
   
   **Sections:**
   1. Key fleet grid with diagnostic status pills
   2. Telegram remote sync callout
   3. Fleet health probe section with optimal model banner
   4. Model health grid (4 cards)
   5. Model usage metrics table
   
   **Files:** `app/admin/components/FleetHealthPanel.tsx` (new)
   
   **Verify:** Test key ping, fleet probe, verify status badges update.

### User Management

- [ ] **16. Create `app/admin/components/UserManagementTable.tsx` - User directory table with actions**
   
   **Props interface:**
   ```typescript
   {
     users: ManagedUser[]
     usersLoading: boolean
     actionUserId: string | null
     userSearch: string
     userRoleFilter: 'all' | 'admin' | 'user'
     currentUserEmail?: string
     onUserSearch: (search: string) => void
     onRoleFilterChange: (filter: 'all' | 'admin' | 'user') => void
     onInspectUser: (userId: string) => void
     onRoleChange: (userId: string, newRole: 'admin' | 'user') => void
     onDeleteUser: (userId: string, userEmail: string) => void
     onExportCsv: () => void
   }
   ```
   
   **Features:**
   - Search bar
   - Role filter dropdown
   - CSV export button
   - User table with action buttons (Dossier, Role change, Delete)
   - Loading state with skeleton
   
   **Files:** `app/admin/components/UserManagementTable.tsx` (new)
   
   **Verify:** Test search, filter, all CRUD actions, CSV export.

- [ ] **17. Create `app/admin/components/UserDossierModal.tsx` - Detailed user intelligence modal**
   
   **Props interface:**
   ```typescript
   {
     userId: string | null
     userDossier: UserDossier | null
     dossierLoading: boolean
     actionUserId: string | null
     currentUserEmail?: string
     onClose: () => void
     onRoleChange: (userId: string, newRole: 'admin' | 'user') => void
     onDeleteUser: (userId: string, userEmail: string) => void
   }
   ```
   
   **Sections:**
   - User profile header with quota bars
   - Stats cards (transcripts, audio, tokens, success rate)
   - Recent transcripts table
   - Recent errors table
   - Action buttons at bottom
   
   **Uses:** `AnimatePresence` and `motion.div` for modal animations
   
   **Files:** `app/admin/components/UserDossierModal.tsx` (new)
   
   **Verify:** Test open/close animation, verify data display, test actions.

### Telegram Operations

- [ ] **18. Create `app/admin/components/TelegramModal.tsx` - Telegram bot operations command center**
   
   **Props interface:**
   ```typescript
   {
     isOpen: boolean
     testingTelegram: boolean
     dispatchingDigest: boolean
     telegramSetup: TelegramSetupState | null
     loadingTelegramSetup: boolean
     registeringWebhook: boolean
     disconnectingWebhook: boolean
     onClose: () => void
     onTestTelegram: () => Promise<void>
     onDispatchDigest: () => Promise<void>
     onRegisterWebhook: () => Promise<void>
     onDeleteWebhook: () => Promise<void>
   }
   ```
   
   **Sections:**
   - Bot info display (if configured)
   - Webhook status
   - Test alert button
   - Dispatch digest button
   - Register/disconnect webhook buttons
   
   **Uses:** `AnimatePresence` and `motion.div` for modal
   
   **Files:** `app/admin/components/TelegramModal.tsx` (new)
   
   **Verify:** Test all Telegram operations, verify loading states.

### Transcript Inspector

- [ ] **19. Create `app/admin/components/TranscriptInspector.tsx` - Modal to view full transcript text**
   
   **Props interface:**
   ```typescript
   {
     transcript: AdminStats['recentTranscripts'][0] | null
     copiedTranscript: boolean
     onClose: () => void
     onCopyTranscript: (text: string) => void
   }
   ```
   
   **Features:**
   - Shows filename, language, duration, word count
   - Full transcript text display with scrolling
   - Copy to clipboard button with feedback
   - User email and timestamp
   
   **State:** `copiedTranscript` managed in parent for 2.2s timeout
   
   **Files:** `app/admin/components/TranscriptInspector.tsx` (new)
   
   **Verify:** Test copy functionality, verify text display, test close.

### Batch Queue Health (Conditional)

- [ ] **20. Create `app/admin/components/BatchQueueCard.tsx` - Batch processing metrics card (renders if stats.batchQueue exists)**
   
   **Props interface:**
   ```typescript
   {
     batchQueue: AdminStats['batchQueue']
   }
   ```
   
   **Metrics grid (4 cards):**
   1. Total Batch Jobs
   2. Batch Success Rate
   3. Batch Audio Handled
   4. Completed vs Failed
   
   **Files:** `app/admin/components/BatchQueueCard.tsx` (new)
   
   **Verify:** Render with sample batch data, verify conditional rendering.

### Token and Cost Display

- [ ] **21. Create `app/admin/components/TokenCostPanel.tsx` - Token usage and cost estimation cards**
   
   **Props interface:**
   ```typescript
   {
     tokens: AdminStats['tokens']
   }
   ```
   
   **Two cards side-by-side:**
   1. Token Ledger - input, output, total tokens
   2. Estimated Cost - cost calculation with today's cost
   
   **Files:** `app/admin/components/TokenCostPanel.tsx` (new)
   
   **Verify:** Render with sample token data, verify cost formatting.

### Live Activity Feed

- [ ] **22. Create `app/admin/components/LiveActivityFeed.tsx` - Recent transcriptions table**
   
   **Props interface:**
   ```typescript
   {
     recentTranscripts: AdminStats['recentTranscripts']
     onTranscriptClick: (transcript: AdminStats['recentTranscripts'][0]) => void
   }
   ```
   
   **Table columns:**
   - Media File (with FileAudio icon)
   - Language (badge)
   - Duration (formatted)
   - Word Count
   - User email
   - Time (HH:MM format)
   - Inspect button (triggers onTranscriptClick)
   
   **Files:** `app/admin/components/LiveActivityFeed.tsx` (new)
   
   **Verify:** Render table, test row click, verify empty state.

---

## Phase 5: Add Loading Skeletons and Error Boundaries

- [ ] **23. Create loading skeletons for each major section**
   
   **Create skeleton components:**
   - `app/admin/components/KPICardsSkeleton.tsx` - 6 card skeletons in grid
   - `app/admin/components/TableSkeleton.tsx` - generic table skeleton with configurable rows
   - `app/admin/components/ChartSkeleton.tsx` - chart placeholder with pulsing bars
   
   **Usage locations in page.tsx:**
   - KPI cards: show `<KPICardsSkeleton />` when `loading && !stats`
   - User table: show `<TableSkeleton rows={5} />` when `usersLoading`
   - Charts: show `<ChartSkeleton />` when `loading && !stats`
   
   **Pattern from LoadingSkeleton.tsx:**
   - Use `Skeleton` component with `variant`, `width`, `height` props
   - Use `motion.div` with shimmer animation
   
   **Files:** 
   - `app/admin/components/KPICardsSkeleton.tsx` (new)
   - `app/admin/components/TableSkeleton.tsx` (new)
   - `app/admin/components/ChartSkeleton.tsx` (new)
   
   **Verify:** Test loading states by adding artificial delays to API calls.

- [ ] **24. Wrap admin page with ErrorBoundary**
   
   **Modify:** `app/admin/page.tsx`
   
   **Wrap the entire component return with:**
   ```tsx
   import { ErrorBoundary } from '@/components/common/ErrorBoundary'
   
   // In component
   return (
     <ErrorBoundary
       fallbackTitle="Admin Dashboard Error"
       fallbackMessage="Failed to load admin dashboard. Please refresh or contact support."
     >
       {/* existing JSX */}
     </ErrorBoundary>
   )
   ```
   
   **Also wrap individual high-risk components:**
   - `<FleetHealthPanel />` - API diagnostics can fail
   - `<ErrorClusterPanel />` - error parsing can fail
   - `<UserDossierModal />` - external data fetch
   
   **Files:** `app/admin/page.tsx` (modified)
   
   **Verify:** Trigger an error in a component and verify ErrorBoundary catches it.

---

## Phase 6: Refactor Main Page Component

- [ ] **25. Refactor `app/admin/page.tsx` to orchestrate components and hooks**
   
   **New structure (target: ~180 lines):**
   
   ```tsx
   'use client'
   
   import { useState } from 'react'
   import { useSession } from 'next-auth/react'
   import { ErrorBoundary } from '@/components/common/ErrorBoundary'
   import { Loader2, Lock } from 'lucide-react'
   
   // Import all custom hooks
   import { useAdminStats } from './hooks/useAdminStats'
   import { useUsers } from './hooks/useUsers'
   import { useTelegramOps } from './hooks/useTelegramOps'
   import { useFleetDiagnostics } from './hooks/useFleetDiagnostics'
   
   // Import all UI components
   import { AdminHeader } from './components/AdminHeader'
   import { TabNavigation } from './components/TabNavigation'
   import { TimeMachineFilter } from './components/TimeMachineFilter'
   import { KPICards } from './components/KPICards'
   import { BatchQueueCard } from './components/BatchQueueCard'
   import { DailyStatsChart } from './components/charts/DailyStatsChart'
   import { DistributionCharts } from './components/charts/DistributionCharts'
   import { LiveActivityFeed } from './components/LiveActivityFeed'
   import { UserManagementTable } from './components/UserManagementTable'
   import { FleetHealthPanel } from './components/FleetHealthPanel'
   import { TokenCostPanel } from './components/TokenCostPanel'
   import { ErrorClusterPanel } from './components/ErrorClusterPanel'
   import { TelegramModal } from './components/TelegramModal'
   import { TranscriptInspector } from './components/TranscriptInspector'
   import { UserDossierModal } from './components/UserDossierModal'
   
   // Import skeletons
   import { KPICardsSkeleton } from './components/KPICardsSkeleton'
   import { TableSkeleton } from './components/TableSkeleton'
   import { ChartSkeleton } from './components/ChartSkeleton'
   
   // Import types
   import type { AdminStats } from './types'
   
   export default function AdminDashboardPage() {
     const { data: session, status } = useSession()
     
     // UI state (not in hooks)
     const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'users' | 'keys' | 'tokens' | 'errors'>('overview')
     const [currentTime, setCurrentTime] = useState(new Date())
     const [notification, setNotification] = useState<string | null>(null)
     const [selectedError, setSelectedError] = useState<AdminStats['errors']['recent'][0] | null>(null)
     const [activeClusterId, setActiveClusterId] = useState<string | null>(null)
     const [inspectingTranscript, setInspectingTranscript] = useState<AdminStats['recentTranscripts'][0] | null>(null)
     const [copiedTranscript, setCopiedTranscript] = useState(false)
     const [clearingErrors, setClearingErrors] = useState(false)
     
     // Custom hooks
     const statsHook = useAdminStats()
     const usersHook = useUsers()
     const telegramHook = useTelegramOps()
     const fleetHook = useFleetDiagnostics()
     
     // Notification helper
     const showNotification = (msg: string) => {
       setNotification(msg)
       setTimeout(() => setNotification(null), 3800)
     }
     
     // Clock ticker
     useEffect(() => {
       const timer = setInterval(() => setCurrentTime(new Date()), 1000)
       return () => clearInterval(timer)
     }, [])
     
     // Copy transcript handler
     const handleCopyTranscript = (text: string) => {
       navigator.clipboard.writeText(text)
       setCopiedTranscript(true)
       setTimeout(() => setCopiedTranscript(false), 2200)
       showNotification('Transcript copied to clipboard!')
     }
     
     // Clear errors handler
     const handleClearErrors = async () => {
       if (!confirm('Are you sure you want to clear all error log entries?')) return
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
     
     // Sync handler
     const handleSync = () => {
       statsHook.fetchStats(true, statsHook.selectedRange)
       usersHook.fetchUsers(true)
     }
     
     // Auth gate
     if (status === 'loading' || (statsHook.loading && !statsHook.stats)) {
       return (
         <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
           <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
             <Loader2 className="h-8 w-8 animate-spin" />
           </div>
           <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
             Connecting to Intelligence Telemetry...
           </p>
         </div>
       )
     }
     
     if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
       return (
         <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center p-6">
           <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
             <Lock className="h-8 w-8" />
           </div>
           <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
             Admin Access Restricted
           </h1>
           <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
             You must be authenticated with an administrative account.
           </p>
         </div>
       )
     }
     
     return (
       <ErrorBoundary
         fallbackTitle="Admin Dashboard Error"
         fallbackMessage="Failed to load admin dashboard. Please refresh or contact support."
       >
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
           
           <AdminHeader
             currentTime={currentTime}
             isSyncing={statsHook.isSyncing}
             onSync={handleSync}
             onOpenTelegram={telegramHook.openTelegramModal}
           />
           
           <TimeMachineFilter
             selectedRange={statsHook.selectedRange}
             onRangeChange={statsHook.handleRangeChange}
             startTime={statsHook.stats?.range.startTime || ''}
             endTime={statsHook.stats?.range.endTime || ''}
           />
           
           {statsHook.stats && <KPICards stats={statsHook.stats} />}
           
           <TabNavigation
             activeTab={activeTab}
             onTabChange={setActiveTab}
             userCount={usersHook.users.length}
             keyFleetCount={statsHook.stats?.keyFleet?.length || 1}
             errorCount={statsHook.stats?.errors.recent.length || 0}
           />
           
           {/* Tab Content */}
           {activeTab === 'overview' && statsHook.stats && (
             <div className="flex flex-col gap-8">
               {statsHook.stats.batchQueue && <BatchQueueCard batchQueue={statsHook.stats.batchQueue} />}
               <DailyStatsChart
                 dailyStats={statsHook.stats.dailyStats}
                 isHourly={statsHook.stats.range.isHourly || false}
                 currentTime={currentTime}
                 selectedRange={statsHook.selectedRange}
               />
               <DistributionCharts
                 languages={statsHook.stats.languages}
                 inputModes={statsHook.stats.inputModes}
                 formats={statsHook.stats.formats}
                 hourlyActivity={statsHook.stats.hourlyActivity}
               />
             </div>
           )}
           
           {activeTab === 'feed' && statsHook.stats && (
             <LiveActivityFeed
               recentTranscripts={statsHook.stats.recentTranscripts}
               onTranscriptClick={setInspectingTranscript}
             />
           )}
           
           {activeTab === 'users' && (
             <UserManagementTable
               users={usersHook.filteredUsers}
               usersLoading={usersHook.usersLoading}
               actionUserId={usersHook.actionUserId}
               userSearch={usersHook.userSearch}
               userRoleFilter={usersHook.userRoleFilter}
               currentUserEmail={session?.user?.email}
               onUserSearch={usersHook.setUserSearch}
               onRoleFilterChange={usersHook.setUserRoleFilter}
               onInspectUser={usersHook.handleInspectUser}
               onRoleChange={usersHook.handleRoleChange}
               onDeleteUser={usersHook.handleDeleteUser}
               onExportCsv={usersHook.handleExportUsersCsv}
             />
           )}
           
           {activeTab === 'keys' && statsHook.stats && (
             <FleetHealthPanel
               keyFleet={statsHook.stats.keyFleet}
               fleetHealth={statsHook.stats.fleetHealth}
               models={statsHook.stats.models}
               pingResults={fleetHook.pingResults}
               isPingingKeys={fleetHook.isPingingKeys}
               probingFleet={fleetHook.probingFleet}
               onPingAllKeys={fleetHook.handlePingAllKeys}
               onProbeFleet={() => fleetHook.handleProbeFleet(() => statsHook.fetchStats(true, statsHook.selectedRange))}
               onOpenTelegram={telegramHook.openTelegramModal}
             />
           )}
           
           {activeTab === 'tokens' && statsHook.stats && (
             <TokenCostPanel tokens={statsHook.stats.tokens} />
           )}
           
           {activeTab === 'errors' && statsHook.stats && (
             <ErrorClusterPanel
               errorClusters={statsHook.stats.errorClusters}
               errors={statsHook.stats.errors}
               selectedError={selectedError}
               activeClusterId={activeClusterId}
               clearingErrors={clearingErrors}
               onClusterClick={setActiveClusterId}
               onErrorClick={setSelectedError}
               onCloseErrorDetail={() => setSelectedError(null)}
               onClearErrors={handleClearErrors}
             />
           )}
           
           {/* Modals */}
           <TelegramModal
             isOpen={telegramHook.telegramModalOpen}
             testingTelegram={telegramHook.testingTelegram}
             dispatchingDigest={telegramHook.dispatchingDigest}
             telegramSetup={telegramHook.telegramSetup}
             loadingTelegramSetup={telegramHook.loadingTelegramSetup}
             registeringWebhook={telegramHook.registeringWebhook}
             disconnectingWebhook={telegramHook.disconnectingWebhook}
             onClose={telegramHook.closeTelegramModal}
             onTestTelegram={telegramHook.handleTestTelegram}
             onDispatchDigest={telegramHook.handleDispatchEveningDigest}
             onRegisterWebhook={telegramHook.handleRegisterWebhook}
             onDeleteWebhook={telegramHook.handleDeleteWebhook}
           />
           
           <TranscriptInspector
             transcript={inspectingTranscript}
             copiedTranscript={copiedTranscript}
             onClose={() => setInspectingTranscript(null)}
             onCopyTranscript={handleCopyTranscript}
           />
           
           <UserDossierModal
             userId={usersHook.selectedUserId}
             userDossier={usersHook.userDossier}
             dossierLoading={usersHook.dossierLoading}
             actionUserId={usersHook.actionUserId}
             currentUserEmail={session?.user?.email}
             onClose={usersHook.closeUserDossier}
             onRoleChange={usersHook.handleRoleChange}
             onDeleteUser={usersHook.handleDeleteUser}
           />
         </div>
       </ErrorBoundary>
     )
   }
   ```
   
   **Key changes:**
   - All state consolidated into 4 custom hooks
   - All JSX sections delegated to purpose-built components
   - Main file is now a clean orchestration layer
   - Loading states handled with skeleton components
   - Error boundaries wrap risky sections
   
   **Files:** `app/admin/page.tsx` (major refactor)
   
   **Verify:** Run full build, test all tabs, verify all functionality works identically to before.

---

## Phase 7: Final Testing and Verification

- [ ] **26. Run comprehensive integration tests**
   
   **Test checklist:**
   - [ ] Admin auth gate works (unauthenticated users see error)
   - [ ] Stats load on mount and auto-refresh every 12s
   - [ ] Time machine changes date range correctly
   - [ ] All 6 KPI cards display correct values
   - [ ] All 6 tabs switch correctly
   - [ ] Overview tab: charts render, batch queue card (if exists)
   - [ ] Feed tab: transcript table, click to inspect
   - [ ] Users tab: search, filter, CSV export, role change, delete, dossier modal
   - [ ] Keys tab: ping keys, probe fleet, model health updates
   - [ ] Tokens tab: token ledger and cost display
   - [ ] Errors tab: cluster selection, error detail modal, clear errors
   - [ ] Telegram modal: all operations (test, digest, webhook)
   - [ ] Transcript inspector: copy to clipboard works
   - [ ] User dossier: opens, displays data, actions work
   - [ ] Loading skeletons show during fetch
   - [ ] Error boundaries catch errors and show fallback
   - [ ] Notification toasts appear and auto-dismiss
   
   **Commands to run:**
   ```bash
   npm run build
   npm run dev
   ```
   
   **Manual testing:** Open admin dashboard at `/admin`, test every feature
   
   **Files:** All newly created files
   
   **Verify:** Complete functional equivalence with original monolithic file. No regressions.

- [ ] **27. Code quality and cleanup**
   
   **Tasks:**
   - Remove any unused imports
   - Ensure all TypeScript types are properly exported/imported
   - Add JSDoc comments to complex functions
   - Verify consistent naming conventions
   - Check that all `className` strings follow Tailwind patterns
   - Ensure all icons are imported from `lucide-react`
   - Verify all `framer-motion` animations work
   
   **Run linter:**
   ```bash
   npm run lint
   ```
   
   **Fix any ESLint warnings**
   
   **Files:** All refactored files
   
   **Verify:** Zero ESLint errors, zero TypeScript errors, clean build output.

---

## Summary of File Changes

### New Files (23 total)

**Types:**
- `app/admin/types.ts`

**Hooks (4):**
- `app/admin/hooks/useAdminStats.ts`
- `app/admin/hooks/useUsers.ts`
- `app/admin/hooks/useTelegramOps.ts`
- `app/admin/hooks/useFleetDiagnostics.ts`

**Utils:**
- `app/admin/utils/adminHelpers.ts`

**Components (15):**
- `app/admin/components/AdminHeader.tsx`
- `app/admin/components/TabNavigation.tsx`
- `app/admin/components/TimeMachineFilter.tsx`
- `app/admin/components/KPICards.tsx`
- `app/admin/components/BatchQueueCard.tsx`
- `app/admin/components/LiveActivityFeed.tsx`
- `app/admin/components/UserManagementTable.tsx`
- `app/admin/components/UserDossierModal.tsx`
- `app/admin/components/TelegramModal.tsx`
- `app/admin/components/TranscriptInspector.tsx`
- `app/admin/components/ErrorClusterPanel.tsx`
- `app/admin/components/FleetHealthPanel.tsx`
- `app/admin/components/TokenCostPanel.tsx`
- `app/admin/components/charts/DailyStatsChart.tsx`
- `app/admin/components/charts/HourlyActivityChart.tsx`
- `app/admin/components/charts/DistributionCharts.tsx`

**Skeletons (3):**
- `app/admin/components/KPICardsSkeleton.tsx`
- `app/admin/components/TableSkeleton.tsx`
- `app/admin/components/ChartSkeleton.tsx`

### Modified Files (1)

- `app/admin/page.tsx` - Refactored from 876+ lines to ~180 lines

---

## Architecture Benefits

1. **Maintainability**: Each component has a single responsibility
2. **Testability**: Hooks and utils can be unit tested independently
3. **Reusability**: Components can be reused in other admin pages
4. **Performance**: Smaller components = better memoization opportunities
5. **Developer Experience**: Clear file organization, easy to navigate
6. **Type Safety**: Centralized types prevent type drift
7. **Loading States**: Consistent skeleton UI across all sections
8. **Error Handling**: Error boundaries prevent full page crashes

---

## Implementation Order (Dependency Graph)

**No circular dependencies. Follow this sequence:**

1. Types file (foundation)
2. Utils (no dependencies)
3. All 4 hooks (depend on types only)
4. Skeleton components (depend on LoadingSkeleton pattern)
5. All leaf components (depend on types, use icons)
6. Chart components (depend on types)
7. Complex components with modals (depend on types, leaf components)
8. Main page refactor (depends on everything)
9. Testing and verification

---

## Success Criteria

✅ `app/admin/page.tsx` reduced from 876+ lines to under 200 lines
✅ All functionality preserved (zero regressions)
✅ `npm run build` completes with no errors
✅ All TypeScript types properly imported/exported
✅ Loading skeletons show during data fetching
✅ Error boundaries catch and display errors gracefully
✅ All 6 tabs functional
✅ All modals (Telegram, Dossier, Inspector) work
✅ All CRUD operations (user management) work
✅ Time machine date range selector works
✅ Fleet diagnostics (ping, probe) work
✅ CSV export works
✅ Notification toasts work

---

**End of Implementation Plan**
