// Read-only probes of production logic. No app records or external services are used.
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const bundlePath = new URL('../node_modules/.ecc-audit-probe.cjs', import.meta.url)
const bundled = await build({
  stdin: { contents: `
    export { renderMarkdown } from './src/lib/markdown';
    export { buildSchedule } from './src/lib/notify';
    export { defaultProfile } from './src/db/mutate';
    export { slotsOnDate } from './src/db/attendance';
  `, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
})
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { renderMarkdown, buildSchedule, defaultProfile, slotsOnDate } = createRequire(import.meta.url)(bundlePath.pathname.replace(/^\/(?=[A-Za-z]:)/, ''))
const results = []
for (const text of ['@@M999@@', '@@C999@@']) {
  try { renderMarkdown(text); results.push({ probe: 'literal Markdown marker', text, crashed: false }) }
  catch (error) { results.push({ probe: 'literal Markdown marker', text, crashed: true, error: error.message }) }
}
const base = { user_id: null, updated_at: '2026-11-16T00:00:00Z', deleted_at: null }
const date = '2026-11-17'
const slot = { ...base, id: 'slot', course_id: 'course', weekday: new Date(`${date}T00:00:00`).getDay(), start: '09:00', end: '10:00', room: '', kind: 'lecture' }
const profile = { ...defaultProfile(), quiet_hours: ['22:00', '07:00'], brief_time: '07:00', notify: { morning: true, attendance: true, review: false, deadline: false } }
const schedule = buildSchedule({ profile, courses: [], slots: [slot], tasks: [], sessions: [], cards: [], attendance: [], holidays: new Set([date]), now: new Date(`${date}T00:00:00`), days: 1 })
results.push({ probe: 'holiday morning brief', text: schedule.find(n => n.kind === 'morning')?.body, attendanceNudges: schedule.filter(n => n.kind === 'attendance').length })
const outOfTerm = slotsOnDate([slot], date)
results.push({ probe: 'timetable term boundary', resolvedClasses: outOfTerm.length, note: 'slotsOnDate takes no term boundary input; caller must apply it.' })
console.log(JSON.stringify(results, null, 2))
