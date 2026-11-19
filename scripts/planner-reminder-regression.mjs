import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

const bundlePath = new URL('../node_modules/.planner-reminder-regression.cjs', import.meta.url)
const bundled = await build({
  stdin: { contents: "export { buildSchedule, briefFor } from './src/lib/notify'; export { defaultProfile } from './src/db/mutate'", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
})
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { buildSchedule, defaultProfile } = createRequire(import.meta.url)(bundlePath.pathname.replace(/^\/(?=[A-Za-z]:)/, ''))
const base = { user_id: null, updated_at: '2026-09-01T00:00:00Z', deleted_at: null }
const course = { ...base, id: 'course', code: 'CS101', archived: false }
const slot = { ...base, id: 'slot', course_id: course.id, weekday: 2, start: '09:00', end: '10:00', room: '', kind: 'lecture' }
const exception = { ...base, id: 'change', date: '2026-09-01', slot_id: slot.id, kind: 'cancelled', new_start: null, new_end: null, note: '' }
const input = { profile: { ...defaultProfile(), term_start: '2026-08-01', term_end: '2026-09-30', quiet_hours: ['22:00', '07:00'], notify: { morning: true, attendance: true, deadline: true, review: false } }, courses: [course], slots: [slot], tasks: [], sessions: [], cards: [], attendance: [], now: new Date(2026, 8, 1, 6), days: 1 }
let failed = 0
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`) }
}
const brief = schedule => schedule.find(n => n.kind === 'morning')?.body
const nudges = schedule => schedule.filter(n => n.kind === 'attendance')
check('whole-day holiday changes the morning brief and attendance prompts', () => {
  const schedule = buildSchedule({ ...input, holidays: new Set(['2026-09-01']) })
  assert.match(brief(schedule), /^No classes today/)
  assert.equal(nudges(schedule).length, 0)
})
check('slot cancellation is respected by both reminder types', () => {
  const schedule = buildSchedule({ ...input, exceptions: [exception] })
  assert.match(brief(schedule), /^No classes today/)
  assert.equal(nudges(schedule).length, 0)
})
check('moved classes use their effective times even on a different weekday', () => {
  const schedule = buildSchedule({ ...input, slots: [{ ...slot, weekday: 3 }], exceptions: [{ ...exception, kind: 'moved', new_start: '13:00', new_end: '14:30' }] })
  assert.match(brief(schedule), /from 13:00/)
  assert.equal(nudges(schedule)[0].at.getHours(), 14)
  assert.equal(nudges(schedule)[0].at.getMinutes(), 35)
})
check('archived course work cannot appear in reminders', () => {
  const schedule = buildSchedule({ ...input, courses: [{ ...course, archived: true }], tasks: [{ ...base, id: 'task', course_id: course.id, title: 'Archived task', status: 'todo', due_at: new Date(2026, 8, 2, 16).toISOString(), weight_pct: 50, est_minutes: 60 }], days: 2 })
  assert.match(brief(schedule), /^No classes today/)
  assert.equal(nudges(schedule).length, 0)
  assert.equal(schedule.some(n => n.kind === 'deadline'), false)
  assert.doesNotMatch(brief(schedule), /Archived task/)
})
check('recurring class reminders stop outside the configured term', () => {
  const schedule = buildSchedule({ ...input, profile: { ...input.profile, term_end: '2026-08-31' } })
  assert.match(brief(schedule), /^No classes today/)
  assert.equal(nudges(schedule).length, 0)
})
check('a slot-specific holiday does not suppress other classes', () => {
  const schedule = buildSchedule({ ...input, slots: [slot, { ...slot, id: 'other', start: '11:00', end: '12:00' }], exceptions: [{ ...exception, kind: 'holiday' }] })
  assert.match(brief(schedule), /^1 class from 11:00/)
  assert.equal(nudges(schedule).length, 1)
  assert.equal(nudges(schedule)[0].at.getHours(), 12)
})
process.exitCode = failed ? 1 : 0
