import { sendTelegramFleetEmergencyAlert, sendTelegramFleetRecoveryAlert } from './telegram'

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
  cooldownUntil: number // timestamp in ms when quarantine/cooldown expires
  lastError?: string
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
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash'
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

// Global in-memory health and quarantine table for the API key fleet
const keyHealthTable = new Map<number, KeyHealthRecord>()
let globalKeyCounter = 0

export function getOrInitKeyRecord(index: number, keyString?: string): KeyHealthRecord {
  let record = keyHealthTable.get(index)
  if (!record) {
    const masked = keyString
      ? `${keyString.slice(0, 6)}...${keyString.slice(-4)}`
      : `Key #${index + 1}`
    record = {
      index,
      masked,
      status: 'HEALTHY',
      latencyMs: 0,
      requestsToday: 0,
      tokensToday: 0,
      lastUsed: new Date().toISOString(),
      errorCountToday: 0,
      cooldownUntil: 0
    }
    keyHealthTable.set(index, record)
  }
  return record
}

/**
 * Records a successful key transaction, clears any quarantine,
 * updates request count, and tracks real latency.
 */
export function recordKeySuccess(index: number, latencyMs?: number) {
  const record = getOrInitKeyRecord(index)
  record.status = 'HEALTHY'
  record.cooldownUntil = 0
  record.requestsToday += 1
  record.lastUsed = new Date().toISOString()
  if (typeof latencyMs === 'number' && latencyMs > 0) {
    record.latencyMs = latencyMs
  }
}

/**
 * Records a key failure.
 * If 429 (Resource Exhausted / Rate Limit), quarantines the key for 60 seconds
 * (Gemini's per-minute quota reset window) so no user requests are stalled by it.
 * If API Key Invalid (400/403), quarantines for 1 hour.
 */
export function recordKeyFailure(index: number, error: unknown) {
  const record = getOrInitKeyRecord(index)
  const message = error instanceof Error ? error.message : String(error)

  // File permission or non-existent file errors (403 on Files API) are object-level errors,
  // not key outages; do not mark key as degraded.
  if (/permission to access the file|does not exist|file.*not found|403\b/i.test(message)) {
    return
  }

  const is429 = /429|resource_exhausted|rate limit|quota/i.test(message)
  const isInvalid =
    /api_key_invalid|invalid api key|api key not found/i.test(message) &&
    !/permission to access the file/i.test(message)

  record.errorCountToday += 1
  record.lastError = message
  record.lastUsed = new Date().toISOString()

  if (is429) {
    record.status = 'RATE_LIMITED'
    // 60-second cooldown: Gemini per-minute quotas reset every 60s
    record.cooldownUntil = Date.now() + 60 * 1000
    console.warn(`[Key Fleet] Key #${index + 1} hit 429 rate limit. Quarantining for 60s (auto-routing traffic to remaining fleet keys).`)
  } else if (isInvalid) {
    record.status = 'INVALID'
    record.cooldownUntil = Date.now() + 30 * 1000 // 30s transient cooldown
    console.error(`[Key Fleet] Key #${index + 1} is INVALID. Quarantined for 30s.`)
  } else {
    record.status = 'WARNING'
    // Brief 5-second transient cooldown to allow other keys to take precedence
    record.cooldownUntil = Date.now() + 5 * 1000
  }
}

/**
 * Returns the next round-robin key index across all requests.
 * Balances traffic uniformly across all available keys so no single key
 * is overwhelmed by concurrent or repeated single uploads.
 */
export function getNextRoundRobinKeyIndex(totalKeys: number): number {
  if (totalKeys <= 0) return 0
  const chosen = Math.abs(globalKeyCounter++) % totalKeys
  return chosen
}

/**
 * High-Speed Dynamic Key Router:
 * Returns all configured keys ordered to maximize speed and eliminate disruption:
 * 1. If preferredIndex is designated, that key is ALWAYS first.
 * 2. Healthy keys starting from round-robin offset come FIRST.
 * 3. Rate-limited/cooldown keys are pushed to the END.
 */
export function getOptimalKeyOrder(
  preferredIndex?: number,
  explicitKeys?: string[]
): { index: number; key: string }[] {
  const keys = explicitKeys || getConfiguredKeys()
  if (keys.length === 0) return []

  const totalKeys = keys.length
  const now = Date.now()

  // Ensure all keys are in health table
  keys.forEach((k, i) => getOrInitKeyRecord(i, k))

  // If a preferred key was explicitly designated (e.g. for batch workers or file uploads),
  // that preferred key MUST ALWAYS be the primary candidate!
  if (typeof preferredIndex === 'number' && preferredIndex >= 0) {
    const designated = preferredIndex % totalKeys
    return [
      { index: designated, key: keys[designated] },
      ...keys.map((k, i) => ({ index: i, key: k })).filter((e) => e.index !== designated)
    ]
  }

  const startIndex = getNextRoundRobinKeyIndex(totalKeys)

  const healthyKeys: { index: number; key: string }[] = []
  const quarantinedKeys: { index: number; key: string; cooldownUntil: number }[] = []

  for (let offset = 0; offset < totalKeys; offset++) {
    const idx = (startIndex + offset) % totalKeys
    const record = getOrInitKeyRecord(idx, keys[idx])
    if (record.cooldownUntil > now) {
      quarantinedKeys.push({ index: idx, key: keys[idx], cooldownUntil: record.cooldownUntil })
    } else {
      healthyKeys.push({ index: idx, key: keys[idx] })
    }
  }

  // Quarantined keys are appended in order of earliest cooldown recovery
  quarantinedKeys.sort((a, b) => a.cooldownUntil - b.cooldownUntil)

  return [
    ...healthyKeys,
    ...quarantinedKeys.map((q) => ({ index: q.index, key: q.key }))
  ]
}

