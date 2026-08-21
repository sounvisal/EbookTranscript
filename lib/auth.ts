import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import EmailProvider from "next-auth/providers/email"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email and Password",
    credentials: {
      email: {
        label: "Email",
        type: "email",
      },
      password: {
        label: "Password",
        type: "password",
      },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase()
      const password = credentials?.password

      if (!email || !password) {
        return null
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
        },
      })

      if (!user?.passwordHash) {
        return null
      }

      const isValidPassword = verifyPassword(password, user.passwordHash)

      if (!isValidPassword) {
        return null
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    }
  })
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  )
}

declare global {
  var __lastMagicLinks: Record<string, { url: string; time: number }> | undefined
}

if (process.env.RESEND_API_KEY || (process.env.EMAIL_SERVER_HOST && process.env.EMAIL_FROM)) {
  providers.unshift(
    EmailProvider({
      from: process.env.EMAIL_FROM || 'Signal <onboarding@resend.dev>',
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        // Cache the direct link so the user can open it in a new tab immediately
        global.__lastMagicLinks = global.__lastMagicLinks || {}
        global.__lastMagicLinks[email.toLowerCase().trim()] = { url, time: Date.now() }

        console.log('\n=========================================')
        console.log(`⚡ DIRECT SIGN-IN LINK FOR ${email}:`)
        console.log(url)
        console.log('=========================================\n')

        if (process.env.RESEND_API_KEY) {
          try {
            const { Resend } = await import('resend')
            const resend = new Resend(process.env.RESEND_API_KEY)
            const result = await resend.emails.send({
              from: provider.from || 'Signal <onboarding@resend.dev>',
              to: email,
              subject: 'Sign in to Signal Transcript',
              html: `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                  <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Sign in to Signal</h2>
                  <p style="color: #475569; font-size: 15px; line-height: 24px;">
                    Click the button below to securely sign in to your Signal transcript workspace.
                  </p>
                  <div style="margin: 28px 0;">
                    <a href="${url}" style="background-color: #2563eb; color: #ffffff; padding: 13px 26px; font-weight: 600; font-size: 15px; text-decoration: none; border-radius: 10px; display: inline-block;">
                      Sign in to Signal
                    </a>
                  </div>
                  <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                </div>
              `
            })

            if (result.error) {
              console.warn('Resend send warning (free tier test domain limitation):', result.error.message)
            }
          } catch (err) {
            console.warn('Resend email delivery skipped/failed:', err)
          }
          return
        }

        // Fallback to nodemailer if SMTP is provided
        const nodemailer = await import('nodemailer')
        const transport = nodemailer.createTransport({
          host: process.env.EMAIL_SERVER_HOST,
          port: Number(process.env.EMAIL_SERVER_PORT || 587),
          secure: process.env.EMAIL_SERVER_SECURE === 'true' || Number(process.env.EMAIL_SERVER_PORT) === 465,
          auth: {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD
          }
        })
        await transport.sendMail({
          from: provider.from,
          to: email,
          subject: 'Sign in to Signal Transcript',
          text: `Sign in to Signal: ${url}`,
          html: `<p>Click here to sign in: <a href="${url}">Sign in to Signal</a></p>`
        })
      }
    })
  )
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isUserAdmin(email?: string | null, role?: string | null): boolean {
  if (!email && !role) return false
  if (role === 'admin') return true
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return true
  return false
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: "jwt",
  },
  providers,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role || (isUserAdmin(user.email) ? 'admin' : 'user')
      }
      return token
    },
    async session({ session, token }) {
      if (session && session.user && token) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) || (isUserAdmin(session.user.email) ? 'admin' : 'user')
      }
      return session
    },
  },
}
