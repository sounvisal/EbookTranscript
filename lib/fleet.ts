import { sendTelegramTrafficAlert, sendTelegramRecoveryAlert } from './telegram'

export type ModelHealthStatus = 'HEALTHY' | 'DEGRADED' | 'HIGH_DEMAND_503' | 'RATE_LIMITED_429'

export type ModelHealthRecord = {
  model: string
  status: ModelHealthStatus
  latencyHistory: number[] // Latencies of the last 3 requests (in ms)
  rollingLatencyMs: number // Dynamic rolling average of the last 3 requests
  lastLatencyMs: number
  consecutiveErrors: number
  degradedUntil: number // timestamp in ms (quarantine expiration)
  lastChecked: string
  lastError?: string
  successCount: number
  failureCount: number
  spikes503Today: number
}

export type KeyHealthRecord = {
  index: number
  masked: string
  status: 'HEALTHY' | 'WARNING' | 'RATE_LIMITED' | 'INVALID'
  latencyMs: number
  requestsToday: number
  tokensToday: number
  lastUsed: string
  errorCountToday: number
}

export type FleetProbeSummary = {
  timestamp: string
  models: ModelHealthRecord[]
  keys: KeyHealthRecord[]
  optimalModel: string
  activeModelCount: number
  degradedModelCount: number
}

const DEFAULT_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite'
]

// Global in-memory health table for the AI model fleet
const modelHealthTable = new Map<string, ModelHealthRecord>()

// Initialize model health entries
export function getOrInitModelRecord(model: string): ModelHealthRecord {
  let record = modelHealthTable.get(model)
  if (!record) {
    record = {
      model,
      status: 'HEALTHY',
      latencyHistory: [],
      rollingLatencyMs: 1500, // baseline
      lastLatencyMs: 1500,
      consecutiveErrors: 0,
      degradedUntil: 0,
      lastChecked: new Date().toISOString(),
      successCount: 0,
      failureCount: 0,
      spikes503Today: 0
    }
    modelHealthTable.set(model, record)
  }
  return record
}

// Reads configured models from environment
export function getConfiguredModels(): string[] {
  const envModels = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  return envModels.length > 0 ? envModels : DEFAULT_MODELS
}

