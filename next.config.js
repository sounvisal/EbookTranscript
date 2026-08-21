/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static', '@distube/ytdl-core'],
    optimizePackageImports: ['lucide-react', 'framer-motion']
  }
}

module.exports = nextConfig

