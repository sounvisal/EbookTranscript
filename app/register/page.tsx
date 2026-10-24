import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type RegisterPageProps = {
  searchParams?: {
    callbackUrl?: string
  }
}

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = new URLSearchParams({ mode: 'register' })

  if (searchParams?.callbackUrl) {
    const rawCallback = searchParams.callbackUrl
    const safeCallback = rawCallback.startsWith('/admin') ? '/transcribe' : rawCallback
    params.set('callbackUrl', safeCallback)
  }

  redirect(`/login?${params.toString()}`)
}
