import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export * from './src/lib/offline'` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('http://localhost/offline-retry', r => r.fulfill({ body: '<title>Offline recovery checks</title>', contentType: 'text/html' }))
  await page.goto('http://localhost/offline-retry'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const checks = await page.evaluate(async () => {
    const check = (v, m) => { if (!v) throw new Error(m) }
    const states = []; let calls = 0
    const ok = { active: { state: 'activated' } }
    const dead = Object.assign(new EventTarget(), { state: 'redundant' })
    check(await Probe.installOffline(async () => ++calls === 1 ? { installing: dead } : ok, s => states.push(s), 0, 20), 'An interrupted install must retry')
    check(calls === 2 && states.join(',') === 'preparing,ready', 'Retry must finish as ready only after activation')
    calls = 0; states.length = 0
    check(!await Probe.installOffline(async () => { calls++; throw new Error('Interrupted network') }, s => states.push(s), 0, 20), 'Persistent failure must finish visibly')
    check(calls === 3 && states.at(-1) === 'error', 'Automatic retries must be bounded')
    const stuck = Object.assign(new EventTarget(), { state: 'installing' })
    check(!await Probe.installOffline(async () => ({ installing: stuck }), () => {}, 0, 5), 'A stalled installer must time out rather than hang indefinitely')
    check(await Probe.installOffline(async () => ok, () => {}, 0, 20), 'A fresh retry must recover from an earlier failure')
    let registered = 0
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => { registered++; return ok } } })
    check((await Promise.all([Probe.prepareOffline(), Probe.prepareOffline()])).every(Boolean) && registered === 1, 'Concurrent preparation must reuse one job')
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => { throw new Error('Offline update check') }, getRegistration: async () => ok } })
    check(await Probe.prepareOffline(), 'An existing activated offline cache must remain ready when an update check fails')
    return 6
  })
  assert.equal(checks, 6)
  console.log('PASS offline installation: interrupted retry, bounded errors, stalled timeout, later recovery and one shared preparation job')
} finally { await browser.close() }
