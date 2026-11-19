import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } }), page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    const real = navigator.serviceWorker.register.bind(navigator.serviceWorker)
    window.restoreOfflineRegistration = () => { navigator.serviceWorker.register = real }
    navigator.serviceWorker.register = async () => { throw new Error('Synthetic interrupted asset download') }
  })
  const base = process.env.APP_URL || 'http://127.0.0.1:4173'
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.goto(`${base}/#/install`)
  await page.getByRole('button', { name: 'Retry offline setup', exact: true }).waitFor({ timeout: 20000 })
  await page.getByRole('alert').filter({ hasText: 'saved records are unchanged' }).waitFor()
  await page.evaluate(() => window.restoreOfflineRegistration())
  await page.getByRole('button', { name: 'Retry offline setup', exact: true }).click()
  await page.getByText('Offline cache ready', { exact: true }).waitFor({ timeout: 60000 })
  await page.reload(); await page.getByRole('heading', { level: 1 }).waitFor(); await context.setOffline(true)
  await page.goto(`${base}/#/help`); await page.getByRole('heading', { name: 'How to use your desk', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS failed offline setup shows a retry action; restoring the connection prepares a usable offline app (isolated synthetic download failure)')
} finally { await browser.close() }
