import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function checkMetric() {
  const metrics = await prisma.usageMetric.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-10-03T08:35:00.000Z'),
        lte: new Date('2026-10-03T08:38:00.000Z')
      }
    }
  })
  console.log('METRICS:', metrics)
}

checkMetric().then(() => prisma.$disconnect()).catch(console.error)
