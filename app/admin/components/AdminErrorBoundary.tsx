'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class AdminErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AdminErrorBoundary] Caught unhandled exception:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[500px] flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl border border-red-200/80 dark:border-red-900/40 bg-white/90 dark:bg-slate-900/90 p-8 shadow-xl backdrop-blur-xl flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 mb-4 shadow-xs">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Admin Console Error
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md">
              An unexpected render issue occurred while computing telemetry. Other services and the background speech pipelines remain operational.
            </p>

            {this.state.error && (
              <div className="mt-4 w-full text-left rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 p-3.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Exception Details
                </span>
                <p className="font-mono text-xs text-red-600 dark:text-red-400 break-all select-all">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Recover View</span>
              </button>

              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reload Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
