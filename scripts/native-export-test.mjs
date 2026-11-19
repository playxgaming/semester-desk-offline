import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { sendNativeBlob } from './src/lib/exportFile'` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('http://localhost/native-exports', r => r.fulfill({ body: '<title>Isolated native export checks</title>', contentType: 'text/html' }))
  await page.goto('http://localhost/native-exports'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const result = await page.evaluate(async () => {
    const check = (v, m) => { if (!v) throw new Error(m) }, chunks = []
    let started, cancelled = false
    const api = { begin: async o => { started = o; return { token: 'test' } }, append: async o => { check(o.data.length <= 262144 && o.token === 'test', 'Every bridge chunk must be bounded and owned'); chunks.push(atob(o.data)) }, finish: async () => ({ saved: true }), cancel: async () => { cancelled = true }, print: async () => {} }
    const text = 'Verified backup — हिन्दी notes.\n'.repeat(22000), blob = new Blob([text], { type: 'application/json' })
    check(await Probe.sendNativeBlob(blob, 'semester.json', api), 'Successful picker write must resolve saved')
    const restored = Uint8Array.from(chunks.join(''), c => c.charCodeAt(0))
    check(await new Blob([restored]).text() === text && started.size === blob.size && chunks.length > 1, 'Chunked export must preserve exact UTF-8 bytes')
    check(!await Probe.sendNativeBlob(new Blob(['cancel']), 'cancel.txt', { ...api, finish: async () => ({ saved: false }) }), 'Picker cancellation must never report success')
    let rejected = false
    try { await Probe.sendNativeBlob(new Blob(['failure']), 'failure.txt', { ...api, append: async () => { throw new Error('Injected native storage failure') } }) } catch { rejected = true }
    check(rejected && cancelled, 'Failed transport must reject and clean staging')
    let release
    const pending = Probe.sendNativeBlob(new Blob(['busy']), 'first.txt', { ...api, begin: async () => { await new Promise(resolve => { release = resolve }); return { token: 'test' } } })
    let busy = false; try { await Probe.sendNativeBlob(new Blob(['second']), 'second.txt', api) } catch { busy = true }
    release(); await pending
    check(busy, 'Concurrent exports must not corrupt the active job')
    check(await Probe.sendNativeBlob(new Blob(['retry']), 'retry.txt', api), 'A failed/cancelled job must not lock out a later export')
    return 5
  })
  assert.equal(result, 5)
  console.log('PASS native-export contract: exact chunked Unicode, picker cancellation, failure cleanup, concurrency guard and retry (synthetic native transport)')
} finally { await browser.close() }
