// Read-only preflight. Never runs migrations, resets, or data writes.
require('dotenv').config({ quiet: true })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('Transcript', 'TranscriptCache', 'TranscriptionJob')
  `
  const available = new Set(columns.map(row => `${row.table_name}.${row.column_name}`))
  const required = {
    Transcript: ['id', 'userId', 'cacheId'],
    TranscriptCache: ['id', 'userId', 'audioHash'],
    TranscriptionJob: ['id', 'userId', 'transcriptId', 'fileName', 'mimeType', 'keyFingerprint',
      'options', 'duration', 'status', 'progress', 'attempts', 'startedAt', 'result', 'error', 'createdAt', 'expiresAt']
  }
  const missing = Object.entries(required).flatMap(([table, fields]) =>
    fields.map(field => `${table}.${field}`).filter(field => !available.has(field)))
  if (missing.length) {
    console.error('Database update required for background jobs and account-scoped caching. Missing:')
    console.error(missing.join('\n'))
    console.error('Follow RELEASE.md. No database changes were made by this check.')
    process.exitCode = 1
  } else {
    console.log('Required columns are present. Also verify migration status and run the rollout integration test.')
  }
}

main().catch(error => {
  console.error('Database preflight could not connect or inspect the schema.', error.code || '')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
