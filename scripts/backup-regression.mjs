import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

// An isolated origin and browser profile exercise real IndexedDB without seeding
// or modifying the user's app. BACKUP_BASELINE=1 demonstrates the original bug.
const baseline = process.env.BACKUP_BASELINE === '1'
const bundled = await build({
  stdin: { contents: `export * from './src/lib/backup'; export { db } from './src/db/db'; export { purgeOrphanBlobs } from './src/db/files';`, resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', globalName: 'BackupProbe', write: false,
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  plugins: baseline ? [{ name: 'baseline', setup(build) {
    build.onLoad({ filter: /src[\\/]lib[\\/]backup\.ts$/ }, () => ({ contents: execFileSync('git', ['show', 'HEAD:src/lib/backup.ts'], { encoding: 'utf8' }), loader: 'ts' }))
  } }] : [],
})
const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  await context.route('http://localhost/backup-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated backup regression</title>' }))
  const page = await context.newPage()
  await page.goto('http://localhost/backup-probe')
  await page.addScriptTag({ content: bundled.outputFiles[0].text })
  const result = await page.evaluate(async () => {
    const { db, exportJson, exportCsvBundle, importJson, purgeOrphanBlobs } = BackupProbe
    const require = (value, message) => { if (!value) throw new Error(message) }
    const results = []
    const base = { user_id: null, updated_at: '2026-11-16T00:00:00.000Z', deleted_at: null }
    const attachment = { ...base, id: 'attachment', parent_type: 'course', parent_id: 'course', name: 'offline.txt', storage_path: 'local:file', kind: 'text/plain', size: 15 }
    const content = 'portable bytes!'
    require(new TextEncoder().encode(content).length === attachment.size, 'fixture byte count')
    await db.attachments.put(attachment)
    await db.blobs.put({ id: 'file', data: new Blob([content], { type: 'text/plain' }) })
    const backup = await exportJson()
    require(backup.version === 3 && backup.blobs?.length === 1, 'portable export must contain attached file bytes (original v2 omitted them)')
    const reset = () => db.transaction('rw', db.tables, () => Promise.all(db.tables.map(t => t.clear())))
    await reset()
    require(await db.blobs.count() === 0 && await db.attachments.count() === 0, 'fresh destination must be empty')
    const restored = await importJson(JSON.stringify(backup))
    require(restored.files === 1 && restored.missingFiles === 0, 'restore file count')
    require(await (await db.blobs.get('file')).data.text() === content, 'fresh database must restore exact file bytes')
    require((await db.attachments.get('attachment')).storage_path === 'local:file', 'attachment reference preserved')
    require(await purgeOrphanBlobs() === 0, 'restored live file must survive orphan cleanup')
    results.push('PASS portable export and fresh-database restore preserve bytes, references and cleanup safety')

    const csv = await exportCsvBundle()
    require(csv.includes('offline.txt') && !csv.includes(backup.blobs[0].base64), 'CSV is record-only')
    results.push('PASS CSV stays record-only')

    for (const [label, mutate] of [
      ['corrupt bytes', b => { b.blobs[0].base64 = btoa('tampered bytes!') }],
      ['missing manifest file', b => { b.blobs = [] }],
      ['duplicate manifest ID', b => { b.blobs.push({ ...b.blobs[0] }) }],
      ['wrong attachment size', b => { b.tables.attachments[0].size++ }],
      ['unreferenced file', b => { b.tables.attachments = [] }],
      ['invalid later record', b => { b.tables.notes = [{ id: 'broken' }] }],
    ]) {
      const invalid = structuredClone(backup); mutate(invalid)
      let rejected = false
      try { await importJson(JSON.stringify(invalid)) } catch { rejected = true }
      require(rejected, `${label} must be rejected`)
      require(await db.attachments.count() === 1 && await db.blobs.count() === 1 && await (await db.blobs.get('file')).data.text() === content, `${label} must not change stored data`)
    }
    results.push('PASS corruption, missing/duplicate/unreferenced files, mismatched sizes and invalid records reject before writes')

    await reset()
    const fail = () => { throw new Error('simulated storage failure after blob write') }
    db.attachments.hook('creating', fail)
    let rejected = false
    try { await importJson(JSON.stringify(backup)) } catch { rejected = true }
    finally { db.attachments.hook('creating').unsubscribe(fail) }
    require(rejected && await db.blobs.count() === 0 && await db.attachments.count() === 0, 'storage failure must roll back both bytes and records')
    results.push('PASS interrupted restore rolls back file bytes and records atomically')

    const legacy = { app: 'semester-desk', version: 2, exported_at: backup.exported_at, tables: backup.tables }
    const old = await importJson(JSON.stringify(legacy))
    require(old.rows === 1 && old.files === 0 && old.missingFiles === 1, 'v2 import must warn about absent file bytes')
    let completeExportRejected = false
    try { await exportJson() } catch (error) { completeExportRejected = error.message.includes('missing') }
    require(completeExportRejected, 'complete export must not silently export missing live files')
    require((await exportCsvBundle()).includes('offline.txt'), 'CSV remains available with missing legacy files')
    results.push('PASS v2 compatibility reports missing files and prevents misleading complete exports')
    await db.delete()
    return results
  })
  result.forEach(line => console.log(line))
  assert.equal(result.length, 5)
  await context.close()
} finally { await browser.close() }
