'use client'

import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
    
    // Report to error tracking endpoint
    fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        inputType: 'error-boundary',
        userComment: 'React error boundary caught unhandled exception'
      })
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
          <div className="apple-glass w-full max-w-lg rounded-3xl p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-red-50 to-red-100/80 dark:from-red-950/80 dark:to-red-900/40 text-red-600 dark:text-red-400 ring-1 ring-red-500/20">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {this.props.fallbackMessage ||
                'An unexpected error occurred. Our team has been notified. Please try refreshing the page.'}
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-6 max-h-48 overflow-auto rounded-xl bg-red-50/60 dark:bg-red-950/40 p-4 text-left">
                <p className="text-xs font-mono text-red-900 dark:text-red-200">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="mt-2 text-[10px] text-red-700 dark:text-red-300 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </button>
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
