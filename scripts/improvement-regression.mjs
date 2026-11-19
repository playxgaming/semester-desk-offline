import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: { contents: `export { db } from './src/db/db'; export * from './src/db/mutate';
    export * from './src/db/applications'; export * from './src/db/scanner';
    export * from './src/db/syllabus'; export * from './src/lib/syllabus';
    export * from './src/db/history';
    export * from './src/lib/quiz'; export * from './src/lib/money';
    export * from './src/lib/backup'; export { applySchedule } from './src/lib/notify';`, resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false,
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'native-alarm-fixture', setup(b) {
    b.onResolve({ filter: /^@capacitor\/local-notifications$/ }, () => ({ path: 'alarms', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const LocalNotifications = globalThis.MockAlarms', loader: 'js' }))
  } }],
})
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('http://localhost/improvement-check', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated improvement checks</title>' }))
  await page.goto('http://localhost/improvement-check')
  await page.evaluate(() => {
    globalThis.Capacitor = { isNativePlatform: () => true }
    globalThis.alarmState = { rows: [{ id: 123, title: 'Previous alarm' }], fail: false, order: [] }
    globalThis.MockAlarms = {
      getPending: async () => ({ notifications: alarmState.rows }),
      schedule: async ({ notifications }) => {
        alarmState.order.push('schedule')
        if (alarmState.fail) throw new Error('Injected native failure')
        const rows = new Map(alarmState.rows.map(n => [n.id, n]))
        notifications.forEach(n => rows.set(n.id, n)); alarmState.rows = [...rows.values()]
      },
      cancel: async ({ notifications }) => {
        alarmState.order.push('cancel')
        alarmState.rows = alarmState.rows.filter(n => !notifications.some(x => x.id === n.id))
      },
    }
  })
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  // Export helpers now initialise the real Capacitor module. Apply the native
  // alarm fixture after that initialisation, before invoking the scheduling API.
  await page.evaluate(() => { globalThis.Capacitor.isNativePlatform = () => true })
  const results = await page.evaluate(async () => {
    const { db, put, defaultProfile, buildQuiz, advanceRecurring, importScan, undoScanImport, matchScanCourse, parseSyllabus, importSyllabus, undoSyllabus, saveApplication, moveApplication, applySchedule, exportJson, importJson, writeNoteDraft, saveNote } = Probe
    const check = (v, message) => { if (!v) throw new Error(message) }
    const reject = async (fn, message) => { let failed = false; try { await fn() } catch { failed = true } check(failed, message) }
    const base = { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }
    const results = []
    const cards = ['**same answer**', 'same answer', 'different answer', 'fourth answer'].map((back, i) => ({ ...base, id: `c${i}`, course_id: null, topic_id: null, front: `Question ${i}`, back, ease: 2.5, interval: 0, reps: 0, lapses: 0, suspended: false, is_formula: false, due_at: base.updated_at }))
    const quiz = buildQuiz({ cards, reviews: [], topics: [], seed: 123, length: 4 })
    check(quiz.every(q => q.kind === 'recall' || new Set(q.options).size === q.options.length), 'Every visible quiz answer must be unique')
    results.push('quiz excludes formatting-equivalent correct answers from distractors')

    let bill = { ...base, id: 'bill', name: 'Rent', cadence: 'monthly', amount: 5000, next_at: '2027-01-31T09:00:00Z', anchor_at: '2027-01-31T09:00:00Z' }
    bill.next_at = advanceRecurring(bill, new Date('2027-01-01'))
    check(bill.next_at.startsWith('2027-02-28'), 'Short month must clamp')
    bill.next_at = advanceRecurring(bill, new Date('2027-02-01'))
    check(bill.next_at.startsWith('2027-03-31'), 'Original month anchor must recover after February')
    results.push('recurrence retains January 31 anchor through February')

    const course = { ...base, id: 'course', code: 'CS101', name: 'Computer Science', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' }
    await put('courses', course)
    check(matchScanCourse('Unrelated class', [{ ...course, id: 'empty', name: '' }, course]) === '', 'Empty names must not match')
    check(matchScanCourse('CS101 lab', [course, { ...course, id: 'prefix', code: 'CS1' }]) === 'course', 'Match a whole course code')
    const item = { title: 'CS101 lab', type: 'class', date: '', startTime: '09:00', endTime: '11:00', dayOfWeek: '1', location: 'Lab', course: 'course', selected: true, classKind: 'lab' }
    const imported = await importScan([item, item])
    check(imported.imported.length === 1 && imported.skipped === 1, 'Duplicate rows inside a batch are skipped')
    check((await importScan([item])).skipped === 1 && await db.timetable_slots.count() === 1, 'Repeated import must not duplicate classes')
    const deadline = { ...item, type: 'deadline', title: 'Work', date: '2027-01-15', startTime: '12:00' }
    await reject(() => importScan([deadline, { ...item, startTime: '10:00', endTime: '12:00' }]), 'Conflicting timetable must reject')
    check(await db.tasks.count() === 0, 'A late conflict rolls back earlier imported tasks')
    await undoScanImport(imported.imported)
    check((await db.timetable_slots.toArray()).every(s => s.deleted_at), 'Whole-import Undo preserves soft-delete semantics')
    results.push('course matching, lab kind, duplicate/overlap checks, rollback and import Undo')

    const application = { ...base, id: 'app', org: 'College', role: 'Intern', kind: 'internship', stage: 'sourced', deadline: null, link: '', note: '', resume_version_id: null, sop_status: 'none', lor_status: 'none' }
    await saveApplication(application)
    const failEvent = () => { throw new Error('Injected event failure') }
    db.application_events.hook('creating', failEvent)
    await reject(() => saveApplication({ ...application, stage: 'applied' }), 'Event failure must reject stage save')
    db.application_events.hook('creating').unsubscribe(failEvent)
    check((await db.applications.get('app')).stage === 'sourced' && await db.application_events.count() === 0, 'Stage and history must both roll back')
    await moveApplication('app', 1)
    check((await db.applications.get('app')).stage === 'applied' && await db.application_events.count() === 1, 'Retry saves one consistent transition')
    results.push('application stage and timeline commit together or roll back')

    const source = 'Unit I: Algebra\n- Matrices\n- Determinants\nUnit II: Calculus\n- Differentiation'
    const drafts = parseSyllabus(source)
    check(drafts.length === 3 && drafts[0].unit === 'Unit I: Algebra', 'Outline retains units without inventing topics')
    const syllabus = await importSyllabus('course', 'Official outline', source, drafts)
    check(syllabus.added.length === 3, 'Reviewed topic count')
    const repeat = await importSyllabus('course', 'Official outline', source, drafts)
    check(repeat.added.length === 0 && repeat.skipped === 3 && await db.course_documents.count() === 1, 'Repeat import retains one source and topic set')
    let failedImportEvents = 0
    const observeFailedImport = () => { failedImportEvents++ }
    window.addEventListener('semester-desk:data-changed', observeFailedImport)
    const failTopic = () => { throw new Error('Injected topic failure') }
    db.topics.hook('creating', failTopic)
    await reject(() => importSyllabus('course', 'Failed outline', 'Unit 3\nNew topic', parseSyllabus('Unit 3\nNew topic')), 'Topic failure must reject')
    db.topics.hook('creating').unsubscribe(failTopic)
    window.removeEventListener('semester-desk:data-changed', observeFailedImport)
    check(failedImportEvents === 0, 'A rolled-back import must not publish committed data events')
    check(await db.course_documents.count() === 1 && await db.topics.count() === 3, 'Failed import must not leave a source or partial topics')
    await undoSyllabus(syllabus)
    check((await db.topics.toArray()).every(t => t.deleted_at), 'Syllabus Undo removes only imported topics')
    await importSyllabus('course', 'Official outline', source, drafts)
    results.push('reviewed syllabus units, source links, repeat import, rollback and Undo')

    const pdfFile = new File(['%PDF-1.4 synthetic preserved source bytes'], 'original.pdf', { type: 'application/pdf' })
    const pdfSource = { file: pdfFile, pages: [{ number: 2, text: 'Unit 2\nIntegration' }] }
    const pdfImport = await importSyllabus('course', 'PDF source', 'Unit 2\nIntegration', parseSyllabus('Unit 2\nIntegration'), pdfSource)
    const pdfDocument = await db.course_documents.get(pdfImport.documentId)
    const pdfAttachment = await db.attachments.get(pdfDocument.attachment_id)
    check(await (await db.blobs.get(pdfAttachment.storage_path.slice(6))).data.text() === await pdfFile.text(), 'Original PDF bytes must be kept')
    const pdfFail = (_key, row) => { if (row.name === 'Failure topic') throw new Error('Injected topic failure') }
    db.topics.hook('creating', pdfFail)
    const counts = await Promise.all([db.attachments.count(), db.blobs.count(), db.course_documents.count()])
    try { await reject(() => importSyllabus('course', 'Fail PDF', 'Failure topic', parseSyllabus('Failure topic'), pdfSource), 'PDF import failure must propagate') }
    finally { db.topics.hook('creating').unsubscribe(pdfFail) }
    check(JSON.stringify(counts) === JSON.stringify(await Promise.all([db.attachments.count(), db.blobs.count(), db.course_documents.count()])), 'Failed PDF import leaves no source or bytes')
    const undoPdf = await importSyllabus('course', 'Undo PDF', 'Undo example', parseSyllabus('Undo example'), pdfSource)
    await undoSyllabus(undoPdf)
    check((await db.attachments.get(undoPdf.attachmentId)).deleted_at, 'PDF import Undo tombstones its original attachment')
    results.push('PDF source bytes, selected pages and atomic rollback')

    await put('notes', { ...base, id: 'draft-note', title: 'Published title', body_md: 'Published body', course_id: 'course', topic_id: null, pinned: false })
    await writeNoteDraft('draft-note', 'Draft title', 'First edit')
    check((await db.notes.get('draft-note')).body_md === 'Published body', 'Recovery draft does not overwrite published body')
    await writeNoteDraft('draft-note', 'Draft title', 'Newer edit')
    await saveNote('draft-note', { title: 'Draft title', body_md: 'First edit' })
    check((await db.notes.get('draft-note')).local_draft.body_md === 'Newer edit', 'Earlier Save must retain newer draft')
    results.push('persistent note drafts preserve published content and survive stale saves')

    await put('profiles', defaultProfile())
    const backup = await exportJson()
    await db.transaction('rw', db.tables, () => Promise.all(db.tables.map(t => t.clear())))
    await importJson(JSON.stringify(backup))
    const doc = (await db.course_documents.toArray()).find(d => !d.deleted_at && d.body_text === source)
    check(doc.body_text === source && (await db.topics.toArray()).some(t => !t.deleted_at && t.source_document_id === doc.id), 'Fresh restore must preserve source and topic links')
    const restoredPdf = await db.course_documents.get(pdfImport.documentId)
    const restoredAttachment = await db.attachments.get(restoredPdf.attachment_id)
    check(restoredPdf.pages[0].number === 2 && await (await db.blobs.get(restoredAttachment.storage_path.slice(6))).data.text() === await pdfFile.text(), 'Backup must restore exact PDF bytes and selected page provenance')
    check((await db.notes.get('draft-note')).local_draft.body_md === 'Newer edit', 'Complete backup must include recovery drafts')
    results.push('complete backup restores new source records and topic provenance')

    const planned = [{ id: 'new', title: 'Replacement', body: 'Check', kind: 'deadline', at: new Date(Date.now() + 60_000) }]
    alarmState.fail = true
    await reject(() => applySchedule(planned), 'Native scheduling failure must propagate')
    check(alarmState.rows.length === 1 && alarmState.rows[0].id === 123 && !alarmState.order.includes('cancel'), 'Failed replacement must keep previous alarms')
    alarmState.fail = false; alarmState.order = []
    await applySchedule(planned)
    check(alarmState.order.join(',') === 'schedule,cancel' && alarmState.rows.length === 1 && alarmState.rows[0].title === 'Replacement', 'New schedule accepted before obsolete IDs removed')
    results.push('native schedule failure preserves old alarms; accepted replacements precede cleanup')
    return results
  })
  assert.equal(results.length, 9)
  for (const result of results) console.log(`PASS ${result}`)
} finally { await browser.close() }
