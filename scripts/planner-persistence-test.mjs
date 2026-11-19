import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  // A fresh temporary browser profile; never uses an installed app's records.
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor()
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    const { replacePlanWindow } = await import('/src/lib/scheduler.ts')
    const base = { user_id: null, updated_at: '2026-11-16T00:00:00Z', deleted_at: null, course_id: null, topic_id: null, task_id: null, kind: 'study', planned_min: 45, actual_min: 0, status: 'planned', auto: true }
    const row = (id, date, extra = {}) => ({ ...base, id, date, ...extra })
    await db.sessions.clear()
    await db.sessions.bulkPut([
      row('inside', '2026-11-16'), row('later', '2026-11-24'), row('before', '2026-11-15'),
      row('manual', '2026-11-17', { auto: false }), row('started', '2026-11-18', { actual_min: 10 }),
      row('done', '2026-11-19', { status: 'done', actual_min: 45 }),
    ])
    await replacePlanWindow('2026-11-16', '2026-11-22', [row('replacement', '2026-11-16')])
    const first = await db.sessions.toArray()
    // Throw during creation after the old rows have been tombstoned, testing
    // IndexedDB rollback of the real multi-write transaction.
    const fail = function(_key, record) { if (record.id === 'fail') throw new Error('Injected storage failure') }
    db.sessions.hook('creating', fail)
    let rejected = false
    try { await replacePlanWindow('2026-11-16', '2026-11-22', [row('fail', '2026-11-16')]) }
    catch { rejected = true }
    finally { db.sessions.hook('creating').unsubscribe(fail) }
    const afterFailure = await db.sessions.toArray()
    let outsideRejected = false
    try { await replacePlanWindow('2026-11-16', '2026-11-22', [row('outside', '2026-11-23')]) }
    catch { outsideRejected = true }
    return { first, afterFailure, rejected, outsideRejected }
  })
  const byId = new Map(result.first.map(row => [row.id, row]))
  assert.ok(byId.get('inside').deleted_at)
  for (const id of ['before', 'later', 'manual', 'started', 'done', 'replacement']) assert.equal(byId.get(id).deleted_at, null, `${id} must survive`)
  assert.equal(result.rejected, true)
  assert.deepEqual(result.afterFailure, result.first, 'an interrupted replacement must roll back every write')
  assert.equal(result.outsideRejected, true)
  console.log('PASS plan replacement preserves manual/started/completed and out-of-window blocks; real IndexedDB transaction rolls back injected failure')
  await context.close()
} finally { await browser.close() }
