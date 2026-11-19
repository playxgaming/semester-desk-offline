import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage(), base = process.env.APP_URL || 'http://127.0.0.1:4173'
  const errors = [], requests = []
  page.on('pageerror', e => errors.push(e.message))
  const quote = 'A matrix is a rectangular array of numbers arranged in rows and columns.'
  let mode = 'valid', release
  await page.route('**/api/health', route => route.fulfill({ json: { aiConfigured: true, providers: { gemini: true, groq: true }, scannerConfigured: true, notesConfigured: true } }))
  await page.route('**/api/generate-notes', async route => {
    const input = route.request().postDataJSON(); requests.push(input)
    if (mode === 'pending') await new Promise(resolve => { release = resolve })
    const result = { title: 'Matrices from lecture', body_md: 'A matrix contains rows and columns. [S1]', citations: [{ source_id: 'S1', quote: mode === 'invalid' ? 'A quotation invented by the model.' : quote }], provider: input.provider, model: 'synthetic-model' }
    await route.fulfill({ json: { result } }).catch(() => {})
  })
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('semester-desk'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const tx = db.transaction(['courses', 'topics', 'notes', 'course_documents'], 'readwrite')
    const base = { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }
    tx.objectStore('courses').put({ ...base, id: 'ai-course', code: 'MATH101', name: 'Algebra', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' })
    tx.objectStore('topics').put({ ...base, id: 'ai-topic', course_id: 'ai-course', name: 'Matrices', order_index: 0, confidence: 0, est_minutes: 60, exam_critical: false })
    tx.objectStore('notes').put({ ...base, id: 'original-note', title: 'My original note', body_md: 'Published original', local_draft: { title: 'My original note', body_md: 'My untouched manual draft.', at: base.updated_at }, course_id: 'ai-course', topic_id: 'ai-topic', pinned: false })
    tx.objectStore('course_documents').put({ ...base, id: 'unselected-source', course_id: 'ai-course', title: 'Unselected source', kind: 'reference', body_text: 'UNSELECTED PRIVATE TEXT must never be sent.', imported_at: base.updated_at })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
    localStorage.setItem('semester-desk:notes:selected', 'original-note')
  })
  // Native fixture writes bypass Dexie's live-query invalidation; reload its caches.
  await page.reload()
  const rows = table => page.evaluate(async table => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('semester-desk'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const tx = db.transaction(table), request = tx.objectStore(table).getAll()
    const result = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }); db.close()
    return result.filter(r => !r.deleted_at)
  }, table)
  await page.goto(`${base}/#/courses/ai-course`)
  await page.getByRole('button', { name: 'Add reference material', exact: true }).click()
  await page.getByLabel('Reference title', { exact: true }).fill('Lecture 1')
  await page.getByLabel('Reference text', { exact: true }).fill(quote)
  await page.getByRole('button', { name: 'Save reference locally', exact: true }).click()
  await page.getByRole('button', { name: 'View reference: Lecture 1', exact: true }).waitFor()
  assert.equal(requests.length, 0, 'Reference import must not call a provider')
  await page.goto(`${base}/#/notes`)
  await page.getByRole('button', { name: 'AI notes', exact: true }).click()
  await page.getByLabel('Notes course', { exact: true }).selectOption('ai-course')
  await page.getByLabel('Notes topic', { exact: true }).selectOption('ai-topic')
  await page.getByLabel('Notes provider', { exact: true }).selectOption('groq')
  await page.getByLabel('Find source excerpts', { exact: true }).fill('Lecture 1')
  await page.getByRole('button', { name: 'Select excerpt', exact: true }).click()
  assert.equal(await page.getByLabel('Text to send S1', { exact: true }).inputValue(), quote)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).waitFor({ state: 'hidden' })
  await page.getByLabel('Note body', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Note body', { exact: true }).inputValue(), 'A matrix contains rows and columns. [S1]')
  assert.equal(requests[0].provider, 'groq')
  assert.equal(requests[0].sources.length, 1)
  assert.equal(requests[0].sources[0].text, quote)
  assert.doesNotMatch(JSON.stringify(requests[0]), /PRIVATE TEXT|untouched manual|document_id|original-note/)
  let generated = (await rows('notes')).filter(n => n.ai_provenance)
  assert.equal(generated.length, 1)
  const firstId = generated[0].id
  assert.equal((await rows('notes')).find(n => n.id === 'original-note').local_draft.body_md, 'My untouched manual draft.')
  console.log('PASS reviewed reference import, explicit provider/excerpt selection, mobile layout and separate editable generated draft')

  await page.getByLabel('Note body', { exact: true }).fill('My revised explanation. [S1]')
  await page.getByRole('button', { name: 'Generate another draft', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).waitFor({ state: 'hidden' })
  generated = (await rows('notes')).filter(n => n.ai_provenance)
  assert.equal(generated.length, 2)
  assert.equal(requests[1].provider, requests[0].provider, 'Regeneration retains the previous provider rather than silently selecting another')
  const first = generated.find(n => n.id === firstId)
  assert.equal(first.local_draft?.body_md ?? first.body_md, 'My revised explanation. [S1]')
  assert.equal(generated.find(n => n.id !== firstId).ai_provenance.derived_from_note_id, firstId)
  console.log('PASS regeneration creates a new draft and preserves edited content and generation provenance')

  mode = 'invalid'
  await page.getByRole('button', { name: 'Generate another draft', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('alert').getByText(/reference could not be matched/).waitFor()
  assert.equal((await rows('notes')).filter(n => n.ai_provenance).length, 2)
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).getByRole('button', { name: 'Close', exact: true }).last().click()
  mode = 'pending'
  await page.getByRole('button', { name: 'Generate another draft', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel generation', exact: true }).click()
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).waitFor({ state: 'hidden' })
  release?.()
  await page.waitForTimeout(150)
  assert.equal((await rows('notes')).filter(n => n.ai_provenance).length, 2)
  console.log('PASS fabricated quotations and cancelled late responses create no notes')

  mode = 'valid'
  await page.evaluate(() => {
    window.originalNotePut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'notes' && value.ai_provenance) throw new DOMException('Injected quota failure', 'QuotaExceededError')
      return window.originalNotePut.call(this, value, ...args)
    }
  })
  await page.getByRole('button', { name: 'Generate another draft', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('button', { name: 'Retry saving draft locally', exact: true }).waitFor()
  await page.getByRole('alert').waitFor()
  assert.equal((await rows('notes')).filter(n => n.ai_provenance).length, 2)
  const calls = requests.length
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalNotePut })
  await page.getByRole('button', { name: 'Retry saving draft locally', exact: true }).click()
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).waitFor({ state: 'hidden' })
  assert.equal(requests.length, calls, 'Retry saving must not issue a second paid inference')
  assert.equal((await rows('notes')).filter(n => n.ai_provenance).length, 3)
  console.log('PASS storage failure retains the generated preview; retry saves without another provider request')

  if (!base.includes('5173')) {
    await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker timeout')), 30000))]) })
    await page.reload()
    await page.getByLabel('Note body', { exact: true }).waitFor()
    await context.setOffline(true)
    await page.reload()
    assert.equal(await page.getByLabel('Note body', { exact: true }).inputValue(), 'A matrix contains rows and columns. [S1]')
    await page.getByRole('region', { name: 'Generation sources' }).getByText(/\[S1\]/).click()
    await page.getByRole('blockquote').getByText(quote, { exact: true }).waitFor()
    console.log('PASS generated draft, model details and original source quotations remain usable after offline reload')
  }
  assert.deepEqual(errors, [])
  await context.close()
} finally { await browser.close() }
