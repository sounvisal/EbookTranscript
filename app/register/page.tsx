import { redirect } from 'next/navigation'

type RegisterPageProps = {
  searchParams?: {
    callbackUrl?: string
  }
}

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = new URLSearchParams({ mode: 'register' })

  if (searchParams?.callbackUrl) {
    params.set('callbackUrl', searchParams.callbackUrl)
  }

  redirect(`/login?${params.toString()}`)
}
