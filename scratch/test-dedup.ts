import 'dotenv/config'
import { sendTelegramDailyReport } from '../lib/telegram'
import { prisma } from '../lib/prisma'

async function test() {
  console.log('--- Testing Daily Report Deduplication ---')
  
  // Call 1: should detect whether it was already sent or send and record token
  const res1 = await sendTelegramDailyReport(undefined, false)
  console.log('Run 1 result:', res1.skipped ? 'SKIPPED (Already sent today)' : 'SENT')

  // Call 2: should definitely be skipped as duplicate
  const res2 = await sendTelegramDailyReport(undefined, false)
  console.log('Run 2 result:', res2.skipped ? 'SKIPPED (Already sent today)' : 'SENT')
}

test().then(() => prisma.$disconnect()).catch(console.error)