// Reads configured API keys from environment
export function getConfiguredKeys(): string[] {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((k) => k.trim().replace(/["'\r\n]/g, ''))
    .filter(Boolean)
  if (multi.length > 0) return multi

  const single = (process.env.GEMINI_API_KEY || '').trim().replace(/["'\r\n]/g, '')
  return single && single !== 'AIzaSyYourGoogleApiKeyHere' ? [single] : []
}

/**
 * Adaptive Dynamic Router (Self-Healing Routing):
 * - Tracks the rolling latency of the last 3 requests for each model.
 * - If gemini-2.5-flash is taking 1.3s and gemini-3.6-flash is taking 4.5s,
 *   all user traffic is routed to the 1.3s model automatically.
 * - If a model starts returning 503, it is quarantined for 10 minutes so
 *   no user requests are slowed down by retry delays.
 */
export function getOptimalModelOrder(): string[] {
  const allModels = getConfiguredModels()
  const now = Date.now()

  // Ensure all configured models exist in the health table
  allModels.forEach(getOrInitModelRecord)

  const healthyWithHistory: { model: string; rollingLatency: number }[] = []
  const healthyNoHistory: string[] = []
  const quarantinedModels: { model: string; rollingLatency: number }[] = []

  for (const model of allModels) {
    const record = getOrInitModelRecord(model)
    const isQuarantined = record.degradedUntil > now

    if (isQuarantined) {
      quarantinedModels.push({ model, rollingLatency: record.rollingLatencyMs })
    } else if (record.latencyHistory.length > 0) {
      healthyWithHistory.push({ model, rollingLatency: record.rollingLatencyMs })
    } else {
      healthyNoHistory.push(model)
    }
  }

  // Sort models with recorded history strictly by rolling latency of the last 3 requests (fastest first)
  healthyWithHistory.sort((a, b) => a.rollingLatency - b.rollingLatency)

  // Quarantined models (503 / 429) are deferred to the end of the chain
  return [
    ...healthyWithHistory.map((m) => m.model),
    ...healthyNoHistory,
    ...quarantinedModels.map((m) => m.model)
  ]
}

/**
 * Records a successful model transcription and updates the rolling latency of the last 3 requests.
 * If the model was previously degraded, restores it to healthy fleet and alerts Telegram.
 */
export function recordModelSuccess(model: string, latencyMs: number, skipTelegramAlert?: boolean) {
  const record = getOrInitModelRecord(model)
  const now = Date.now()
  const wasDegraded = record.degradedUntil > now || record.status !== 'HEALTHY'

  record.lastLatencyMs = latencyMs

  // Track the rolling latency of the last 3 requests for each model
  record.latencyHistory.push(latencyMs)
  if (record.latencyHistory.length > 3) {
    record.latencyHistory.shift() // keep strictly last 3
  }
  record.rollingLatencyMs = Math.round(
    record.latencyHistory.reduce((acc, curr) => acc + curr, 0) / record.latencyHistory.length
  )

  record.consecutiveErrors = 0
  record.degradedUntil = 0
  record.status = record.rollingLatencyMs > 4000 ? 'DEGRADED' : 'HEALTHY'
  record.lastChecked = new Date().toISOString()
  record.successCount += 1

  if (wasDegraded && latencyMs < 3500 && !skipTelegramAlert) {
    console.log(`[Adaptive Router] Model "${model}" recovered (rolling latency: ${(record.rollingLatencyMs / 1000).toFixed(1)}s). Restoring to healthy fleet.`)
    sendTelegramRecoveryAlert(model, latencyMs).catch(() => {})
  }
}

/**
 * Records a model failure.
 * If a model starts returning 503, it is quarantined for 10 minutes so no user requests
 * are slowed down by retry delays.
 */
export function recordModelFailure(params: {
  model: string
  error: unknown
  latencyMs?: number
  keyIndex?: number
  failoverModel?: string
  skipTelegramAlert?: boolean
}) {
  const record = getOrInitModelRecord(params.model)
  const now = Date.now()
  const message = params.error instanceof Error ? params.error.message : String(params.error)
  const is503 = /503|service unavailable|high demand|overloaded/i.test(message)
  const is429 = /429|resource_exhausted|rate limit|quota/i.test(message)

  record.consecutiveErrors += 1
  record.failureCount += 1
  record.lastError = message
  record.lastChecked = new Date().toISOString()
  if (typeof params.latencyMs === 'number') {
    record.lastLatencyMs = params.latencyMs
    record.latencyHistory.push(params.latencyMs)
    if (record.latencyHistory.length > 3) {
      record.latencyHistory.shift()
    }
  }

  if (is503) {
    record.status = 'HIGH_DEMAND_503'
    // Quarantined for 10 minutes so no user requests are slowed down by retry delays
    record.degradedUntil = now + 10 * 60 * 1000
    record.spikes503Today = (record.spikes503Today || 0) + 1
    console.warn(`[Adaptive Router] Model "${params.model}" 503 High Traffic spike (#${record.spikes503Today}). Quarantining for 10 minutes.`)

    if (!params.skipTelegramAlert) {
      sendTelegramTrafficAlert({
        overloadedModel: params.model,
        errorType: '503_HIGH_DEMAND',
        errorMessage: message.slice(0, 300),
        failoverModel: params.failoverModel,
        latencyMs: params.latencyMs,
        keyIndex: params.keyIndex,
        impactSummary: params.failoverModel
          ? `Zero user downtime: auto-routed to ${params.failoverModel}`
          : 'Attempting fallback across fleet'
      }).catch(() => {})
    }
  } else if (is429) {
    record.status = 'RATE_LIMITED_429'
    // Quarantined for 2 minutes
    record.degradedUntil = now + 2 * 60 * 1000
    console.warn(`[Adaptive Router] Model "${params.model}" hit 429 rate limit. Quarantining for 2 minutes.`)

    if (!params.skipTelegramAlert) {
      sendTelegramTrafficAlert({
        overloadedModel: params.model,
        errorType: '429_RATE_LIMIT',
        errorMessage: message.slice(0, 300),
        failoverModel: params.failoverModel,
        latencyMs: params.latencyMs,
        keyIndex: params.keyIndex,
        impactSummary: 'Auto-rotating API key / model pool'
      }).catch(() => {})
    }
  } else {
    record.status = 'DEGRADED'
    if (record.consecutiveErrors >= 2) {
      record.degradedUntil = now + 3 * 60 * 1000
    }
  }
}

/**
 * Returns current snapshot of fleet intelligence without making an outbound API call.
 */
export function getFleetStatusSnapshot(): {
  models: ModelHealthRecord[]
  optimalModel: string
  optimalOrder: string[]
} {
  const models = getConfiguredModels()
  models.forEach(getOrInitModelRecord)
  const optimalOrder = getOptimalModelOrder()
  return {
    models: models.map(getOrInitModelRecord),
    optimalModel: optimalOrder[0] || models[0],
    optimalOrder
  }
}

/**
 * Runs active diagnostic probe across all configured Gemini models.
 * Measures real latency, verifies availability, and refreshes the health table.
 * Silent: Probing runs diagnostics without triggering Telegram traffic alerts.
 */
export async function probeFleet(apiKey?: string): Promise<FleetProbeSummary> {
  const models = getConfiguredModels()
  const keys = getConfiguredKeys()
  const testKey = apiKey || keys[0]

  if (!testKey) {
    return {
      timestamp: new Date().toISOString(),
      models: [],
      keys: [],
      optimalModel: 'none',
      activeModelCount: 0,
      degradedModelCount: 0
    }
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(testKey)

  const probePromises = models.map(async (modelName) => {
    const t0 = Date.now()
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Respond with the word "ok".' }] }]
      })
      clearTimeout(timer)

      const latencyMs = Date.now() - t0
      recordModelSuccess(modelName, latencyMs, true)
    } catch (err: any) {
      const latencyMs = Date.now() - t0
      recordModelFailure({
        model: modelName,
        error: err,
        latencyMs,
        skipTelegramAlert: true
      })
    }
  })

  await Promise.all(probePromises)

  const allRecords = models.map(getOrInitModelRecord)
  const now = Date.now()
  const optimalOrder = getOptimalModelOrder()

  const keyRecords: KeyHealthRecord[] = keys.map((k, index) => ({
    index,
    masked: `${k.slice(0, 6)}...${k.slice(-4)}`,
    status: 'HEALTHY',
    latencyMs: 0,
    requestsToday: 0,
    tokensToday: 0,
    lastUsed: new Date().toISOString(),
    errorCountToday: 0
  }))

  return {
    timestamp: new Date().toISOString(),
    models: allRecords,
    keys: keyRecords,
    optimalModel: optimalOrder[0] || models[0],
    activeModelCount: allRecords.filter((r) => r.degradedUntil <= now).length,
    degradedModelCount: allRecords.filter((r) => r.degradedUntil > now).length
  }
}
