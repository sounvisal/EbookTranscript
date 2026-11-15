import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type RegisterPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { callbackUrl } = await searchParams
  const params = new URLSearchParams({ mode: 'register' })

  if (typeof callbackUrl === 'string' && callbackUrl) {
    const safeCallback = callbackUrl.startsWith('/admin') ? '/transcribe' : callbackUrl
    params.set('callbackUrl', safeCallback)
  }

  redirect(`/login?${params.toString()}`)
}
