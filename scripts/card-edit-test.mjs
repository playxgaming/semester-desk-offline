import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage()
  const base = process.env.APP_URL || 'http://127.0.0.1:4173'
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(base); await page.getByRole('button', { name: 'Skip', exact: true }).click(); await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.goto(`${base}/#/notes`); await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Note body', { exact: true }).fill('**Matrix**: A rectangular array of numbers.')
  await page.getByRole('button', { name: 'Make cards', exact: true }).click()
  const front = page.getByLabel('Card question 1', { exact: true }), back = page.getByLabel('Card answer 1', { exact: true })
  await front.fill(''); await front.pressSequentially('Edited definition question', { delay: 15 })
  assert.equal(await front.inputValue(), 'Edited definition question', 'Editing a generated question must retain focus through every keystroke')
  assert.equal(await front.evaluate(input => document.activeElement === input), true)
  await back.fill('Edited definition answer')
  await page.getByRole('button', { name: 'Add 1 card', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.goto(`${base}/#/review`)
  await page.getByText('Edited definition question', { exact: true }).waitFor()
  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('semester-desk'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const request = db.transaction('cards').objectStore('cards').getAll()
    const rows = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }); db.close()
    return rows.filter(row => !row.deleted_at && row.front === 'Edited definition question')
  })
  assert.equal(saved.length, 1); assert.equal(saved[0].back, 'Edited definition answer'); assert.deepEqual(errors, [])
  console.log('PASS generated card questions retain typing focus; reviewed question/answer edits persist exactly once into the deck')
  await context.close()
} finally { await browser.close() }
