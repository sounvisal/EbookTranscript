import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const errors = await prisma.errorLog.findMany({
    take: 30,
    orderBy: { createdAt: 'desc' }
  })

  console.log(JSON.stringify(errors, null, 2))
}

main().finally(() => prisma.$disconnect())
