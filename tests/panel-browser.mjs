import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { setTimeout as wait } from 'node:timers/promises'
import { chromium } from 'playwright-core'

export function silentWave(seconds, sampleRate = 16000) {
  const pcm = Buffer.alloc(44 + seconds * sampleRate * 2)
  pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8)
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22)
  pcm.writeUInt32LE(sampleRate, 24); pcm.writeUInt32LE(sampleRate * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34)
  pcm.write('data', 36); pcm.writeUInt32LE(pcm.length - 44, 40)
  return pcm
}

async function testUploadRecovery(page, base, id) {
  let uploads = 0
  // A real loopback transfer lets XMLHttpRequest report actual bytes sent.
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', base)
    response.setHeader('Access-Control-Allow-Headers', 'x-goog-upload-offset, x-goog-upload-command, content-type')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    if (request.method === 'OPTIONS') return response.writeHead(204).end()
    for await (const _chunk of request) { /* Drain the uploaded bytes. */ }
    await wait(600)
    const success = ++uploads > 1
    response.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(success ? { file: { uri: 'files/mock-upload' } } : {}))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await exerciseUploadRecovery(page, base, id, `http://127.0.0.1:${server.address().port}`, () => uploads)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function exerciseUploadRecovery(page, base, id, uploadUrl, countUploads) {
  await page.route('https://**/*', route => route.abort())
  await page.route('**/api/report-error', route => route.fulfill({ json: { success: true } }))
  let starts = 0
  let reconnects = 0
  let polls = 0
  const result = { id, text: 'Recovered transcript.', duration: 160, alreadySaved: true }
  await page.route('**/api/upload-session', async route => {
    await route.fulfill({ json: { uploadUrl, uploadToken: 'local-upload-token' } })
  })
  await page.route('**/api/transcribe/jobs**', async route => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      if (payload.id) {
        reconnects++
        assert.equal(payload.id, 'mock-job')
        return route.fulfill({ status: 202, json: { id: 'mock-job' } })
      }
      assert.equal(payload.uploadToken, 'local-upload-token')
      assert.equal(payload.options.languagePreference, 'khmer', 'retry keeps selected settings')
      if (++starts === 1) return route.fulfill({ status: 503, json: { error: 'Could not start transcription.' } })
      return route.fulfill({ status: 503, json: { error: 'Could not dispatch job.', id: 'mock-job' } })
    }
    assert.match(route.request().url(), /id=mock-job/)
    if (++polls === 1) return route.fulfill({ json: { status: 'running', progress: 85 } })
    return route.fulfill({ json: { status: 'complete', transcriptId: id, result } })
  })

  await page.goto(base + '/transcribe')
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
  await page.locator('input[type=file]').setInputFiles({ name: 'Long recording.wav', mimeType: 'audio/wav', buffer: silentWave(160) })
  await page.getByRole('button', { name: /Advanced Options/ }).click()
  await page.getByRole('button', { name: /Khmer Only/ }).click()
  await page.getByRole('button', { name: 'Start Transcription Now' }).click()
  const panel = page.getByRole('region', { name: 'Transcription progress' })
  await panel.getByRole('status').filter({ hasText: /^Uploading$/ }).waitFor()
  await panel.getByText(/Keep this tab open/).waitFor()
  await panel.getByRole('progressbar', { name: 'File upload' }).and(page.locator('[aria-valuenow]')).waitFor()
  await page.getByRole('alert').getByText('Long recording.wav', { exact: true }).waitFor()
  await page.getByRole('button', { name: /Khmer Only/ }).waitFor()
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click()
  await page.getByRole('button', { name: 'Retry transcription', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  await panel.getByRole('status').filter({ hasText: /^Transcribing$/ }).waitFor()
  await panel.getByText(/continue in the background/).waitFor()
  const working = panel.getByRole('progressbar', { name: 'Transcribing' })
  assert.equal(await working.getAttribute('aria-valuenow'), null, 'single-pass transcription has no measured value')
  assert.equal(await working.evaluate(bar => getComputedStyle(bar.firstElementChild).animationName), 'none')
  await panel.screenshot({ path: '.temp/progress-mobile.png' })
  assert.equal(await panel.getByText('85%').count(), 0)
  await page.getByText('Recovered transcript.', { exact: true }).waitFor()
  assert.deepEqual({ uploads: countUploads(), starts, reconnects }, { uploads: 2, starts: 2, reconnects: 1 })

  const attempts = { good: 0, retry: 0 }
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/api/transcribe', async route => {
    const file = route.request().postData()?.includes('filename="retry.wav"') ? 'retry' : 'good'
    attempts[file]++
    if (file === 'retry' && attempts.retry === 1) {
      return route.fulfill({ status: 503, json: { error: 'Temporary request failure.' } })
    }
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', ...result }) + '\n' })
  })
  await page.goto(base + '/transcribe')
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Batch Queue' }).click()
  await page.evaluate(() => {
    const fetchResponse = window.fetch.bind(window)
    window.fetch = async (request, options) => {
      const response = await fetchResponse(request, options)
      if (!(options?.body instanceof FormData) || options.body.get('file')?.name !== 'good.wav') return response
      const result = await response.text()
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          const send = (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
          send({ type: 'status', phase: 'processing' })
          send({ type: 'progress', progress: 50, sections: { completed: 2, total: 4 } })
          send({ type: 'progress', progress: 85 })
          window.finishSectionTest = () => {
            controller.enqueue(encoder.encode(result))
            controller.close()
          }
        }
      }))
    }
  })
  await page.locator('input[type=file]').setInputFiles(['good', 'retry'].map(file => ({
    name: `${file}.wav`, mimeType: 'audio/wav', buffer: silentWave(2)
  })))
  await page.getByRole('button', { name: 'Transcribe 2 files' }).click()
  const sections = page.getByRole('progressbar', { name: 'Transcription sections for good.wav' })
  await sections.waitFor()
  assert.equal(await sections.getAttribute('aria-valuenow'), '50')
  assert.equal(await sections.getAttribute('aria-valuetext'), '2 of 4 sections complete')
  assert.equal(await page.getByText('50%', { exact: true }).count(), 1)
  assert.equal(await page.getByText('85%', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('progressbar', { name: 'Transcription sections for retry.wav' }).count(), 0)
  await sections.locator('..').screenshot({ path: '.temp/progress-percent.png' })
  await page.evaluate(() => window.finishSectionTest())
  await page.getByText('1 completed', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Retry failed (1)', exact: true }).click()
  await page.getByText('2 completed', { exact: false }).waitFor()
  assert.deepEqual(attempts, { good: 1, retry: 2 }, 'bulk retry affects only failed files')
  console.log('Passed upload recovery browser checks: measured upload progress, stage display, retry with saved options, reconnect, and retry failed only.')
}

export async function testTranscriptPanel({ base, cookie, db, userId }) {
  const id = 'panel-review-fixture'
  const segments = [
    { start: 0, end: 4, text: 'Hello beautiful world.', words: [
      { text: 'Hello', start: 0, end: 0.4 }, { text: 'beautiful', start: 1.2, end: 2.4 }, { text: 'world', start: 3, end: 3.8 }
    ] },
    { start: 5, end: 8, text: 'សួស្តីអ្នកទាំងអស់គ្នា ខ្ញុំចូលចិត្តរៀនភាសាខ្មែរ។' },
    ...Array.from({ length: 35 }, (_, i) => ({ start: 10 + i * 2, end: 12 + i * 2, text: `Review sentence number ${i + 1} for scrolling and playback.` }))
  ]
  await db.query('INSERT INTO "Transcript"(id,text,source,duration,"userId","updatedAt") VALUES ($1,$2,$3,90,$4,NOW())',
    [id, JSON.stringify({ text: segments.map(segment => segment.text).join('\n\n'), segments }), 'Panel test.wav', userId])
  const browser = await chromium.launch({ channel: process.env.AUDIO_TEST_BROWSER || 'msedge', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
    await context.addCookies(cookie.split('; ').map(item => {
      const split = item.indexOf('=')
      return { name: item.slice(0, split), value: item.slice(split + 1), url: base }
    }))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://**/*', route => route.abort())
    await page.goto(base + '/transcribe?id=' + id)
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()

    // A generated local PCM recording drives the actual HTMLAudioElement clock.
    const pcm = silentWave(90)
    await page.locator('input[type=file]').first().setInputFiles({ name: 'Panel test.wav', mimeType: 'audio/wav', buffer: pcm })
    await page.locator('audio').waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1)
    const setTime = async time => {
      await page.locator('audio').evaluate((audio, value) => { audio.currentTime = value; audio.dispatchEvent(new Event('timeupdate')) }, time)
    }
    const activeWord = page.locator('[data-active-word=true]')
    await setTime(0.2)
    await activeWord.filter({ hasText: /^Hello$/ }).waitFor()
    const rowHeight = () => page.locator('#segment-0').evaluate(element => element.offsetHeight)
    const before = await rowHeight()
    await setTime(1.8)
    await activeWord.filter({ hasText: /^beautiful$/ }).waitFor()
    assert.equal(await rowHeight(), before, 'highlighting must not change layout')
    await setTime(0.8)
    await page.waitForFunction(() => !document.querySelector('[data-active-word=true]'))
    await setTime(0.2)
    await page.locator('#segment-0 span').filter({ hasText: /^Hello$/ }).click()
    await page.waitForFunction(() => document.querySelector('audio').currentTime < 0.1 && !document.querySelector('audio').seeking)
    await page.locator('audio').evaluate(audio => {
      window.__unexpectedSeeks = 0
      audio.addEventListener('seeking', () => { window.__unexpectedSeeks++ })
    })
    await page.getByTitle('Play (Space)', { exact: true }).click()
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 1.4)
    await activeWord.filter({ hasText: /^beautiful$/ }).waitFor()
    assert.equal(await page.evaluate(() => window.__unexpectedSeeks), 0, 'clock updates must never seek backwards')
    await page.getByTitle('Change playback speed', { exact: true }).click()
    assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 1.25)
    await page.getByTitle('Pause (Space)', { exact: true }).click()
    const paused = await page.locator('audio').evaluate(audio => audio.currentTime)
    await wait(100)
    assert.equal(await page.locator('audio').evaluate(audio => audio.currentTime), paused)
    const scroll = page.getByLabel('Transcript reading area', { exact: true })
    await scroll.evaluate(el => { el.scrollTop = 900; el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 300 })) })
    await page.getByRole('button', { name: 'Return to current sentence' }).waitFor()
    await setTime(0.2)
    assert.equal(await scroll.evaluate(el => el.scrollTop), 900, 'manual scrolling pauses follow')
    await page.getByRole('button', { name: 'Return to current sentence' }).click()
    await page.waitForFunction(() => {
      const container = document.querySelector('[aria-label="Transcript reading area"]')
      const word = document.querySelector('[data-active-word=true]')
      if (!word) return false
      const viewport = container.getBoundingClientRect()
      const toolbar = container.firstElementChild.getBoundingClientRect()
      const rect = word.getBoundingClientRect()
      return container.scrollTop < 200 && rect.top >= toolbar.bottom && rect.bottom <= viewport.bottom
    })

    let failNext = true
    let slowWrites = false
    let activeWrites = 0
    let maxWrites = 0
    await page.route('**/api/history', async route => {
      if (route.request().method() !== 'PATCH') return route.continue()
      activeWrites++
      maxWrites = Math.max(maxWrites, activeWrites)
      if (slowWrites) await wait(350)
      if (failNext) {
        failNext = false
        activeWrites--
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Simulated failure"}' })
      }
      const response = await route.fetch()
      activeWrites--
      await route.fulfill({ response })
    })
    const editFirst = async text => {
      await page.locator('#segment-0').getByRole('button', { name: 'Edit', exact: true }).click()
      await page.getByPlaceholder('Type corrected segment text...').fill(text)
      assert.equal(await page.getByTestId('save-status').innerText(), 'Unsaved changes')
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    }
    await editFirst('Hello corrected world.')
    await page.getByTestId('save-status').filter({ hasText: /Save failed/ }).waitFor()
    await page.getByRole('button', { name: 'Retry save', exact: true }).click()
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()
    const stored = async () => JSON.parse((await db.query('SELECT text FROM "Transcript" WHERE id=$1', [id])).rows[0].text)
    assert.equal((await stored()).segments[0].text, 'Hello corrected world.')
    assert.equal((await stored()).segments[0].words, undefined, 'corrected words must not reuse stale timing')
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click()
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()
    assert.deepEqual((await stored()).segments[0].words, segments[0].words)
    await page.getByRole('button', { name: 'Redo edit', exact: true }).click()
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()
    slowWrites = true
    await editFirst('First queued correction.')
    await editFirst('Latest queued correction.')
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()
    assert.equal((await stored()).segments[0].text, 'Latest queued correction.')
    assert.equal(maxWrites, 1, 'serialize history writes')

    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Subtitles (.srt)', exact: true }).click()
    assert.match((await download).suggestedFilename(), /\.srt$/)
    await page.reload()
    await page.getByTestId('save-status').filter({ hasText: /^Saved$/ }).waitFor()
    assert.ok((await page.locator('#segment-0').innerText()).includes('Latest queued correction.'))
    assert.ok((await page.locator('#segment-1').innerText()).includes('សួស្តី'))
    await mkdir('.temp', { recursive: true })
    await page.screenshot({ path: '.temp/panel-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const firstSentence = await page.locator('#segment-0').boundingBox()
    assert.ok(firstSentence.y + firstSentence.height < 844, 'first timestamped sentence should fit in the mobile viewport')
    const edit = page.locator('#segment-0').getByRole('button', { name: 'Edit', exact: true })
    assert.equal(await edit.evaluate(el => getComputedStyle(el).opacity), '1')
    const play = page.getByRole('button', { name: 'Play', exact: true })
    const initialPlayY = (await play.boundingBox()).y
    await scroll.evaluate(el => { el.scrollTop = 600 })
    assert.ok(Math.abs((await play.boundingBox()).y - initialPlayY) < 1, 'compact player stays reachable while reading')
    await scroll.evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: '.temp/panel-mobile.png', fullPage: true })
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(el => ({ tag: el.tagName, classes: el.className, width: el.getBoundingClientRect().width })))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout must not overflow: ' + JSON.stringify(overflow))
    assert.deepEqual(errors, [])
    console.log('Passed panel browser checks: word timing, native clock, seek, speed, follow, save failure/retry, undo/redo, write order, reload, export, and mobile layout.')
    await testUploadRecovery(await context.newPage(), base, id)
  } finally {
    await browser.close()
    await db.query('DELETE FROM "Transcript" WHERE id=$1', [id])
  }
}
