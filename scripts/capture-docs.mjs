import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const dir = resolve('docs/images')
await mkdir(dir, { recursive: true })
const base = process.env.APP_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1, timezoneId: 'Asia/Kolkata' })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  // The application's disposable demo seed is the only data in these images.
  const shots = [ ['today', '', 'Your day at a glance'], ['timetable', 'timetable', 'Weekly classes'], ['planner', 'planner', 'Study planning'], ['notes', 'notes', 'Notes and rendered equations'], ['coach', 'coach', 'Review and practice'], ['quality', 'pilot', 'Manual quality reviews'], ['money', 'money', 'Student budgets'], ['guide', 'help', 'Offline usage guide'] ]
  const titles = { timetable: 'Timetable', planner: 'Planner', notes: 'Notes', coach: 'What the numbers say', pilot: 'Quality reviews', money: 'Money', help: 'How to use your desk' }
  for (const [name, route, caption] of shots) {
    await page.goto(`${base}/#/${route}`)
    if (route) await page.getByRole('heading', { level: 1, name: titles[route], exact: true }).waitFor()
    else await page.getByText("Today's classes", { exact: true }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.locator('main').waitFor()
    if (route === 'notes') await page.getByLabel('Note title', { exact: true }).waitFor()
    if (route === 'pilot') { await page.getByRole('button', { name: 'Inspect item', exact: true }).first().click(); await page.getByRole('button', { name: 'Review this content', exact: true }).waitFor() }
    await page.screenshot({ path: resolve(dir, `${name}.png`), animations: 'disabled' })
    console.log(`Captured ${caption}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/#/`); await page.getByText("Today's classes", { exact: true }).waitFor()
  await page.screenshot({ path: resolve(dir, 'mobile-today.png'), animations: 'disabled' })
  await writeFile(resolve(dir, 'screenshots.json'), JSON.stringify({ captured_at: new Date().toISOString(), data: 'Disposable built-in demo semester. No user records or real AI output.', screenshots: shots.map(([file, route, caption]) => ({ file: `${file}.png`, route, caption })) }, null, 2))
  if (errors.length) throw new Error(errors.join('\n'))
} finally { await browser.close() }
