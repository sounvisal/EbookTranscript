import 'dotenv/config'
import { sendTelegramDailyReport, sendTelegramUserAlert } from '../lib/telegram'

async function main() {
  console.log('Testing sendTelegramUserAlert...')
  const userAlertOk = await sendTelegramUserAlert({
    email: 'newuser@example.com',
    name: 'Visal',
    isNewUser: true,
    provider: 'Google'
  })
  console.log('User Alert Status:', userAlertOk)

  console.log('\nTesting sendTelegramDailyReport...')
  const reportResult = await sendTelegramDailyReport()
  console.log('Daily Report Status:', reportResult)
}

main().catch(console.error)
