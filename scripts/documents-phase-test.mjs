import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Real, tiny two-page PDF. No provider, network fixture or user data.
function pdfFixture(textPages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${textPages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${textPages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  textPages.forEach(lines => {
    const streamId = objects.length + 2
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`)
    const stream = `BT /F1 12 Tf 50 740 Td 18 TL ${lines.map((line, i) => `${i ? 'T* ' : ''}(${line}) Tj`).join('\n')} ET`
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })
  let text = '%PDF-1.4\n', offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(text)
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(text)
}
const pdf = pdfFixture([['Unit 1: Algebra', 'Matrices', 'Determinants'], ['Unit 2: Calculus', 'Differentiation']])
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const base = process.env.APP_URL || 'http://127.0.0.1:4173'
  const errors = [], external = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (!r.url().startsWith(base) && /^https?:/.test(r.url())) external.push(r.url()) })
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  // Seed synthetic records directly in this fresh browser profile.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('semester-desk'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const tx = db.transaction(['courses', 'notes'], 'readwrite')
    const base = { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }
    tx.objectStore('notes').clear()
    tx.objectStore('courses').put({ ...base, id: 'pdf-course', code: 'MATH101', name: 'Document test', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' })
    tx.objectStore('notes').put({ ...base, id: 'draft-note', title: 'Original title', body_md: 'Published content', course_id: 'pdf-course', topic_id: null, pinned: false })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
  })
  if (!base.includes('5173')) {
    await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker readiness timeout')), 30_000))]) })
    await page.reload()
    await page.getByRole('heading', { level: 1 }).waitFor()
    await context.setOffline(true)
  }
  await page.goto(`${base}/#/courses/pdf-course`)
  await page.getByRole('button', { name: 'Import syllabus', exact: true }).click()
  await page.getByLabel('Syllabus PDF', { exact: true }).setInputFiles({ name: 'syllabus.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByLabel('Include page 2', { exact: true }).waitFor()
  assert.match(await page.getByLabel('Syllabus text', { exact: true }).inputValue(), /Differentiation/)
  await page.getByLabel('Include page 2', { exact: true }).uncheck()
  assert.doesNotMatch(await page.getByLabel('Syllabus text', { exact: true }).inputValue(), /Differentiation/)
  await page.getByRole('button', { name: 'Preview topics', exact: true }).click()
  assert.equal(await page.getByLabel('Topic 1', { exact: true }).inputValue(), 'Matrices')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole('button', { name: 'Import 2 topics', exact: true }).click()
  await page.getByRole('dialog', { name: 'Review syllabus topics' }).waitFor({ state: 'hidden' })
  await page.reload()
  await page.getByRole('button', { name: 'View syllabus: syllabus', exact: true }).click()
  await page.getByText('Original page 1', { exact: true }).click()
  assert.equal(await page.getByText('Original page 2', { exact: true }).count(), 0)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original PDF', exact: true }).click()
  const download = await downloading
  const stream = await download.createReadStream(), chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.deepEqual(Buffer.concat(chunks), pdf)
  console.log('PASS real PDF extraction, page exclusion, reviewed import, mobile layout, source reload and original-byte download (offline in production)')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Import syllabus', exact: true }).click()
  await page.getByLabel('Syllabus PDF', { exact: true }).setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') })
  await page.getByRole('alert').getByText(/PDF header/).waitFor()
  await page.getByLabel('Syllabus PDF', { exact: true }).setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: pdfFixture([[]]) })
  await page.getByRole('alert').getByText(/no selectable text/).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS invalid and image-only PDFs explain recovery without importing data')

  await page.goto(`${base}/#/notes`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Note body', { exact: true }).fill('Unsaved body survives a reload')
  await page.getByText('Draft saved on this device', { exact: true }).waitFor()
  // Reload without blur/Save, so only the recovery draft has the new text.
  await page.reload()
  await page.getByLabel('Note body', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Note body', { exact: true }).inputValue(), 'Unsaved body survives a reload')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Draft saved on this device', { exact: true }).waitFor({ state: 'hidden' })
  await page.reload()
  await page.locator('p').filter({ hasText: /^Unsaved body survives a reload$/ }).waitFor()
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log('PASS unsaved draft recovery, explicit save and reload with no external requests or page errors')
  await context.close()
} finally { await browser.close() }
