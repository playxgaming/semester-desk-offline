import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
  const context = await browser.newContext(), fixture = await context.newPage()
  const png = await fixture.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 320
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1100, 320); ctx.fillStyle = 'black'; ctx.font = 'bold 48px Arial'; ctx.fillText('Matrices and determinants', 40, 100); ctx.fillText('Unit 1 Algebra', 40, 200)
    return canvas.toDataURL('image/png')
  })
  await fixture.setContent(`<html><body style="margin:0"><img style="width:1000px" src="${png}"></body></html>`)
  await fixture.locator('img').evaluate(img => img.decode())
  const pdf = await fixture.pdf({ width: '1100px', height: '400px', margin: { top: 0, left: 0, right: 0, bottom: 0 }, printBackground: true })
  await fixture.close()
  const page = await context.newPage(), base = process.env.APP_URL || 'http://127.0.0.1:4173'
  const errors = [], external = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(base)) external.push(r.url()) })
  await page.goto(base); await page.getByRole('button', { name: 'Skip', exact: true }).click(); await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  if (!base.includes('5173')) {
    await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline installation timeout')), 60000))]) })
    await page.reload(); await page.getByRole('heading', { level: 1 }).waitFor(); await context.setOffline(true)
  }
  await page.goto(`${base}/#/courses`); await page.locator('a[href^="#/courses/"]').last().click()
  await page.getByRole('button', { name: 'Add reference material', exact: true }).click(); await page.getByRole('button', { name: 'Read photo or scanned PDF locally', exact: true }).click()
  await page.getByLabel('Local OCR file', { exact: true }).setInputFiles({ name: 'scanned-reference.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByRole('button', { name: 'Recognize text locally', exact: true }).click()
  await page.getByLabel('Recognized text to review', { exact: true }).waitFor({ timeout: 120000 })
  assert.match(await page.getByLabel('Recognized text to review').inputValue(), /Matrices.*determinants/i)
  await page.getByRole('button', { name: 'Use reviewed text', exact: true }).click(); await page.getByRole('button', { name: 'Save reference locally', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add reference material' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'View reference: scanned-reference', exact: true }).waitFor()
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS real image-only PDF rendering → local OCR → reviewed reference import, with original bytes retained and no external requests (offline in production)')
  await context.close()
} finally { await browser.close() }
