import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function check() {
  const users = await prisma.user.findMany({
    include: {
      accounts: true,
      sessions: true,
    }
  })
  console.log('Total users in DB:', users.length)
  for (const u of users) {
    console.log({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      hasPassword: !!u.passwordHash,
      accounts: u.accounts.map(a => ({ provider: a.provider, id: a.providerAccountId })),
      createdAt: u.createdAt
    })
  }
}

check().then(() => prisma.$disconnect()).catch(console.error)
