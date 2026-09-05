import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const items = await prisma.transcript.findMany({
    select: { id: true, filename: true, source: true, createdAt: true, userId: true },
    orderBy: { createdAt: 'desc' },
    take: 15
  })
  console.log(items)
}

main().finally(() => prisma.$disconnect())
