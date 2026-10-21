import { useState } from 'react'
import type { KeyDiagnostic, DateRangeOption } from '../types'

interface UseFleetDiagnosticsParams {
  showNotification: (msg: string) => void
  fetchStats: (silent?: boolean, range?: DateRangeOption) => Promise<void>
  selectedRange: DateRangeOption
}

export function useFleetDiagnostics({ showNotification, fetchStats, selectedRange }: UseFleetDiagnosticsParams) {
  const [pingResults, setPingResults] = useState<Record<number, KeyDiagnostic>>({})
  const [isPingingKeys, setIsPingingKeys] = useState(false)
  const [probingFleet, setProbingFleet] = useState(false)

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

  // Active Fleet Diagnostic Probe & Latency Benchmark
  const handleProbeFleet = async () => {
    setProbingFleet(true)
    try {
      const res = await fetch('/api/admin/fleet', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to probe model fleet.')
      }
      showNotification(`Fleet probe complete! Optimal router target: ${data.optimalModel}`)
      fetchStats(true, selectedRange)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fleet probe failed.')
    } finally {
      setProbingFleet(false)
    }
  }

  return {
    pingResults,
    isPingingKeys,
    probingFleet,
    handlePingAllKeys,
    handleProbeFleet
  }
}
