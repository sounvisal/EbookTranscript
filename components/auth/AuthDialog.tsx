'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, getProviders } from 'next-auth/react'
import { Mail, Lock, User, Eye, EyeOff, Sparkles, ArrowRight, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'

type AuthMode = 'login' | 'register'
type ProviderMap = Record<string, { id: string; name: string }>

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function getProviderErrorMessage(error: string | null) {
  if (error === 'CredentialsSignin') return 'Invalid email or password.'
  if (error === 'EmailSignin') return 'Unable to send magic link right now.'
  if (error === 'OAuthAccountNotLinked') return 'That email is already linked with another sign-in method.'
  if (error) return 'Authentication error. Please try again.'
  return null
}

export default function AuthDialog() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const providerError = getProviderErrorMessage(searchParams.get('error'))

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [authMethod, setAuthMethod] = useState<'password' | 'magic-link'>('password')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [providers, setProviders] = useState<ProviderMap | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [directLinkUrl, setDirectLinkUrl] = useState<string | null>(null)

  const hasGoogleProvider = Boolean(providers?.google)

  useEffect(() => {
    let isMounted = true
    getProviders()
      .then((p) => {
        if (isMounted) setProviders((p as ProviderMap | null) ?? {})
      })
      .catch(() => {
        if (isMounted) setProviders({})
      })
    return () => {
      isMounted = false
    }
  }, [])

  const resetMessages = () => {
    setError(null)
    setSuccess(null)
    setDirectLinkUrl(null)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    resetMessages()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Please enter your email address.')
      setIsSubmitting(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      setIsSubmitting(false)
      return
    }

    try {
      if (mode === 'register') {
        if (name.trim().length < 2) {
          setError('Please enter your full name (at least 2 characters).')
          setIsSubmitting(false)
          return
        }

        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          setIsSubmitting(false)
          return
        }

        const registerRes = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: normalizedEmail,
            password
          })
        })

        const registerData = await registerRes.json().catch(() => null)
        if (!registerRes.ok) {
          setError(registerData?.error || 'Unable to create your account.')
          setIsSubmitting(false)
          return
        }

        setSuccess('Account created successfully! Logging you in...')
      }

      const signInResult = await signIn('credentials', {
        email: normalizedEmail,
        password,
        redirect: false,
        callbackUrl
      })

      if (signInResult?.error) {
        setError(mode === 'register' ? 'Account created, but sign-in failed. Please try logging in.' : 'Invalid email or password.')
        setIsSubmitting(false)
        return
      }

      router.push(signInResult?.url || callbackUrl)
      router.refresh()
    } catch (err) {
      console.error(err)
      setError('Authentication failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    resetMessages()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Please enter your email address.')
      setIsSubmitting(false)
      return
    }

    try {
      await signIn('email', {
        email: normalizedEmail,
        redirect: false,
        callbackUrl
      })

      // Query generated direct link
      let quickUrl: string | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 400))
        try {
          const res = await fetch(`/api/auth/quick-link?email=${encodeURIComponent(normalizedEmail)}`)
          const data = await res.json()
          if (data?.url) {
            quickUrl = data.url
            break
          }
        } catch {}
      }

      if (quickUrl) {
        setDirectLinkUrl(quickUrl)
        setSuccess('Login link generated! You can open it directly in a new tab below:')
        try {
          window.open(quickUrl, '_blank')
        } catch {}
      } else {
        setSuccess('Magic sign-in link sent! Please check your email inbox.')
      }
    } catch (err) {
      console.error(err)
      setError('Unable to generate magic link right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10 sm:px-6">
      {/* Background Decorative Blur */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-blue-100/60 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-6 sm:p-8 shadow-2xl shadow-slate-200/60 backdrop-blur-xl">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" className="group mb-3.5 flex items-center gap-2.5 transition-transform hover:scale-105">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1.5 shadow-md shadow-blue-500/15 ring-1 ring-slate-200">
              <Image src="/logo.png" alt="Signal" width={40} height={40} className="h-9 w-9" priority />
            </div>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
            <Sparkles className="h-3 w-3" />
            <span>Signal Intelligence</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {mode === 'login' ? 'Welcome to Signal' : 'Create an Account'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {mode === 'login'
              ? 'Sign in to access your transcription workspace'
              : 'Start converting audio into structured intelligence'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              resetMessages()
            }}
            className={`rounded-lg py-2.5 text-xs font-bold transition-all sm:text-sm ${
              mode === 'login'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register')
              resetMessages()
            }}
            className={`rounded-lg py-2.5 text-xs font-bold transition-all sm:text-sm ${
              mode === 'register'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Status Alerts */}
        {(error || providerError) && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error || providerError}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Direct Link Popout */}
        {directLinkUrl && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-center shadow-sm">
            <p className="text-xs font-bold text-blue-950">✨ Instant Login Link Ready</p>
            <p className="mt-1 text-[11px] text-blue-700">Open in a new tab without checking your email:</p>
            <a
              href={directLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition-all hover:bg-blue-700"
            >
              <span>Open Sign-In Link in New Tab ↗</span>
            </a>
          </div>
        )}

        {/* Google OAuth (if configured) */}
        {hasGoogleProvider && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl })}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-400"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
            <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <span>or with email</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        )}

        {/* Primary Form: Password Auth */}
        {authMethod === 'password' ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Visal Suon"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sounvisal154@gmail.com"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Confirm Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 hover:shadow-blue-600/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? 'Authenticating...' : mode === 'login' ? 'Sign In to Signal' : 'Create Signal Account'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          /* Magic Link Form */
          <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sounvisal154@gmail.com"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 hover:shadow-blue-600/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? 'Generating link...' : 'Send / Open Magic Link'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Toggle between Password & Magic Link */}
        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setAuthMethod(authMethod === 'password' ? 'magic-link' : 'password')
              resetMessages()
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{authMethod === 'password' ? 'Use 1-Click Magic Link instead' : 'Use Password Sign-In instead'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
