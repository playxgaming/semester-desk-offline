import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

// Open a real pre-cleanup database, then upgrade it in an isolated browser.
const legacy = readFileSync('src/db/db.ts', 'utf8')
  .replace('this.version(3).stores({ outbox: null, sync_cursors: null })', '')
  .replace("this.version(4).stores({ course_documents: 'id, course_id, updated_at, deleted_at' })", '')
  .replace("this.version(5).stores({ quiz_attempts: 'id, course_id, started_at, completed_at, deleted_at' })", '')
  .replace("this.version(6).stores({ quality_reviews: 'id, target_type, target_id, reviewed_at, deleted_at' })", '')
const bundled = await build({
  stdin: { contents: `export { db, DATA_TABLES } from './src/db/db'; export { db as old } from 'legacy-db';
    export * from './src/db/mutate'; export * from './src/db/study';
    export * from './src/db/attendance'; export * from './src/db/history';`, resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false,
  plugins: [{ name: 'legacy-db', setup(b) {
    b.onResolve({ filter: /^legacy-db$/ }, () => ({ path: 'legacy-db', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: legacy, loader: 'ts', resolveDir: process.cwd() }))
  } }],
})
const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('http://localhost/local-regression', route => route.fulfill({ body: '<title>Isolated local database checks</title>', contentType: 'text/html' }))
  await page.goto('http://localhost/local-regression')
  await page.addScriptTag({ content: bundled.outputFiles[0].text })
  const results = await page.evaluate(async () => {
    const { db, old, recordReview, recordFocus, saveNote, setSlotAttendance, patch, saveProfile, slotsOnDate } = Probe
    const check = (v, message) => { if (!v) throw new Error(message) }
    const checks = []
    const base = { user_id: null, updated_at: '2026-11-16T00:00:00.000Z', deleted_at: null }
    const card = { ...base, id: 'card', course_id: null, topic_id: null, front: 'Q', back: 'A', ease: 2.5, interval: 1, reps: 1, lapses: 0, due_at: base.updated_at, suspended: false, is_formula: false }
    await old.cards.put(card)
    await old.notes.put({ ...base, id: 'note', course_id: null, topic_id: null, title: 'Original', body_md: 'Original body', pinned: false })
    await old.blobs.put({ id: 'file', data: new Blob(['offline file']) })
    await old.outbox.add({ table: 'cards', row_id: 'card', payload: card, op: 'put', at: base.updated_at, tries: 0, last_error: null })
    old.close()
    await db.open()
    check((await db.cards.get('card')).back === 'A', 'Upgrade must retain existing cards')
    check(await (await db.blobs.get('file')).data.text() === 'offline file', 'Upgrade must retain file bytes')
    check(!db.tables.some(t => ['outbox', 'sync_cursors'].includes(t.name)), 'Retired transport stores must be absent')
    check(db.verno === 6 && db.tables.some(t => t.name === 'quality_reviews'), 'Quality-review store must be added on upgrade')
    checks.push('v2-to-v6 upgrade preserves real records/files and removes transport stores')

    const failedReview = () => { throw new Error('Injected review storage failure') }
    db.reviews.hook('creating', failedReview)
    await recordReview('card', 2).then(() => { throw new Error('Failure was not propagated') }, () => {})
    db.reviews.hook('creating').unsubscribe(failedReview)
    check((await db.cards.get('card')).reps === 1 && await db.reviews.count() === 0, 'Failed review must roll back card changes')
    await recordReview('card', 2)
    check((await db.cards.get('card')).reps === 2 && await db.reviews.count() === 1, 'Review retry must save both')
    checks.push('review rollback and successful retry')

    await db.sessions.put({ ...base, id: 'block', course_id: null, topic_id: null, task_id: null, date: '2026-11-16', kind: 'study', planned_min: 25, actual_min: 0, status: 'planned', auto: true })
    const focus = { ...base, id: 'focus:fixed', course_id: null, task_id: null, started: base.updated_at, ended: '2026-11-16T00:25:00.000Z', minutes: 25, interruptions: 0 }
    const failedCredit = () => { throw new Error('Injected plan credit failure') }
    db.sessions.hook('updating', failedCredit)
    await recordFocus(focus).then(() => { throw new Error('Failure was not propagated') }, () => {})
    db.sessions.hook('updating').unsubscribe(failedCredit)
    check(await db.focus_sessions.count() === 0 && (await db.sessions.get('block')).actual_min === 0, 'Focus failure must roll back both stores')
    await Promise.all([recordFocus(focus), recordFocus(focus)])
    check(await db.focus_sessions.count() === 1 && (await db.sessions.get('block')).actual_min === 25, 'Focus recovery must not double count')
    checks.push('focus rollback and concurrent retry without duplicate credit')

    const failedNote = () => { throw new Error('Injected note save failure') }
    db.notes.hook('updating', failedNote)
    await saveNote('note', { title: 'Edited', body_md: 'Edited body' }).then(() => { throw new Error('Failure was not propagated') }, () => {})
    db.notes.hook('updating').unsubscribe(failedNote)
    check(await db.note_versions.count() === 0 && (await db.notes.get('note')).body_md === 'Original body', 'Failed note save must roll back history')
    checks.push('note/history rollback')
    await Promise.all([patch('cards', 'card', { front: 'Edited Q' }), patch('cards', 'card', { back: 'Edited A' })])
    check((await db.cards.get('card')).front === 'Edited Q' && (await db.cards.get('card')).back === 'Edited A', 'Concurrent patches must preserve both fields')
    await Promise.all([saveProfile({ name: 'Student' }), saveProfile({ institution: 'College' })])
    check((await db.profiles.get('me')).name === 'Student' && (await db.profiles.get('me')).institution === 'College', 'Concurrent profile saves must preserve both fields')
    await Promise.all([setSlotAttendance('course', '2026-11-16', 'slot', 'present', []), setSlotAttendance('course', '2026-11-16', 'slot', 'absent', [])])
    check((await db.attendance.toArray()).filter(r => !r.deleted_at).length === 1, 'Stale UI attendance saves must not duplicate the same class')
    checks.push('concurrent row/profile edits and attendance saves remain consistent')
    const slot = { ...base, id: 'slot', course_id: 'course', weekday: 1, start: '09:00', end: '10:00', room: '', kind: 'lecture' }
    check(slotsOnDate([slot], '2026-11-16', [], { term_start: '2026-07-01', term_end: '2026-11-15' }).length === 0, 'Recurring classes must stop at term end')
    checks.push('class recurrence respects term bounds')
    db.close()
    return checks
  })
  assert.equal(results.length, 6)
  for (const result of results) console.log(`PASS ${result}`)
  await context.close()
} finally { await browser.close() }
