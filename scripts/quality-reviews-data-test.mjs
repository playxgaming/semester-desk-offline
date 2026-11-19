import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { db } from './src/db/db'; export * from './src/db/mutate'; export * from './src/db/quality'; export * from './src/lib/quality'; export * from './src/lib/backup'; export * from './src/db/library';` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false, define: { 'import.meta.env': '{}' } })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('http://localhost/quality-check', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated quality reviews</title>' }))
  await page.goto('http://localhost/quality-check'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const results = await page.evaluate(async () => {
    const { db, stamp, put, patch, remove, qualitySnapshot, qualityStatus, saveQualityReview, exportJson, importJson, searchLibrary } = Probe
    const check = (v, m) => { if (!v) throw new Error(m) }
    const rejects = async (fn, m) => { let rejected = false; try { await fn() } catch { rejected = true } check(rejected, m) }
    const note = await put('notes', stamp({ id: 'note', course_id: null, topic_id: null, title: 'Matrices', body_md: 'A matrix has rows and columns.', pinned: false }))
    const snapshot = qualitySnapshot('note', note)
    const input = { target_type: 'note', target_id: note.id, verdict: 'usable', checks: { accuracy: 'pass', coverage: 'pass', readability: 'pass', sources: 'pass' }, issues: '' }
    await rejects(() => saveQualityReview({ ...input, checks: { ...input.checks, sources: 'na' } }, snapshot), 'Unchecked sources cannot yield usable')
    await rejects(() => saveQualityReview({ ...input, verdict: 'needs_changes' }, snapshot), 'Failed reviews require actionable issues')
    check(await db.quality_reviews.count() === 0, 'Invalid reviews cannot be written')
    const review = await saveQualityReview(input, snapshot)
    snapshot.body = 'Mutated caller copy'
    check((await db.quality_reviews.get(review.id)).snapshot.body === note.body_md, 'Review content must be independent of caller objects')
    await patch('notes', note.id, { pinned: true })
    check(qualityStatus(qualitySnapshot('note', await db.notes.get(note.id)), review) === 'Usable', 'Pin and timestamps must not invalidate reviews')
    await patch('notes', note.id, { local_draft: { title: 'Matrices', body_md: 'Changed local draft', at: new Date().toISOString() } })
    check(qualityStatus(qualitySnapshot('note', await db.notes.get(note.id)), review) === 'Changed since review', 'Effective local drafts invalidate current approval')
    await rejects(() => saveQualityReview(input, review.snapshot), 'Stale concurrent review must reject')
    check(await db.quality_reviews.count() === 1, 'Stale review creates no partial record')
    const newSnapshot = qualitySnapshot('note', await db.notes.get(note.id))
    const second = await saveQualityReview({ ...input, verdict: 'needs_changes', issues: 'Verify the formula and missing worked example.' }, newSnapshot)
    check((await db.quality_reviews.get(review.id)).snapshot.body === note.body_md && second.snapshot.body === 'Changed local draft', 'Review history must preserve each exact version')
    check((await searchLibrary('missing worked example')).some(r => r.table === 'quality_reviews'), 'Review issues must be searchable')
    const doc = await put('course_documents', stamp({ id: 'doc', course_id: 'course', title: 'OCR syllabus', kind: 'syllabus', body_text: 'Matrices and determinants', imported_at: new Date().toISOString(), extraction: 'ocr', pages: [{ number: 1, text: 'Matrices and determinants' }] }))
    const docReview = await saveQualityReview({ ...input, target_type: 'document', target_id: doc.id }, qualitySnapshot('document', doc))
    await patch('course_documents', doc.id, { pages: [{ number: 1, text: 'Corrected original page' }] })
    check(qualityStatus(qualitySnapshot('document', await db.course_documents.get(doc.id)), docReview) === 'Changed since review', 'Source-page changes invalidate review')
    await remove('notes', note.id)
    await rejects(() => saveQualityReview(input, newSnapshot), 'Deleted targets cannot be reviewed')
    const backup = await exportJson()
    const invalid = structuredClone(backup); invalid.tables.quality_reviews.find(r => r.id === review.id).checks.accuracy = 'na'
    await rejects(() => importJson(JSON.stringify(invalid)), 'Invalid usable verdict must reject full backup before writes')
    const badContext = structuredClone(backup); badContext.tables.quality_reviews[0].snapshot.context = JSON.stringify({ course_id: null, topic_id: null, provenance: { sources: 'malformed' } })
    await rejects(() => importJson(JSON.stringify(badContext)), 'Malformed nested snapshot must reject before rendering')
    await db.quality_reviews.clear(); await importJson(JSON.stringify(backup))
    check(await db.quality_reviews.count() === 3 && (await db.quality_reviews.get(review.id)).snapshot.body === note.body_md, 'Portable backup restores full history and snapshots')
    return ['review validation and usable guard', 'immutable snapshots and draft-aware stale detection', 'concurrent edit/deletion rejection', 'OCR source context changes', 'search and validated portable backup round trip']
  })
  assert.equal(results.length, 5)
  console.log('PASS', results)
} finally { await browser.close() }
