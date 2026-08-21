// Ensure NEXTAUTH_URL is never empty during Vercel build
if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.trim() === '') {
  process.env.NEXTAUTH_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static', '@distube/ytdl-core'],
    optimizePackageImports: ['lucide-react', 'framer-motion']
  }
}

module.exports = nextConfig

