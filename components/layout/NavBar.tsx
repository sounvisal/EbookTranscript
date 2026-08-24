'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'
import { Sparkles, ShieldCheck } from 'lucide-react'

export default function NavBar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  const linkClass = (href: string) =>
    `relative rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
      pathname === href
        ? 'bg-slate-900 text-white shadow-xs'
        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
    }`

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/75 backdrop-blur-2xl transition-all">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-blue-50 to-blue-100/60 p-1.5 shadow-xs ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-105">
            <Image src="/logo.png" alt="Signal" width={32} height={32} className="h-full w-full object-contain" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-950">Signal</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-500/10">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
          </div>
        </Link>

        {/* Navigation items & Auth */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/50">
            <Link href="/" className={linkClass('/')}>Transcribe</Link>
            <Link href="/history" className={linkClass('/history')}>History</Link>
            {session?.user?.role === 'admin' && (
              <Link href="/admin" className={linkClass('/admin')}>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Admin
                </span>
              </Link>
            )}
          </div>

          {session ? (
            <button
              onClick={() => signOut()}
              className="rounded-full border border-slate-200/80 bg-white/90 px-4 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:text-slate-950 active:scale-95"
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={() => signIn()}
              className="apple-btn-primary rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold text-white transition-all active:scale-95"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
