import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { hashPassword } from '../lib/password.ts'
import { testTranscriptPanel } from './panel-browser.mjs'

const db = await PGlite.create()
const database = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 })
const migration = (name) => readFile('prisma/migrations/' + name + '/migration.sql', 'utf8')
await db.exec(await migration('20261115000000_baseline'))
await db.exec(`INSERT INTO "TranscriptCache"(id, "audioHash", text) VALUES ('legacy', 'hash', 'legacy entry')`)

const users = ['qa-one', 'qa-two']
const password = 'local-test-password'
const passwordHash = hashPassword(password)
for (const user of users) {
  await db.query('INSERT INTO "User"(id, email, "passwordHash") VALUES ($1, $2, $3)', [user, user + '@example.test', passwordHash])
  await db.query(`INSERT INTO "Transcript"(id,text,source,"userId","updatedAt") VALUES ($1,'Saved before upgrade','file',$2,NOW())`, [user + '-history', user])
}
await db.query('UPDATE "User" SET role = $1 WHERE id = $2', ['admin', users[0]])
await database.start()
const databaseConnection = database.getServerConn()
const port = 3218
const base = 'http://127.0.0.1:' + port
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  windowsHide: true,
  env: {
    ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@' + databaseConnection + '/postgres?connection_limit=1',
    NEXTAUTH_URL: base, NEXTAUTH_SECRET: 'local-test-secret-not-a-production-secret',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', RESEND_API_KEY: '', EMAIL_SERVER_HOST: '',
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', ADMIN_EMAILS: '', ADMIN_EMAIL: '',
    GEMINI_API_KEYS: 'local-test-provider-key', GEMINI_API_KEY: '', GEMINI_API_HOST: 'generativelanguage.googleapis.com',
    TRANSCRIPTION_QUEUE_ENABLED: 'false', NODE_OPTIONS: '--require=./tests/fake-gemini.cjs'
  },
  stdio: 'inherit'
})
const cookieField = (response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
async function login(user) {
  const csrf = await fetch(base + '/api/auth/csrf')
  const { csrfToken } = await csrf.json()
  const login = await fetch(base + '/api/auth/callback/credentials', {
    method: 'POST', redirect: 'manual',
    headers: { cookie: cookieField(csrf), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: user + '@example.test', password, callbackUrl: base, json: 'true' })
  })
  const authCookie = cookieField(login)
  const auth = await fetch(base + '/api/auth/session', { headers: { cookie: authCookie } })
  assert.equal((await auth.json()).user?.id, user, 'real credentials sign-in')
  return authCookie
}
const json = (cookie, body) => ({
  method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body)
})
async function expectStatus(response, expected) {
  if (response.status !== expected) throw new Error(`Expected HTTP ${expected}, got ${response.status}: ${await response.text()}`)
  return response
}
const fakeFile = new Uint8Array(32)
const upload = async (cookie, purpose, mimeType) => {
  const session = await expectStatus(await fetch(base + '/api/upload-session', json(cookie, {
    mimeType, fileName: 'qa-sample', fileSize: fakeFile.length, purpose
  })), 200)
  const { uploadToken } = await session.json()
  assert.ok(uploadToken)
  await expectStatus(await fetch(base + '/api/upload-proxy', {
    method: 'POST', headers: { cookie, 'x-upload-token': uploadToken }, body: fakeFile
  }), 200)
  return uploadToken
}
try {
  let ready = false
  for (let i = 0; i < 45; i++) {
    try {
      const response = await fetch(base)
      if (response.ok) { ready = true; break }
    } catch {}
    if (app.exitCode !== null) break
    await wait(500)
  }
  assert.ok(ready, 'local Next.js server started')
  await expectStatus(await fetch(base + '/register?callbackUrl=%2Fhistory', { redirect: 'manual' }), 307)
  const owner = await login(users[0])
  const other = await login(users[1])
  const ownerHeaders = { cookie: owner }
  const historyBefore = await fetch(base + '/api/history', { headers: ownerHeaders })
  if (process.env.REPRODUCE_ADMIN_FAILURE === 'true') {
    await expectStatus(await fetch(base + '/api/admin/stats?range=all', { headers: ownerHeaders }), 500)
    console.log('REPRODUCED: admin statistics fail against the existing schema while saved history is readable.')
  } else if (process.env.REPRODUCE_OLD_BUILD === 'true') {
    assert.equal(historyBefore.status, 500, 'old build cannot read baseline history')
    const oldToken = await upload(owner, 'transcription', 'video/mp4')
    const brokenJob = await fetch(base + '/api/transcribe/jobs', json(owner, { uploadToken: oldToken, duration: 4 }))
    assert.equal(brokenJob.status, 500, 'old build crashes starting a job')
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "Transcript"')).rows[0].total, 2)
    console.log('REPRODUCED: old build returns 500 for history and job creation, while original transcripts remain intact.')
  } else {
    const checkAdmin = async (expectedTranscripts, expectedRequests) => {
      const response = await expectStatus(await fetch(base + '/api/admin/stats?range=all', { headers: ownerHeaders }), 200)
      const stats = await response.json()
      assert.equal(stats.overview.allTimeTranscripts, expectedTranscripts)
      assert.equal(stats.overview.totalUsers, 2)
      assert.equal(stats.recentTranscripts.length, expectedTranscripts)
      assert.equal(stats.models.reduce((sum, model) => sum + model.requests, 0), expectedRequests)
      // The proxy deliberately conceals admin endpoints from non-admin users.
      await expectStatus(await fetch(base + '/api/admin/stats', { headers: { cookie: other } }), 404)
      for (const path of ['/api/admin/users', '/api/admin/users?id=' + users[1], '/api/admin/cache', '/api/admin/audit-logs', '/api/admin/fleet']) {
        await expectStatus(await fetch(base + path, { headers: ownerHeaders }), 200)
        await expectStatus(await fetch(base + path, { headers: { cookie: other } }), 404)
      }
    }
    await checkAdmin(2, 0)
    if (process.argv.includes('--panel')) await testTranscriptPanel({ base, cookie: owner, db, userId: users[0] })
    const legacyHistory = await (await expectStatus(historyBefore, 200)).json()
    assert.equal(legacyHistory.total, 1)
    assert.equal(legacyHistory.items[0].id, users[0] + '-history')
    const legacyUrl = base + '/api/history?id=' + users[0] + '-history'
    assert.equal((await (await expectStatus(await fetch(legacyUrl, { headers: ownerHeaders }), 200)).json()).text, 'Saved before upgrade')
    await expectStatus(await fetch(legacyUrl, { headers: { cookie: other } }), 404)
    const legacyToken = await upload(owner, 'transcription', 'video/mp4')
    const unavailable = await expectStatus(await fetch(base + '/api/transcribe/jobs', json(owner, { uploadToken: legacyToken, duration: 4 })), 503)
    assert.equal((await unavailable.json()).code, 'DATABASE_MIGRATION_REQUIRED')
    // The browser fallback sends only the same signed reference, not media bytes.
    const fallback = await expectStatus(await fetch(base + '/api/transcribe', {
      ...json(owner, { uploadToken: legacyToken, duration: 4 }),
      headers: { ...json(owner, {}).headers, 'x-stream': '1' }
    }), 200)
    const events = (await fallback.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.ok(!events.some(event => event.type === 'status' && event.phase === 'uploading'), 'a signed upload must not appear to upload again')
    const result = events.find(event => event.type === 'result')
    assert.ok(result?.text.includes('example recording'), JSON.stringify(events))
    const saved = await (await expectStatus(await fetch(base + '/api/history', json(owner, {
      text: result.text, segments: result.segments, source: 'file', filename: 'legacy-batch.mp4', expectedUserId: users[0], cacheId: 'legacy'
    })), 201)).json()
    assert.ok(saved.id)
    assert.deepEqual(JSON.parse((await db.query('SELECT text FROM "Transcript" WHERE id=$1', [saved.id])).rows[0].text).segments, result.segments)
    assert.equal((await (await fetch(base + '/api/history', { headers: ownerHeaders })).json()).total, 2)
    const savedUrl = base + '/api/history?id=' + saved.id
    await expectStatus(await fetch(savedUrl, { method: 'DELETE', headers: { cookie: other } }), 404)
    await expectStatus(await fetch(savedUrl, { method: 'DELETE', headers: ownerHeaders }), 200)
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "Transcript"')).rows[0].total, 2)
    console.log('Passed baseline schema: existing history, detail ownership, signed-upload streaming, save and deletion.')
    await checkAdmin(2, 1)
    await db.exec(`INSERT INTO "TranscriptCache"(id, "audioHash", text) VALUES ('evict-fixture', 'evict-hash', 'cache fixture')`)
    await expectStatus(await fetch(base + '/api/admin/cache?id=evict-fixture', { method: 'DELETE', headers: ownerHeaders }), 200)
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "TranscriptCache"')).rows[0].total, 1)

    // Migrate with the same process running to catch stale capability caching.
    await db.exec(await migration('20261115000001_scope_transcript_cache'))
    await db.exec(await migration('20261115000002_transcription_jobs'))
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "TranscriptCache"')).rows[0].total, 0)
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "Transcript"')).rows[0].total, 2)
    const token = await upload(owner, 'transcription', 'audio/mpeg')
    await expectStatus(await fetch(base + '/api/upload-proxy', {
      method: 'POST', headers: { cookie: other, 'x-upload-token': token }, body: fakeFile
    }), 403)

    const requestJob = () => fetch(base + '/api/transcribe/jobs', json(owner, { uploadToken: token, duration: 4 }))
    const first = await expectStatus(await requestJob(), 202)
    const { id } = await first.json()
    const repeated = await expectStatus(await requestJob(), 202)
    assert.equal((await repeated.json()).id, id)
    const jobUrl = base + '/api/transcribe/jobs?id=' + id
    await expectStatus(await fetch(jobUrl, { headers: { cookie: other } }), 404)
    let job
    for (let i = 0; i < 24; i++) {
      job = await (await expectStatus(await fetch(jobUrl, { headers: { cookie: owner } }), 200)).json()
      if (job.status === 'complete' || job.status === 'failed') break
      await wait(500)
    }
    assert.equal(job.status, 'complete', JSON.stringify(job))
    assert.ok(job.result.text.includes('example recording'))
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "Transcript"')).rows[0].total, 3)
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "UsageMetric"')).rows[0].total, 2)
    const historyUrl = base + '/api/history?id=' + job.transcriptId
    assert.equal((await (await fetch(historyUrl, { headers: { cookie: owner } })).json()).job.id, id)
    await expectStatus(await fetch(historyUrl, { method: 'DELETE', headers: { cookie: owner } }), 200)
    await expectStatus(await fetch(jobUrl, { headers: { cookie: owner } }), 404)

    const report = await upload(owner, 'report', 'application/pdf')
    await expectStatus(await fetch(base + '/api/report', json(other, { mode: 'summary', uploadToken: report })), 403)
    const summary = await expectStatus(await fetch(base + '/api/report', json(owner, { mode: 'summary', uploadToken: report })), 200)
    assert.equal((await summary.json()).kind, 'summary')
    assert.equal((await (await fetch(legacyUrl, { headers: ownerHeaders })).json()).text, 'Saved before upgrade')
    await checkAdmin(2, 2)
    console.log('Passed admin data, cache eviction, and authorization on both schemas.')
    console.log('Passed migrations, credentials authentication, upload ownership, resumable jobs and reports, idempotent history and usage, and cascade deletion.')

  }
} finally {
  if (app.exitCode === null) {
    app.kill()
    await once(app, 'exit')
  }
  await database.stop()
  await db.close()
}


