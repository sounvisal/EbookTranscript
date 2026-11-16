import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import ts from 'typescript'
import ffmpeg from 'ffmpeg-static'
import { chromium } from 'playwright-core'

// Generated fixtures and all requests stay local. No Gemini or database calls.
const fixtureDir = await mkdtemp(join(tmpdir(), 'transcript-audio-test-'))
let browser
let server
const uploads = []
const failures = []
async function createVideo(name, seconds, audio = true) {
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1']
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000')
  args.push('-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p')
  if (audio) args.push('-c:a', 'aac', '-b:a', '64k')
  args.push('-movflags', '+faststart', join(fixtureDir, name))
  const process = spawn(ffmpeg, args, { windowsHide: true, stdio: 'inherit' })
  assert.equal((await once(process, 'exit'))[0], 0, 'create local video fixture')
}

try {
  await createVideo('short.mp4', 60)
  await createVideo('long.mp4', 301)
  await createVideo('silent.mp4', 2, false)
  const modules = {}
  for (const name of ['clientAudio', 'transcribeClient', 'uploadLimits']) {
    modules['/' + name + '.js'] = ts.transpileModule(await readFile('lib/' + name + '.ts', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText
  }
  modules['/store.js'] = 'export const useTranscriptStore = {getState: () => ({accountId: "test", file: null})}'
  modules['/storage.js'] = 'export async function recoverPendingMedia() {throw Error("Unexpected background job")}; export const savePendingMedia = recoverPendingMedia'
  const imports = Object.fromEntries(['clientAudio', 'transcribeClient', 'uploadLimits'].map(name => ['@/lib/' + name, '/' + name + '.js']))
  imports['@/store/transcriptStore'] = '/store.js'
  imports['@/lib/mediaStorage'] = '/storage.js'
  server = createServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html')
        res.end('<script type="importmap">' + JSON.stringify({ imports }) + '</script>')
      } else if (modules[req.url]) {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(modules[req.url])
      } else if (['/short.mp4', '/long.mp4', '/silent.mp4'].includes(req.url)) {
        res.setHeader('Content-Type', 'video/mp4')
        res.end(await readFile(join(fixtureDir, req.url.slice(1))))
      } else if (req.url === '/api/transcribe' && req.method === 'POST') {
        const request = new Request('http://localhost/api/transcribe', {
          method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half'
        })
        const form = await request.formData()
        const file = form.get('file')
        assert.equal(file.type, 'audio/wav')
        assert.ok(file.size < 4_000_000, 'extracted audio fits the inline request cap')
        assert.ok(Math.abs(Number(form.get('duration')) - 60) < 0.2)
        uploads.push(file.size)
        res.setHeader('Content-Type', 'application/x-ndjson')
        res.end(JSON.stringify({ type: 'result', text: 'Local transport test', duration: 60 }) + '\n')
      } else {
        if (req.url !== '/favicon.ico') failures.push('Unexpected request: ' + req.url)
        res.writeHead(404).end()
      }
    } catch (error) {
      failures.push(error.message)
      res.writeHead(500).end('Local test failed')
    }
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({ channel: process.env.AUDIO_TEST_BROWSER || 'msedge', headless: true })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:' + server.address().port)
  const results = await page.evaluate(async () => {
    const { prepareMediaForUpload } = await import('/clientAudio.js')
    const { transcribeWithProgress } = await import('/transcribeClient.js')
    const original = await (await fetch('/short.mp4')).arrayBuffer()
    const check = (condition, message) => { if (!condition) throw Error(message) }
    function paddedVideo(size) {
      const padding = new Uint8Array(size - original.byteLength)
      const view = new DataView(padding.buffer)
      view.setUint32(0, padding.byteLength)
      padding.set([102, 114, 101, 101], 4) // Valid MP4 'free' box.
      return new File([original, padding], 'clip.mp4', { type: 'video/mp4' })
    }
    let active = 0
    let maximum = 0
    let opened = 0
    let closed = 0
    const NativeAudioContext = window.AudioContext
    window.AudioContext = class extends NativeAudioContext {
      constructor(options) { super(options); opened++ }
      async decodeAudioData(data) {
        active++
        maximum = Math.max(maximum, active)
        try { return await super.decodeAudioData(data) } finally { active-- }
      }
      async close() { await super.close(); closed++ }
    }
    const clip = paddedVideo(12 * 1024 * 1024)
    const started = performance.now()
    const prepared = await prepareMediaForUpload(clip)
    const preparationMs = Math.round(performance.now() - started)
    check(prepared.file.type === 'audio/wav' && prepared.file.size < 4_000_000, '12 MiB clip must become inline audio')
    const view = new DataView(await prepared.file.arrayBuffer())
    check(view.getUint32(24, true) === 16000, 'speech sample rate preserved')
    check(view.getUint16(22, true) === 1, 'mono output')
    check(Math.abs((view.byteLength - 44) / 32000 - 60) < 0.2, 'full recording retained without trimming')
    const audio = await prepareMediaForUpload(prepared.file)
    check(audio.file === prepared.file, 'existing audio must not be re-encoded')
    const batch = await Promise.all([1, 2, 3].map(() => transcribeWithProgress({ file: clip })))
    check(batch.every(result => result.text === 'Local transport test'), 'batch uses inline route after extraction')
    check(maximum === 1, 'batch decoding must be serialized')
    const priorOpened = opened
    const huge = paddedVideo(65 * 1024 * 1024)
    huge.arrayBuffer = () => { throw Error('oversized file must not be decoded') }
    check((await prepareMediaForUpload(huge)).file === huge, 'oversized video uses direct upload')
    const long = new File([await (await fetch('/long.mp4')).arrayBuffer()], 'long.mp4', { type: 'video/mp4' })
    check((await prepareMediaForUpload(long)).file === long, 'long video uses direct upload')
    check(opened === priorOpened, 'no decode context for guarded recordings')
    const silent = new File([await (await fetch('/silent.mp4')).arrayBuffer()], 'silent.mp4', { type: 'video/mp4' })
    check((await prepareMediaForUpload(silent)).file === silent, 'unsupported audio extraction preserves the original')
    check((await prepareMediaForUpload(clip)).file.type === 'audio/wav', 'failed decode releases the batch slot')
    check(opened === closed, 'all audio contexts close, including failures')
    return { inputBytes: clip.size, uploadBytes: prepared.file.size, preparationMs, maximumConcurrentDecodes: maximum }
  })
  assert.equal(uploads.length, 3)
  assert.deepEqual(failures, [])
  console.log('Passed real-browser extraction, inline batch transport, recording preservation, size/duration guards, and failure cleanup.', results)
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  // mkdtemp generated this exact isolated fixture directory; never remove a caller-provided path.
  assert.equal(dirname(resolve(fixtureDir)), resolve(tmpdir()))
  assert.ok(basename(fixtureDir).startsWith('transcript-audio-test-'))
  await rm(fixtureDir, { recursive: true, force: true })
}
