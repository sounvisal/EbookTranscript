const path = require('path')
const fs = require('fs')

// Prevent NFT tracer from scanning locked Windows Temp directories
if (process.platform === 'win32') {
  const localTemp = path.join(__dirname, '.temp')
  if (!fs.existsSync(localTemp)) {
    fs.mkdirSync(localTemp, { recursive: true })
  }
  process.env.TEMP = localTemp
  process.env.TMP = localTemp
}

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
    outputFileTracingRoot: path.join(__dirname),
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/youtube-dl-exec/bin/**/*', './node_modules/ffmpeg-static/**/*']
    },
    serverComponentsExternalPackages: ['ffmpeg-static', '@distube/ytdl-core', 'youtube-dl-exec'],
    optimizePackageImports: ['lucide-react', 'framer-motion']
  },
  async rewrites() {
    return [
      {
        source: '/gemini-proxy/:path*',
        destination: 'https://generativelanguage.googleapis.com/:path*'
      }
    ]
  }
}

module.exports = nextConfig

