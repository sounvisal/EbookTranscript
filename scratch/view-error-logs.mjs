import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const errors = await prisma.errorLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  })

  console.log('--- LATEST ERROR LOGS ---')
  console.log(JSON.stringify(errors, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
