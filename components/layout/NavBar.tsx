'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'

export default function NavBar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      pathname === href ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:text-slate-950'
    }`

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-slate-950">
          <Image src="/logo.png" alt="Signal" width={36} height={36} className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Signal</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3">
          <div className="flex items-center">
            <Link href="/" className={linkClass('/')}>Transcribe</Link>
            <Link href="/history" className={linkClass('/history')}>History</Link>
            {session?.user?.role === 'admin' && (
              <Link href="/admin" className={linkClass('/admin')}>
                Admin
              </Link>
            )}
          </div>
          {session ? (
            <button onClick={() => signOut()} className="ml-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
              Sign out
            </button>
          ) : (
            <button onClick={() => signIn()} className="ml-1 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
