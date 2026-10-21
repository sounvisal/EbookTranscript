// Shared TypeScript types for Admin Dashboard

export type DateRangeOption = 'today' | 'yesterday' | '7d' | '30d' | 'all'
export type RefreshIntervalOption = 'off' | '15s' | '30s' | '60s'

export type KeyDiagnostic = {
  index: number
  masked: string
  status: 'healthy' | 'warning' | 'rate_limited' | 'invalid' | 'error'
  latencyMs: number
  httpStatus: number
  message: string
  modelsCount?: number
  lastChecked: string
}

export type TelegramSetupState = {
  configured: boolean
  bot?: { id: number; is_bot: boolean; first_name: string; username?: string } | null
  adminChatIdConfigured?: boolean
  webhook?: {
    url?: string
    has_custom_certificate?: boolean
    pending_update_count?: number
    last_error_date?: number
    last_error_message?: string
  } | null
  error?: string
}

export type ErrorCluster = {
  id: string
  name: string
  severity: 'high' | 'medium' | 'low' | 'info'
  count: number
  percentage: string
  remediation: string
  sampleErrors: Array<{ id: string; message: string; timestamp: string }>
}

export type AdminStats = {
  range: {
    active: string
    isHourly?: boolean
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
    avgLatencyMs?: number | null
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
    tokensToday?: number
    routedRequestsRange?: number
    tokensRange?: number
    avgLatencyMs?: number | null
  }>
  fleetHealth?: {
    models: Array<{
      model: string
      status: 'HEALTHY' | 'DEGRADED' | 'HIGH_DEMAND_503' | 'RATE_LIMITED_429'
      rollingLatencyMs: number
      lastLatencyMs: number
      consecutiveErrors: number
      degradedUntil: number
      lastChecked: string
      lastError?: string
      successCount: number
      failureCount: number
    }>
    optimalModel: string
    optimalOrder: string[]
  }
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

export type ManagedUser = {
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

export type UserDossier = {
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
