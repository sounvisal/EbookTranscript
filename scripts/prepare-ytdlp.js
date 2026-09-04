const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')

async function prepare() {
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp'
  const binDir = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin')
  const targetBinary = path.join(binDir, binaryName)

  if (fs.existsSync(targetBinary)) {
    console.log(`[prepare-ytdlp] Binary already exists at ${targetBinary}`)
    if (!isWin) {
      try {
        fs.chmodSync(targetBinary, 0o755)
      } catch {}
    }
    return
  }

  try {
    fs.mkdirSync(binDir, { recursive: true })
    const downloadUrl = isWin
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'

    console.log(`[prepare-ytdlp] Downloading ${binaryName} from ${downloadUrl}...`)
    const res = await fetch(downloadUrl, { redirect: 'follow' })
    if (!res.ok || !res.body) {
      console.warn(`[prepare-ytdlp] Download failed with HTTP ${res.status}`)
      return
    }

    const fileStream = fs.createWriteStream(targetBinary, { mode: 0o755 })
    await pipeline(res.body, fileStream)
    if (!isWin) {
      fs.chmodSync(targetBinary, 0o755)
    }
    console.log(`[prepare-ytdlp] Successfully installed ${binaryName} at ${targetBinary}`)
  } catch (err) {
    console.warn(`[prepare-ytdlp] Non-fatal error preparing yt-dlp:`, err.message || err)
  }
}

prepare()
