import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/layout/NavBar'
import { Providers } from '@/components/providers/SessionProvider'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Signal — AI Transcription',
  description: 'Fast, clear transcripts from audio and video.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-body antialiased">
        <Providers>
          <NavBar />
          <main>{children}</main>
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
