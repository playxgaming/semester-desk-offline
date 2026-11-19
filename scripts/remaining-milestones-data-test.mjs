import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { db } from './src/db/db'; export * from './src/db/mutate'; export * from './src/db/quizzes'; export * from './src/db/library'; export * from './src/db/scanner'; export * from './src/db/attendance'; export * from './src/db/applications'; export * from './src/db/documents'; export * from './src/lib/planner'; export * from './src/lib/availability'; export * from './src/lib/timetableImport'; export * from './src/lib/backup'; export { replacePlanWindow } from './src/lib/scheduler';` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false, define: { 'import.meta.env': '{}' } })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ timezoneId: 'Asia/Kolkata' })
  await page.route('http://localhost/milestone-check', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated milestone data checks</title>' }))
  await page.goto('http://localhost/milestone-check'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const results = await page.evaluate(async () => {
    const { db, put, stamp, remove, defaultProfile, importScan, slotsOnDate, parseTimetableLines, scanConflictMessages, buildPlan, catchUp, startQuiz, progressQuiz, planQuizRevision, saveApplication, searchLibrary, restoreLibraryRow, exportJson, importJson, previewBackup, replacePlanWindow, saveReference } = Probe
    const check = (v, m) => { if (!v) throw new Error(m) }, results = []
    const reject = async (fn, m) => { let failed = false; try { await fn() } catch { failed = true } check(failed, m) }
    const base = { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }
    const course = await put('courses', stamp({ id: 'course', code: 'MATH101', name: 'Algebra', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' }))
    await put('topics', stamp({ id: 'topic', course_id: 'course', name: 'Matrices', order_index: 0, confidence: 0, est_minutes: 60, exam_critical: false }))
    const row = { title: 'Algebra A', type: 'class', date: '', startTime: '08:30', endTime: '09:00', dayOfWeek: '1', location: 'R1', course: 'course', selected: true, classKind: 'lab', section: 'CSE-A', weekPattern: 'a', weekAnchor: '2030-01-07' }
    await importScan([row, { ...row, title: 'Algebra B', weekPattern: 'b' }])
    const savedSlots = await db.timetable_slots.toArray()
    check(savedSlots.length === 2, 'Complementary teaching weeks may share a time')
    check(slotsOnDate(savedSlots, '2030-01-07').length === 1 && slotsOnDate(savedSlots, '2030-01-14').length === 1, 'Each week resolves exactly one alternating class')
    check(slotsOnDate(savedSlots, '2030-01-07')[0].week_pattern === 'a' && slotsOnDate(savedSlots, '2030-01-14')[0].week_pattern === 'b', 'Week identity must alternate')
    await reject(() => importScan([{ ...row, title: 'Overlap', startTime: '08:45', endTime: '09:15' }]), 'Same-week overlap must reject')
    check(scanConflictMessages([{ ...row, startTime: '08:45', endTime: '09:15' }], savedSlots).size === 1, 'Conflicts must be visible before import')
    check(parseTimetableLines('Mon 09:00-10:00 MATH101\nambiguous grid text', [course]).length === 1, 'Local timetable parser only proposes supported lines')
    results.push('timetable parsing, conflict preview, sections, alternating weeks and duplicate-safe import')

    const date = '2030-01-07', now = new Date(date + 'T07:00:00')
    const task = { ...base, id: 'early-task', course_id: 'course', title: 'Early exam', type: 'exam', due_at: new Date(date + 'T08:20:00').toISOString(), weight_pct: 50, est_minutes: 60, status: 'todo', notes: '' }
    const fixed = { ...base, id: 'manual', course_id: 'course', topic_id: null, task_id: null, date, kind: 'study', planned_min: 30, actual_min: 0, status: 'planned', auto: false, starts_at: new Date(date + 'T09:30:00').toISOString(), ends_at: new Date(date + 'T10:00:00').toISOString() }
    const input = { from: date, days: 1, capacityMin: 180, courses: [course], topics: [], tasks: [task], slots: savedSlots, existing: [fixed], now, studyWindows: [{ weekday: 1, start: '08:00', end: '11:00' }] }
    const plan = buildPlan(input)
    check(plan.sessions.length === 1 && plan.sessions[0].planned_min === 20 && new Date(plan.sessions[0].ends_at) <= new Date(task.due_at), 'Timed work finishes before an early exact deadline')
    check(plan.diagnostics.shortfallMin === 40, 'Unplaceable minutes must remain visible')
    check(buildPlan({ ...input, studyWindows: [] }).sessions.length === 0, 'Empty windows must place no timed work')
    const free = buildPlan({ ...input, tasks: [], existing: [fixed] })
    const moved = catchUp([{ ...fixed, id: 'missed', task_id: 'early-task', date: '2030-01-06', planned_min: 30 }], free.days, new Map([['early-task', task.due_at]]))
    check(moved.moved.length === 0 && moved.dropped.length === 1, 'Catch-up cannot cross the exact deadline')
    await put('profiles', { ...defaultProfile(), study_windows: input.studyWindows, term_start: '2030-01-01', term_end: '2030-12-31', email: 'student@example.test' })
    await put('tasks', task); await put('sessions', fixed)
    await put('courses', { ...course, id: 'archived-course', code: 'OLD', archived: true })
    await put('timetable_slots', { ...savedSlots[0], id: 'archived-class', course_id: 'archived-course', start: '08:00', end: '09:00', week_pattern: 'all' })
    await put('sessions', { ...fixed, id: 'concurrent', starts_at: plan.sessions[0].starts_at, ends_at: plan.sessions[0].ends_at })
    await reject(() => replacePlanWindow(date, date, plan.sessions), 'A concurrent fixed block must reject stale preview atomically')
    check(!await db.sessions.get(plan.sessions[0].id), 'Rejected preview must leave no new session')
    await remove('sessions', 'concurrent'); await replacePlanWindow(date, date, plan.sessions)
    results.push('timed windows, exact deadline allocation/catch-up and stale-preview conflict rollback')

    const card = { ...base, id: 'card', course_id: 'course', topic_id: 'topic', front: 'Define a matrix', back: 'A rectangular array of numbers.', ease: 2.5, interval: 0, reps: 0, due_at: now.toISOString(), lapses: 0, suspended: false, is_formula: false }
    const question = { id: 'q1', card, kind: 'recall', prompt: card.front, options: [], answerIndex: -1, topicId: 'topic' }
    const attempt = await startQuiz([question], 'course')
    await progressQuiz(attempt.id, { q1: false }, 0)
    check((await db.quiz_attempts.get(attempt.id)).answers.q1 === false, 'In-progress answer survives DB reload')
    await progressQuiz(attempt.id, { q1: false }, 1)
    const revisionDate = '2030-01-08'
    check(await planQuizRevision(attempt.id, revisionDate) === 1 && await planQuizRevision(attempt.id, revisionDate) === 0, 'Student-approved revision is retry safe')
    results.push('persisted quiz answers/completion and student-approved duplicate-safe revision blocks')

    await put('resume_items', { ...base, id: 'cv-item', kind: 'project', title: 'Original project', org: 'Lab', start: null, end: null, bullets: ['Original achievement'] })
    await put('resume_versions', { ...base, id: 'cv', name: 'CV sent', target_role: 'Intern', item_ids: ['cv-item'] })
    const application = { ...base, id: 'application', org: 'Test org', role: 'Intern', kind: 'internship', stage: 'applied', deadline: null, link: '', note: '', resume_version_id: 'cv', sop_status: 'none', lor_status: 'none' }
    await saveApplication(application)
    await db.resume_items.update('cv-item', { title: 'Later project', bullets: ['Edited achievement'] })
    await saveApplication({ ...application, stage: 'interview' })
    const captured = (await db.applications.get('application')).submitted_resume
    check(captured.items[0].title === 'Original project' && captured.items[0].bullets[0] === 'Original achievement' && captured.profile.email === 'student@example.test', 'Submitted CV snapshot must survive later edits')
    await reject(() => saveApplication({ ...application, resume_version_id: null }), 'Frozen CV link cannot silently change')
    results.push('immutable application CV snapshots include contact data and survive source edits')

    await put('notes', { ...base, id: 'find-note', course_id: 'course', topic_id: null, title: 'Search example', body_md: 'A unique needle in the body', pinned: false })
    check((await searchLibrary('unique needle')).some(hit => hit.row.id === 'find-note'), 'Search must inspect full content')
    await remove('notes', 'find-note'); await remove('courses', 'course')
    await reject(() => restoreLibraryRow('notes', 'find-note'), 'Parent must be restored before a dependent note')
    await restoreLibraryRow('courses', 'course'); await restoreLibraryRow('notes', 'find-note')
    check(!(await db.notes.get('find-note')).deleted_at, 'Trash restores a note without a new ID')
    const image = new File(['synthetic-original-image'], 'scan.png', { type: 'image/png' })
    const doc = await saveReference('course', 'OCR reference', 'Recognized course material to review.', { file: image, pages: [{ number: 1, text: 'Recognized course material to review.' }], extraction: 'ocr' })
    check(doc.extraction === 'ocr' && doc.original_type === 'image/png', 'OCR source provenance and media type retained')
    await remove('attachments', doc.attachment_id); await remove('courses', 'course')
    await reject(() => restoreLibraryRow('attachments', doc.attachment_id), 'File metadata cannot restore ahead of its parent course')
    await restoreLibraryRow('courses', 'course'); await restoreLibraryRow('attachments', doc.attachment_id)
    results.push('full-content search, parent-safe Trash restore and OCR source metadata')

    const backup = await exportJson()
    const preview = await previewBackup(JSON.stringify(backup))
    check(preview.conflicts.length > 0 && preview.total > 0, 'Backup preview must report matching record IDs without writing')
    await db.notes.update('find-note', { body_md: 'Device edits to preserve', updated_at: '2099-01-01T00:00:00Z' })
    await reject(() => importJson(JSON.stringify(backup), { expected: preview.expected }), 'Device changes after preview must reject before writes')
    const kept = await importJson(JSON.stringify(backup), { keepExisting: true })
    check(kept.skipped > 0 && (await db.notes.get('find-note')).body_md === 'Device edits to preserve', 'Keep-device import must preserve matching records and bytes')
    results.push('backup conflict preview makes no writes, detects intervening edits and preserves device records in keep mode')
    await db.transaction('rw', db.tables, () => Promise.all(db.tables.map(t => t.clear())))
    await importJson(JSON.stringify(backup))
    check((await db.quiz_attempts.get(attempt.id)).completed_at && (await db.profiles.get('me')).study_windows[0].start === '08:00', 'Backup restores quiz history and study hours')
    check((await db.applications.get('application')).submitted_resume.items[0].title === 'Original project' && (await db.course_documents.get(doc.id)).extraction === 'ocr', 'Backup restores immutable CV and OCR metadata')
    const invalid = structuredClone(backup); invalid.tables.quiz_attempts[0].questions[0].options = ['Bad']; invalid.tables.quiz_attempts[0].questions[0].kind = 'choice'; invalid.tables.quiz_attempts[0].questions[0].answerIndex = 99
    await reject(() => importJson(JSON.stringify(invalid)), 'Invalid quiz snapshots reject before import')
    results.push('complete backup roundtrip covers quiz history, timed plans, CV snapshots and OCR sources; malformed quiz rejects')
    return results
  })
  assert.equal(results.length, 7); results.forEach(result => console.log(`PASS ${result}`))
} finally { await browser.close() }
