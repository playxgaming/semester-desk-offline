import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const base = process.env.APP_URL || 'http://127.0.0.1:5173'
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let imageReady = false
  let connectorHealth = false
  await page.route('**/api/health', route => route.fulfill({ json: { aiConfigured: true, localChatGPT: connectorHealth, scannerConfigured: imageReady, providers: { gemini: imageReady, groq: true } } }))
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.evaluate(async () => {
    const { put } = await import('/src/db/mutate.ts')
    const { dayKey, addDays } = await import('/src/lib/date.ts')
    await put('courses', { id: 'syllabus-course', user_id: null, updated_at: '', deleted_at: null, code: 'SYN101', name: 'Test course', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' })
    for (const [id, days, actual] of [['started-sentinel', 2, 15], ['later-sentinel', 20, 0]]) await put('sessions', { id, user_id: null, updated_at: '', deleted_at: null, course_id: null, task_id: null, topic_id: null, date: dayKey(addDays(new Date(), days)), kind: 'study', planned_min: 45, actual_min: actual, status: 'planned', auto: true })
  })
  await page.keyboard.press('Control+k')
  await page.getByRole('button', { name: /Rebuild the study plan/ }).click()
  await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor()
  assert.equal(await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    return (await Promise.all(['started-sentinel', 'later-sentinel'].map(id => db.sessions.get(id)))).every(r => !r.deleted_at)
  }), true)
  console.log('PASS command rebuild opens preview without removing started or later work')

  await page.goto(`${base}/#/focus`)
  await page.getByLabel('Course', { exact: true }).selectOption('syllabus-course')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: /Interrupted/ }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await page.evaluate(() => JSON.parse(localStorage.getItem('semester-desk:focus-run')))
  assert.equal(paused.paused, true)
  await page.reload()
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Course', { exact: true }).inputValue(), 'syllabus-course')
  assert.match(await page.getByRole('button', { name: /Interrupted/ }).innerText(), /1/)
  console.log('PASS paused timer, selected course and interruptions survive reload without running')

  await page.goto(`${base}/#/courses/syllabus-course`)
  const source = 'Unit 1: Algebra\nMatrices\nDeterminants\nUnit 2: Calculus\nDifferentiation'
  await page.getByRole('button', { name: 'Import syllabus', exact: true }).click()
  await page.getByLabel('Source title', { exact: true }).fill('My syllabus')
  await page.getByLabel('Syllabus text', { exact: true }).fill(source)
  await page.getByRole('button', { name: 'Preview topics', exact: true }).click()
  await page.getByRole('dialog', { name: 'Review syllabus topics' }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Syllabus preview fits mobile width')
  assert.equal(await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    return db.topics.where('course_id').equals('syllabus-course').count()
  }), 0, 'Preview must not commit anything')
  await page.getByLabel('Topic 2', { exact: true }).fill('Determinants and inverses')
  await page.getByRole('checkbox', { name: 'Include topic 3', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Import 2 topics', exact: true }).click()
  await page.getByRole('dialog', { name: 'Review syllabus topics' }).waitFor({ state: 'hidden' })
  const saved = await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    return { topics: await db.topics.where('course_id').equals('syllabus-course').toArray(), docs: await db.course_documents.where('course_id').equals('syllabus-course').toArray() }
  })
  saved.topics.sort((a, b) => a.order_index - b.order_index)
  assert.equal(saved.topics.length, 2)
  assert.equal(saved.topics[1].name, 'Determinants and inverses')
  assert.equal(saved.topics[0].unit_title, 'Unit 1: Algebra')
  assert.equal(saved.docs[0].body_text, source)
  await page.reload()
  await page.getByRole('button', { name: 'View syllabus: My syllabus', exact: true }).click()
  assert.equal(await page.getByRole('dialog', { name: 'My syllabus', exact: true }).locator('pre').innerText(), source)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  console.log('PASS syllabus preview, editable selection, unit/source preservation and saved source reopening')

  await page.goto(`${base}/#/timetable`)
  await page.getByRole('button', { name: 'Scan Document', exact: true }).click()
  await page.getByText('Image AI is unavailable.', { exact: false }).waitFor()
  assert.equal(await page.getByLabel('Choose document image').isDisabled(), true)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  imageReady = true
  const rows = [{ title: 'SYN101 lab', type: 'class', classKind: 'lab', dayOfWeek: 0, startTime: '07:00', endTime: '08:00', location: 'Lab A' }]
  await page.route('**/api/scan-document', route => route.fulfill({ json: { result: rows } }))
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Scan Document', exact: true }).click()
    await page.getByLabel('Choose document image').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') })
    await page.getByRole('button', { name: 'Scan image', exact: true }).click()
    await page.getByLabel('Course 1', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Course 1', { exact: true }).inputValue(), 'syllabus-course')
    assert.equal(await page.getByLabel('Class type 1', { exact: true }).inputValue(), 'lab')
    await page.getByRole('button', { name: 'Import 1 items', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  assert.equal(await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    return db.timetable_slots.where('course_id').equals('syllabus-course').count()
  }), 1)
  console.log('PASS scanner readiness, reviewed course/lab mapping and duplicate-safe repeated import')
  connectorHealth = true
  await page.goto(`${base}/#/settings`)
  await page.getByLabel('AI server address', { exact: true }).fill(base)
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click()
  await page.getByText('This is the ChatGPT text connector.', { exact: false }).waitFor()
  console.log('PASS AI settings cannot mistake the text connector for an image backend')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