/**
 * Returns a live snapshot of all key health records in memory.
 */
export function getKeyHealthSnapshot(): KeyHealthRecord[] {
  const keys = getConfiguredKeys()
  return keys.map((k, i) => getOrInitKeyRecord(i, k))
}


/**
 * Adaptive Dynamic Router (Self-Healing Routing):
 * - Tracks the rolling latency of the last 3 requests for each model.
 * - If gemini-2.5-flash is taking 1.3s and gemini-3.6-flash is taking 4.5s,
 *   all user traffic is routed to the 1.3s model automatically.
 * - If a model starts returning 503, it is quarantined for 10 minutes so
 *   no user requests are slowed down by retry delays.
 */
export function getOptimalModelOrder(durationSeconds?: number): string[] {
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

  const unquarantined = [
    ...healthyWithHistory.map((m) => m.model),
    ...healthyNoHistory
  ]

  // For long recordings (>= 90s), prioritize models with superior sustained long-audio attention
  // (gemini-2.5-flash, gemini-3.6-flash) ahead of lightweight sub-minute models to prevent premature cutoff
  if (durationSeconds && durationSeconds >= 90) {
    const longContextModels = ['gemini-2.5-flash', 'gemini-3.6-flash']
    unquarantined.sort((a, b) => {
      const aIsLong = longContextModels.includes(a) ? 1 : 0
      const bIsLong = longContextModels.includes(b) ? 1 : 0
      return bIsLong - aIsLong
    })
  }

  // Quarantined models (503 / 429) are deferred to the end of the chain
  return [
    ...unquarantined,
    ...quarantinedModels.map((m) => m.model)
  ]
}

// Tracks whether the entire fleet is currently experiencing an emergency outage
let isFleetInEmergencyOutage = false

/**
 * Records a successful model transcription and updates the rolling latency of the last 3 requests.
 * If the model was previously degraded, restores it to healthy fleet.
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

  if (wasDegraded && latencyMs < 3500) {
    console.log(`[Adaptive Router] Model "${model}" recovered (rolling latency: ${(record.rollingLatencyMs / 1000).toFixed(1)}s). Restoring to healthy fleet.`)
  }

  // If the fleet was in an emergency outage (all models down) and has now recovered:
  if (isFleetInEmergencyOutage && !skipTelegramAlert) {
    isFleetInEmergencyOutage = false
    console.log(`[Adaptive Router] Fleet emergency resolved: "${model}" restored active service (${(latencyMs / 1000).toFixed(1)}s). Dispatching recovery alert.`)
    sendTelegramFleetRecoveryAlert({
      restoredModel: model,
      latencyMs
    }).catch(() => {})
  }
}

/**
 * Records a model failure.
 * If a model starts returning 503, it is quarantined for 10 minutes so no user requests
 * are slowed down by retry delays. Self-healing is automatic and silent.
 * ONLY triggers an alert if ALL models in the fleet fail (true emergency needing admin intervention).
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
    console.warn(`[Adaptive Router] Model "${params.model}" 503 High Traffic spike (#${record.spikes503Today}). Quarantining for 10 minutes (auto-routing user to standby models).`)
  } else if (is429) {
    record.status = 'RATE_LIMITED_429'
    // Quarantined for 2 minutes
    record.degradedUntil = now + 2 * 60 * 1000
    console.warn(`[Adaptive Router] Model "${params.model}" hit 429 rate limit. Quarantining for 2 minutes (auto-rotating key/model).`)
  } else {
    record.status = 'DEGRADED'
    if (record.consecutiveErrors >= 2) {
      record.degradedUntil = now + 3 * 60 * 1000
    }
  }

  // FLEET EMERGENCY CHECK:
  // Only alert when ALL configured models are down and user transcriptions cannot succeed (admin must step in)
  const allModels = getConfiguredModels()
  const allQuarantined = allModels.every((m) => {
    const r = getOrInitModelRecord(m)
    return r.degradedUntil > now
  })

  if (allQuarantined && !isFleetInEmergencyOutage && !params.skipTelegramAlert) {
    isFleetInEmergencyOutage = true
    console.error(`[Adaptive Router] FLEET EMERGENCY: All models in fleet are degraded! Dispatching emergency alert.`)
    sendTelegramFleetEmergencyAlert({
      modelsDown: allModels,
      reason: is429 ? 'Google API Quota / Rate Limits reached across all models (429)' : 'Google AI High Demand across all models (503)'
    }).catch(() => {})
  }
}

/**
 * Returns current snapshot of fleet intelligence without making an outbound API call.
 */
export function getFleetStatusSnapshot(): {
  models: ModelHealthRecord[]
  keys: KeyHealthRecord[]
  optimalModel: string
  optimalOrder: string[]
} {
  const models = getConfiguredModels()
  models.forEach(getOrInitModelRecord)
  const optimalOrder = getOptimalModelOrder()
  return {
    models: models.map(getOrInitModelRecord),
    keys: getKeyHealthSnapshot(),
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

  const keyRecords: KeyHealthRecord[] = getKeyHealthSnapshot()

  return {
    timestamp: new Date().toISOString(),
    models: allRecords,
    keys: keyRecords,
    optimalModel: optimalOrder[0] || models[0],
    activeModelCount: allRecords.filter((r) => r.degradedUntil <= now).length,
    degradedModelCount: allRecords.filter((r) => r.degradedUntil > now).length
  }
}
