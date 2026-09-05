import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Finding Duplicate Transcripts ---')
  const all = await prisma.transcript.findMany({
    orderBy: { createdAt: 'asc' }
  })

  const seen = new Map()
  const duplicateIds = []

  for (const item of all) {
    // Key by user and normalized text (first 120 chars) + filename or source basename
    const cleanText = item.text.trim().replace(/\s+/g, ' ')
    const name = item.filename || item.source
    const key = `${item.userId}_${name}_${cleanText.slice(0, 100)}`

    if (seen.has(key)) {
      duplicateIds.push({
        id: item.id,
        name,
        keptId: seen.get(key),
        createdAt: item.createdAt
      })
    } else {
      seen.set(key, item.id)
    }
  }

  console.log(`Found ${duplicateIds.length} duplicate transcripts:`)
  duplicateIds.forEach(d => console.log(`  - Delete duplicate ${d.id} (${d.name}, created ${d.createdAt}) -> kept original ${d.keptId}`))

  if (duplicateIds.length > 0) {
    const idsToDelete = duplicateIds.map(d => d.id)
    const result = await prisma.transcript.deleteMany({
      where: { id: { in: idsToDelete } }
    })
    console.log(`\nSuccessfully deleted ${result.count} duplicate records!`)
  }
}

main().finally(() => prisma.$disconnect())
