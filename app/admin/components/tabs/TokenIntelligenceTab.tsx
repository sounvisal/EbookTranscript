'use client'

import React from 'react'
import { Zap, DollarSign } from 'lucide-react'
import type { AdminStats } from '../../types'

interface TokenIntelligenceTabProps {
  tokens: AdminStats['tokens']
}

export function TokenIntelligenceTab({ tokens }: TokenIntelligenceTabProps) {
  return (
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
              {tokens.inputTokensInRange.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/80">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Output Text Tokens</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
              {tokens.outputTokensInRange.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40">
            <span className="text-xs font-bold text-blue-900 dark:text-blue-200">Total Tokens</span>
            <span className="text-base font-extrabold font-mono text-blue-700 dark:text-blue-300">
              {tokens.tokensInRange.toLocaleString()}
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
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Estimated Cost in Selected Window
          </span>
          <p className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 my-2 font-mono">
            ${tokens.estimatedCostRangeUSD}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Today&apos;s Cost: ${tokens.estimatedCostTodayUSD} USD (Free tier quota provides 1,500 daily requests per key).
          </p>
        </div>
      </div>
    </div>
  )
}
