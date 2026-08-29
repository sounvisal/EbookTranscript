'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-950 active:scale-95 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
      title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
      aria-label="Toggle Theme"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 animate-in spin-in-180 duration-200" />
      ) : (
        <Moon className="h-4 w-4 text-slate-600 animate-in spin-in-180 duration-200" />
      )}
    </button>
  )
}
