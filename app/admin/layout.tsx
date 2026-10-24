import { getServerSession } from 'next-auth'
import { authOptions, isUserAdmin } from '@/lib/auth'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Telemetry & Fleet Operations | Signal',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  const isAdmin = isUserAdmin(session?.user?.email, session?.user?.role)

  // Defense-in-depth: if not authenticated or not an admin, trigger native 404
  if (!isAdmin) {
    notFound()
  }

  return <>{children}</>
}
