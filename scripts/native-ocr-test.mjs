import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { readLocalText } from './src/lib/ocr'; export { Capacitor } from '@capacitor/core';` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false, define: { 'import.meta.env.BASE_URL': '"/"' } })
const browser = await chromium.launch()
try {
  const context = await browser.newContext(), page = await context.newPage(), requests = []
  await context.route('http://localhost/**', async route => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (path === '/native-ocr') return route.fulfill({ body: '<title>Native-mode local OCR</title>', contentType: 'text/html' })
    if (path === '/ocr/lang/eng.traineddata') return route.fulfill({ body: gunzipSync(await readFile('public/ocr/lang/eng.traineddata.gz')), contentType: 'application/octet-stream' })
    const file = resolve(`public${path}`), allowed = resolve('public/ocr') + sep
    if (!file.startsWith(allowed) || path.endsWith('.gz')) return route.abort()
    return route.fulfill({ body: await readFile(file), contentType: path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' })
  })
  await page.goto('http://localhost/native-ocr'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const text = await page.evaluate(async () => {
    Probe.Capacitor.getPlatform = () => 'android'
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 220
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 220); ctx.fillStyle = 'black'; ctx.font = '52px Arial'; ctx.fillText('Matrices and determinants', 40, 120)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return (await Probe.readLocalText(new File([blob], 'native-ocr.png', { type: 'image/png' }))).text
  })
  assert.match(text, /Matrices.*determinant/i)
  assert.ok(requests.includes('/ocr/lang/eng.traineddata'))
  assert.ok(!requests.some(r => r.endsWith('.gz')))
  console.log('PASS real OCR in simulated Android mode uses the exact uncompressed language-model filename, without a gzip/CDN fallback')
} finally { await browser.close() }
