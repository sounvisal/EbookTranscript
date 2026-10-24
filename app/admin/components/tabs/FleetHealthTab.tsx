'use client'

import React from 'react'
import {
  Key,
  Activity,
  Smartphone,
  Zap,
  RefreshCw,
  Cpu,
  Loader2
} from 'lucide-react'
import type { AdminStats, KeyDiagnostic } from '../../types'

interface FleetHealthTabProps {
  keyFleet: AdminStats['keyFleet']
  fleetHealth: AdminStats['fleetHealth']
  models: AdminStats['models']
  pingResults: Record<number, KeyDiagnostic>
  isPingingKeys: boolean
  probingFleet: boolean
  onPingAllKeys: () => void
  onProbeFleet: () => void
  onOpenTelegram: () => void
}

export function FleetHealthTab({
  keyFleet,
  fleetHealth,
  models,
  pingResults,
  isPingingKeys,
  probingFleet,
  onPingAllKeys,
  onProbeFleet,
  onOpenTelegram
}: FleetHealthTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span>Configured Gemini API Keys & Rotation Fleet</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rotated across incoming transcription jobs to balance rate limits. Click &quot;Ping All Keys&quot; to check live latency and 429 status.
            </p>
          </div>

          {/* Ping All Keys Diagnostic Button */}
          <button
            onClick={onPingAllKeys}
            disabled={isPingingKeys}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isPingingKeys ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            <span>Ping All Keys ({keyFleet?.length || 1})</span>
          </button>
        </div>

        {/* Telegram Remote Sync Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-sky-500/5 border border-sky-500/20 dark:bg-sky-950/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Zero-Typing Telegram Key Monitor
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tap <code className="bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded font-bold">[ 🔑 Key Fleet ]</code> on your phone anytime to run this exact live probe.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenTelegram}
              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-all cursor-pointer"
            >
              Manage Telegram Bot
            </button>
          </div>
        </div>

        {/* Fleet Aggregate Bandwidth Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 border border-slate-200/80 dark:border-slate-800">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Fleet Size</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">{keyFleet?.length || 1} API Keys</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Daily Quota Capacity</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{((keyFleet?.length || 1) * 1500).toLocaleString()} reqs/day</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Instant Bandwidth</span>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{(keyFleet?.length || 1) * 15} RPM max</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Probe Health</span>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">
              {Object.values(pingResults).filter((p) => p.status === 'healthy').length || keyFleet?.length || 1} / {keyFleet?.length || 1} Operational
            </p>
          </div>
        </div>

        {/* Key Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-1">
          {keyFleet?.map((k) => {
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
                    <span className="text-slate-500">Today&apos;s Traffic Share:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                      ~{k.loadSharePercent || 0}% ({k.routedRequestsToday || 0} reqs)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${k.loadSharePercent || 0}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 font-mono">
                    <span>Tokens Today: {(k.tokensToday || 0).toLocaleString()}</span>
                    <span>{k.avgLatencyMs ? `Latency: ${k.avgLatencyMs}ms` : ''}</span>
                  </div>
                </div>

                {/* Per-Key Daily Cap Progress against Google 1,500 limit */}
                <div className="flex flex-col gap-1 border-t border-slate-200/60 dark:border-slate-800/80 pt-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Daily Quota (1,500 cap):</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                      {k.routedRequestsToday || 0} / 1,500 ({Math.min(100, Math.round(((k.routedRequestsToday || 0) / 1500) * 100))}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(2, Math.round(((k.routedRequestsToday || 0) / 1500) * 100)))}%` }}
                      className={`h-full rounded-full ${
                        (k.routedRequestsToday || 0) >= 1200
                          ? 'bg-red-500'
                          : (k.routedRequestsToday || 0) >= 750
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
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

      {/* Self-Healing Router & Model Fleet Health Section */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-500" />
                <span>Automated Fleet Health Probe & Self-Healing Router</span>
              </h2>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                Live Auto-Failover
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Benchmarks Google Gemini models in real time, isolates 503 high-traffic spikes and 429 rate limits, and prioritizes the fastest model.
            </p>
          </div>

          <button
            onClick={onProbeFleet}
            disabled={probingFleet}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            {probingFleet ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>Probe Fleet Latency</span>
          </button>
        </div>

        {/* Active Optimal Routing Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
              #1
            </div>
            <div>
              <div className="text-xs font-bold flex items-center gap-2">
                <span>Active Optimal Primary Model:</span>
                <code className="bg-emerald-200/50 dark:bg-emerald-900/60 px-2 py-0.5 rounded font-mono font-bold">
                  {fleetHealth?.optimalModel || 'gemini-2.5-flash'}
                </code>
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Self-healing router dispatches jobs here first. If Google reports high traffic (503) or rate limits (429), failover executes instantly in 0ms with zero user disruption.
              </p>
            </div>
          </div>
        </div>

        {/* Models Health Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(fleetHealth?.models || []).map((m) => {
            const isOptimal = fleetHealth?.optimalModel === m.model
            const is503 = m.status === 'HIGH_DEMAND_503'
            const is429 = m.status === 'RATE_LIMITED_429'
            const isHealthy = m.status === 'HEALTHY'

            return (
              <div
                key={m.model}
                className={`flex flex-col gap-2.5 rounded-2xl border p-4 transition-all ${
                  is503
                    ? 'border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20'
                    : is429
                    ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                    : isOptimal
                    ? 'border-emerald-500/50 dark:border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs ring-1 ring-emerald-500/20'
                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate" title={m.model}>
                    {m.model}
                  </span>
                  {isOptimal && (
                    <span className="rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[9px] font-bold">
                      PRIMARY
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                      isHealthy
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : is503
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 animate-pulse'
                        : is429
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                    }`}
                  >
                    {isHealthy ? 'Healthy' : is503 ? '503 High Traffic' : is429 ? '429 Rate Limit' : 'Degraded'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs border-t border-slate-200/60 dark:border-slate-800/60 pt-2">
                  <span className="text-slate-500 text-[11px]">Rolling Latency:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {m.rollingLatencyMs ? `${m.rollingLatencyMs}ms` : '–'}
                  </span>
                </div>

                {m.lastError && (
                  <p className="text-[10px] text-red-600 dark:text-red-400 font-mono truncate" title={m.lastError}>
                    {m.lastError}
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
            Requests handled, tokens consumed, latency, and audio duration by each AI model in active window.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pr-4">Model Identifier</th>
                <th className="pb-3 px-4">Requests</th>
                <th className="pb-3 px-4">Audio Duration</th>
                <th className="pb-3 px-4">Avg Latency</th>
                <th className="pb-3 pl-4 text-right">Tokens Consumed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {models?.map((m) => (
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
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                    {m.avgLatencyMs ? `${m.avgLatencyMs}ms` : '–'}
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
  )
}
