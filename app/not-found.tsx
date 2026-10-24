import Link from 'next/link'
import { Sparkles, ArrowRight, Home, Mic } from 'lucide-react'

export const metadata = {
  title: '404 — Page Not Found | Signal',
  description: 'The requested page could not be found.',
}

export default function NotFound() {
  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      {/* Decorative ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[580px] rounded-full bg-blue-100/50 dark:bg-blue-950/30 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
        {/* Signal Tag */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/20">
          <Sparkles className="h-3 w-3" />
          <span>404 • Resource Not Found</span>
        </div>

        {/* Big Glitch 404 Number */}
        <h1 className="text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-8xl">
          404
        </h1>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200 sm:text-2xl">
          Page not found
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          The link you followed may be broken, or the page may have been moved, removed, or does not exist.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/transcribe"
            className="apple-btn-primary inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 hover:shadow-blue-600/35 active:scale-[0.99]"
          >
            <Mic className="h-4 w-4" />
            <span>Go to Transcribe</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm backdrop-blur-md transition-all hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white"
          >
            <Home className="h-4 w-4" />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
