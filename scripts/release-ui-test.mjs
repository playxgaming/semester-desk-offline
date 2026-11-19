import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const base = process.env.APP_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } }), page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.goto(`${base}/#/help`)
  await page.getByRole('heading', { name: 'How to use your desk', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Open this tool', exact: true }).count(), 10)
  await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline cache timeout')), 55000))]) })
  await context.setOffline(true); await page.reload()
  await page.getByRole('heading', { name: 'How to use your desk', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  await page.goto(`${base}/#/install`)
  await page.getByText(`v${version}`, { exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Download Android APK' }).getAttribute('href'), 'https://github.com/playxgaming/semester-desk-offline/releases/latest/download/semester-desk.apk')
  await page.goto(`${base}/#/settings`)
  await page.getByRole('heading', { name: `Semester Desk v${version}`, exact: true }).waitFor()
  await page.getByRole('link', { name: 'Usage guide', exact: true }).last().click()
  await page.getByRole('heading', { name: 'How to use your desk', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS offline usage guide, 360px layout, version identity, settings help and new signed-APK download link')
} finally { await browser.close() }
