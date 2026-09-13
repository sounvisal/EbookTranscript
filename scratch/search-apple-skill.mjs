import fs from 'fs'
import path from 'path'

const searchTerms = ['apple design', 'apple-design', 'apple_design', 'human interface guidelines', 'claude skill apple', 'apple style', 'apple aesthetic']

function searchFile(filePath) {
  try {
    const stats = fs.statSync(filePath)
    if (stats.size > 10 * 1024 * 1024) return // skip files > 10MB
    const content = fs.readFileSync(filePath, 'utf8')
    const lower = content.toLowerCase()
    for (const term of searchTerms) {
      if (lower.includes(term)) {
        const idx = lower.indexOf(term)
        const snippet = content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 200)).replace(/\r?\n/g, ' ')
        console.log(`FOUND in ${filePath} (matched '${term}'):\n  ...${snippet}...\n`)
        return true
      }
    }
  } catch (err) {
    // ignore permission / read errors
  }
  return false
}

function walkDir(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build', '.temp'].includes(entry.name)) continue
      walkDir(fullPath, maxDepth, currentDepth + 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (['.jsonl', '.md', '.txt', '.json', '.yaml', '.yml', '.ts', '.js'].includes(ext)) {
        searchFile(fullPath)
      }
    }
  }
}

console.log('--- Searching C:\\Users\\User\\.gemini ---')
walkDir('C:\\Users\\User\\.gemini', 6)

console.log('--- Searching C:\\Users\\User (Desktop, Downloads, Documents) ---')
const userDirs = ['Desktop', 'Downloads', 'Documents']
for (const ud of userDirs) {
  const p = path.join('C:\\Users\\User', ud)
  if (fs.existsSync(p)) {
    walkDir(p, 4)
  }
}

console.log('--- Searching e:\\ ---')
walkDir('e:\\', 4)

console.log('--- Searching d:\\ ---')
if (fs.existsSync('d:\\')) {
  walkDir('d:\\', 4)
}

console.log('Search complete.')
