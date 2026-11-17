import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import { chromium } from 'playwright-core'

function client(base, cookie) {
  return async (path, body, method = body ? 'POST' : 'GET', expected = 200) => {
    const response = await fetch(base + path, { method, headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json().catch(() => ({}))
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`)
    return result
  }
}

export async function testAdminBaseline({ base, owner, other }) {
  const api = client(base, owner)
  const stats = await api('/api/admin/stats?range=all')
  assert.equal(stats.overview.successRate, 'Not measured')
  assert.equal(stats.batchQueue.avgSpeed, 'Not measured')
  assert.equal(stats.keyFleet[0].loadSharePercent, 0)
  assert.equal((await api('/api/admin/jobs')).available, false)
  assert.equal((await api('/api/admin/operations')).model, 'auto')
  for (const path of ['/api/admin/jobs', '/api/admin/operations']) await client(base, other)(path, null, 'GET', 404)
  await api('/api/admin/operations', { setting: 'model', value: 'unknown-model' }, 'PATCH', 400)
  console.log('Passed truthful empty metrics, admin-only operations, and baseline-schema compatibility.')
}

export async function testAdminOperations({ base, owner, other, db, browser }) {
  const api = client(base, owner)
  const settings = () => api('/api/admin/operations')
  const change = (setting, value) => api('/api/admin/operations', { setting, value }, 'PATCH')
  await client(base, other)('/api/admin/operations', { setting: 'safeMode', value: true }, 'PATCH', 404)
  await client(base, other)('/api/admin/jobs', { id: 'fake', action: 'retry' }, 'POST', 404)
  await api('/api/admin/jobs?status=unknown', null, 'GET', 400)
  await api('/api/admin/operations', { setting: 'safeMode', value: 'true' }, 'PATCH', 400)
  await change('safeMode', true)
  assert.equal((await settings()).safeMode, true)
  await api('/api/upload-session', { purpose: 'transcription', mimeType: 'audio/mpeg', fileName: 'pause.mp3', fileSize: 32 }, 'POST', 503)
  await api('/api/transcribe/jobs', { uploadToken: 'not-used' }, 'POST', 503)
  await api('/api/transcribe', { uploadToken: 'not-used' }, 'POST', 503)
  assert.ok((await api('/api/history')).items.length, 'safe mode preserves access to history')

  const fingerprint = createHash('sha256').update('local-test-provider-key').digest('base64url')
  async function seed(id, status, attempts, minutesAgo, expiresIn) {
    await db.query(`INSERT INTO "TranscriptionJob"(id,"userId","fileName","mimeType","keyFingerprint",duration,status,attempts,"startedAt","expiresAt") VALUES ($1,'qa-one',$2,'audio/mpeg',$3,4,$4,$5,$6,$7)`,
      [id, id + '.mp3', fingerprint, status, attempts, minutesAgo === null ? null : new Date(Date.now() - minutesAgo * 60000), new Date(Date.now() + expiresIn * 60000)])
  }
  await seed('ops-running', 'running', 1, 0, 60)
  await seed('ops-interrupted', 'running', 1, 8, 60)
  await seed('ops-expired', 'failed', 1, 1, -1)
  await seed('ops-exhausted', 'failed', 2, 1, 60)
  await seed('ops-retry', 'failed', 1, 1, 60)
  await seed('ops-accepted', 'queued', 0, null, 60)
  await api('/api/admin/jobs', { id: 'ops-retry', action: 'retry' }, 'POST', 409)
  // Accepted work is allowed to reconnect and finish during Safe Mode.
  await api('/api/transcribe/jobs', { id: 'ops-accepted' }, 'POST', 202)
  async function waitForComplete(id) {
    for (let i = 0; i < 30; i++) {
      const result = await api('/api/admin/jobs?id=' + id)
      if (result.items[0]?.status === 'complete') return result.items[0]
      await wait(300)
    }
    throw new Error('Job did not complete: ' + id)
  }
  await waitForComplete('ops-accepted')
  await change('safeMode', false)
  await change('model', 'gemini-2.5-flash-lite')
  assert.equal((await settings()).model, 'gemini-2.5-flash-lite')
  const listed = await api('/api/admin/jobs?search=ops-')
  assert.equal(listed.counts.interrupted, 1)
  assert.equal(listed.counts.running, 1)
  assert.equal(listed.counts.expired, 1)
  assert.equal(listed.items.find(job => job.id === 'ops-exhausted').canRetry, false)
  assert.equal((await api('/api/admin/jobs?status=interrupted')).items[0].id, 'ops-interrupted')
  assert.equal((await api('/api/admin/jobs?search=qa-one%40example.test')).total, 6)
  for (const id of ['ops-running', 'ops-expired', 'ops-exhausted', 'ops-accepted']) {
    await api('/api/admin/jobs', { id, action: 'retry' }, 'POST', 409)
  }
  const before = (await db.query('SELECT count(*)::int AS count FROM "Transcript"')).rows[0].count
  await api('/api/admin/jobs', { id: 'ops-retry', action: 'retry' })
  const completed = await waitForComplete('ops-retry')
  assert.equal(completed.model, 'gemini-2.5-flash-lite', 'pinned model reaches the provider pipeline')
  assert.equal(completed.attempts, 2)
  await api('/api/admin/jobs', { id: 'ops-retry', action: 'retry' }, 'POST', 409)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM "Transcript"')).rows[0].count, before + 1)
  assert.equal((await api('/api/admin/jobs?id=ops-retry')).audit[0].action, 'JOB_RETRY')

  let update = 5000
  async function telegram(text, { sender = 1234, callback, id = ++update, secret = 'local-webhook-secret' } = {}) {
    const from = { id: sender, is_bot: false }
    const message = { message_id: id, from, chat: { id: -1001234, type: 'supergroup' }, date: Math.floor(Date.now() / 1000), text }
    const payload = { update_id: id, ...(callback ? { callback_query: { id: String(id), from, message, data: callback } } : { message }) }
    const response = await fetch(base + '/api/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(payload) })
    assert.equal(response.status, secret === 'local-webhook-secret' ? 200 : 401)
    return id
  }
  await telegram('/safe_mode on', { secret: 'wrong' })
  await telegram('/safe_mode on', { sender: 9876 })
  assert.equal((await settings()).safeMode, false, 'admin group membership alone cannot mutate operations')
  await telegram('', { callback: 'ops:safe_mode:on', sender: 9876 })
  assert.equal((await settings()).safeMode, false)
  const onId = await telegram('/safe_mode@SignalBot on')
  assert.equal((await settings()).safeMode, true)
  await telegram('', { callback: 'ops:safe_mode:off' })
  await telegram('/safe_mode on', { id: onId })
  assert.equal((await settings()).safeMode, false, 'a duplicate old delivery must not re-enable Safe Mode')
  await telegram('/model 2.5-flash')
  assert.equal((await settings()).model, 'gemini-2.5-flash')
  await telegram('', { callback: 'ops:model:2.5-flash-lite' })
  assert.equal((await settings()).model, 'gemini-2.5-flash-lite')
  await telegram('/model invalid')
  assert.equal((await settings()).model, 'gemini-2.5-flash-lite')
  await telegram('/queue')
  await telegram('/ops')
  await db.query(`INSERT INTO "UsageMetric"(id,"userId",model,"inputType",status,"durationSeconds") VALUES ('ops-quota','qa-two','gemini-2.5-flash','file','success',60)`)
  const resetId = await telegram('/reset_quota qa-two@example.test')
  assert.equal((await db.query(`SELECT status FROM "UsageMetric" WHERE id='ops-quota'`)).rows[0].status, 'quota_reset')
  await db.query(`INSERT INTO "UsageMetric"(id,"userId",model,"inputType",status,"durationSeconds") VALUES ('ops-new-quota','qa-two','gemini-2.5-flash','file','success',60)`)
  await telegram('/reset_quota qa-two@example.test', { id: resetId })
  assert.equal((await db.query(`SELECT status FROM "UsageMetric" WHERE id='ops-new-quota'`)).rows[0].status, 'success', 'duplicate reset cannot erase new usage')
  assert.equal((await api('/api/admin/stats?range=all')).overview.successRate, '100.0%', 'reset quota remains a successful request')
  const previousRequests = (await api('/api/admin/stats?range=all')).models.reduce((sum, model) => sum + model.requests, 0)
  await db.query(`INSERT INTO "UsageMetric"(id,"userId",model,"inputType",status,"durationSeconds","latencyMs") VALUES
    ('ops-batch-unknown','qa-one','gemini-2.5-flash','batch','success',600,NULL),
    ('ops-grant','qa-one','quota-grant','admin_grant','success',-3600,NULL)`)
  assert.equal((await api('/api/admin/stats?range=all')).batchQueue.avgSpeed, 'Not measured', 'missing latency must not become invented speed')
  await db.query(`INSERT INTO "UsageMetric"(id,"userId",model,"inputType",status,"durationSeconds","latencyMs") VALUES
    ('ops-batch-measured','qa-one','gemini-2.5-flash','batch','success',60,30000)`)
  const measured = await api('/api/admin/stats?range=all')
  assert.equal(measured.batchQueue.avgSpeed, '2.0x real-time', 'speed pairs audio duration only with measured latency')
  assert.equal(measured.models.reduce((sum, model) => sum + model.requests, 0), previousRequests + 2, 'admin grants are not transcription requests')
  if (browser) await testAdminBrowser({ base, cookie: owner })
  await change('model', 'auto')
  console.log('Passed persisted model/Safe Mode, accepted work continuity, job recovery, authorization, Telegram buttons, and replay-safe quota reset.')
}

async function testAdminBrowser({ base, cookie }) {
  const browser = await chromium.launch({ channel: process.env.AUDIO_TEST_BROWSER || 'msedge', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
    await context.addCookies(cookie.split('; ').map(item => { const split = item.indexOf('='); return { name: item.slice(0, split), value: item.slice(split + 1), url: base } }))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://**/*', route => route.abort())
    await page.goto(base + '/admin')
    await page.getByRole('heading', { name: 'Admin Dashboard', exact: true }).waitFor()
    const nav = page.getByRole('navigation', { name: 'Admin sections' })
    await nav.getByRole('button', { name: /^Jobs$/ }).click()
    await page.getByRole('button', { name: 'Details for ops-retry.mp3' }).waitFor()
    await page.getByRole('button', { name: 'Details for ops-retry.mp3' }).click()
    await page.getByRole('region', { name: 'Job details' }).getByText(/JOB_RETRY/).waitFor()
    await mkdir('.temp', { recursive: true })
    await page.screenshot({ path: '.temp/admin-jobs-desktop.png', fullPage: true })
    await page.getByLabel('Job status', { exact: true }).selectOption('interrupted')
    await page.getByRole('button', { name: 'Details for ops-interrupted.mp3' }).waitFor()
    await nav.getByRole('button', { name: /^Settings$/ }).click()
    await page.getByLabel('Transcription model', { exact: true }).selectOption('gemini-2.5-flash')
    await page.getByRole('button', { name: 'Save model', exact: true }).click()
    await page.getByText('Saved. Dashboard and Telegram now use these settings.').waitFor()
    await page.getByRole('button', { name: 'Pause new work', exact: true }).click()
    await page.getByRole('button', { name: 'Resume new work', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Resume new work', exact: true }).click()
    await page.getByRole('button', { name: 'Pause new work', exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByLabel('Admin section', { exact: true }).selectOption('jobs')
    await page.getByRole('button', { name: 'Details for ops-retry.mp3' }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile admin has no horizontal overflow')
    await page.screenshot({ path: '.temp/admin-jobs-mobile.png', fullPage: true })
    await page.getByLabel('Admin section', { exact: true }).selectOption('keys')
    await page.getByText('Not checked', { exact: true }).first().waitFor()
    await page.route('**/api/admin/keys/ping', route => route.fulfill({ json: { healthyCount: 0, totalKeys: 1, keys: [{ index: 0, status: 'error', latencyMs: 0, message: 'Simulated outage', lastChecked: new Date().toISOString() }] } }))
    await page.getByRole('button', { name: /Ping All Keys/ }).click()
    await page.getByText('0 / 1 healthy', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('Passed desktop/mobile admin navigation, settings, job details, and all-failed fleet health.')
  } finally { await browser.close() }
}
