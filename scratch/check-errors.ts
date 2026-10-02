import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function checkErrors() {
  const past24h = new Date(Date.now() - 24 * 3600 * 1000)
  const errors = await prisma.errorLog.findMany({
    where: { createdAt: { gte: past24h } },
    orderBy: { createdAt: 'asc' }
  })
  console.log('Errors in last 24h:', errors.length)
  for (const e of errors) {
    console.log({
      id: e.id,
      endpoint: e.endpoint,
      errorType: e.errorType,
      errorMessage: e.errorMessage,
      createdAt: e.createdAt
    })
  }
}

checkErrors().then(() => prisma.$disconnect()).catch(console.error)
