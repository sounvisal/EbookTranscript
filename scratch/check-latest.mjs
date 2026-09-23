import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const latestTranscript = await prisma.transcript.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  console.log('LATEST TRANSCRIPT:\n', JSON.stringify(latestTranscript, null, 2))

  const latestUsage = await prisma.usageMetric.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  console.log('LATEST USAGE:\n', JSON.stringify(latestUsage, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
