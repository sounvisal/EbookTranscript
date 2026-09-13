import fs from 'fs'
import path from 'path'
import readline from 'readline'

const brainDir = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain'

async function searchTranscript(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let lineNum = 0
  for await (const line of rl) {
    lineNum++
    if (!line) continue
    const lower = line.toLowerCase()
    if (lower.includes('apple')) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'USER_INPUT' || lower.includes('skill') || lower.includes('design') || lower.includes('claude')) {
          console.log(`=== MATCH in ${filePath} Line ${lineNum} (type: ${parsed.type || 'unknown'}) ===`)
          const text = parsed.content || parsed.message || line
          console.log(typeof text === 'string' ? text.slice(0, 500) : JSON.stringify(text).slice(0, 500))
          console.log('\n----------------------------------------\n')
        }
      } catch {
        if (lower.includes('design') || lower.includes('skill')) {
          console.log(`=== RAW MATCH in ${filePath} Line ${lineNum} ===`)
          console.log(line.slice(0, 300))
        }
      }
    }
  }
}

async function run() {
  const convDirs = fs.readdirSync(brainDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'tempmediaStorage')

  console.log(`Searching across ${convDirs.length} conversations...`)

  for (const dir of convDirs) {
    const logsDir = path.join(brainDir, dir.name, '.system_generated', 'logs')
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir).filter(f => f.startsWith('transcript') && f.endsWith('.jsonl'))
      for (const f of files) {
        await searchTranscript(path.join(logsDir, f))
      }
    }
  }

  console.log('Search in transcripts finished.')
}

run().catch(console.error)
