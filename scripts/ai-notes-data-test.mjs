import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { db } from './src/db/db'; export * from './src/db/mutate'; export * from './src/db/documents'; export * from './src/db/aiNotes'; export * from './src/db/history'; export * from './src/lib/aiNotes'; export * from './src/lib/backup';` }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Probe', write: false, define: { 'import.meta.env': '{}' } })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('http://localhost/notes-data-check', route => route.fulfill({ contentType: 'text/html', body: '<title>Isolated note checks</title>' }))
  await page.goto('http://localhost/notes-data-check')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const results = await page.evaluate(async () => {
    const { db, put, stamp, saveReference, saveGeneratedNote, writeNoteDraft, sourceChoices, validateNoteOutput, validateNoteRequest, exportJson, importJson } = Probe
    const check = (v, message) => { if (!v) throw new Error(message) }
    const reject = async (fn, message) => { let failed = false; try { await fn() } catch { failed = true } check(failed, message) }
    const base = { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }, results = []
    const quote = 'A matrix is a rectangular array of numbers arranged in rows and columns.'
    await put('courses', stamp({ id: 'course', code: 'MATH101', name: 'Algebra', credits: 3, colour: '#3358CC', instructor: '', target_grade: 80, attendance_threshold: .75, archived: false, semester: 'Semester 1' }))
    await put('topics', stamp({ id: 'topic', course_id: 'course', name: 'Matrices', order_index: 0, confidence: 0, est_minutes: 60, exam_critical: false }))
    const file = new File(['%PDF-1.4 test source bytes'], 'lecture.pdf', { type: 'application/pdf' })
    const doc = await saveReference('course', 'Lecture 1', quote, { file, pages: [{ number: 2, text: quote }] })
    const attachment = await db.attachments.get(doc.attachment_id)
    check(await (await db.blobs.get(attachment.storage_path.slice(6))).data.text() === await file.text(), 'Reference original bytes stored')
    const failure = () => { throw new Error('Injected document failure') }
    db.course_documents.hook('creating', failure)
    try { await reject(() => saveReference('course', 'Failed reference', quote, { file, pages: [{ number: 1, text: quote }] }), 'Reference failure must propagate') }
    finally { db.course_documents.hook('creating').unsubscribe(failure) }
    check(await db.blobs.count() === 1 && await db.attachments.count() === 1 && await db.course_documents.count() === 1, 'Reference failure leaves no partial file')
    results.push('reference text/pages/original bytes commit atomically; failure leaves no orphan file')

    const choices = sourceChoices([doc], 'rectangular', 'Matrices')
    check(choices.some(s => s.page === 2 && s.document_id === doc.id && s.text === quote), 'Search preserves exact source/page identity')
    check(sourceChoices([doc], 'not found anywhere', 'Matrices').length === 0, 'Source search excludes unmatched content')
    const long = sourceChoices([{ ...doc, pages: undefined, body_text: 'abc '.repeat(7000) }], '', 'Matrices')
    check(long.length > 1 && long.every(s => s.text.length <= 6000), 'Long sources must be explicitly selected as bounded excerpts')
    results.push('local retrieval and bounded source excerpts preserve page identity')

    const sources = [{ id: 'S1', title: 'Lecture 1 — page 2', text: quote, document_id: doc.id, page: 2 }]
    const request = validateNoteRequest({ course: 'Algebra', topic: 'Matrices', sources })
    check(!('document_id' in request.sources[0]), 'Local IDs are not sent to the provider')
    const output = { title: 'Matrices', body_md: 'A matrix contains rows and columns. [S1]', citations: [{ source_id: 'S1', quote }] }
    validateNoteOutput(output, sources)
    await reject(() => validateNoteOutput({ ...output, body_md: 'Unknown. [S2]' }, sources), 'Unknown citation must fail')
    await reject(() => validateNoteOutput({ ...output, citations: [{ source_id: 'S1', quote: 'This is an invented quote.' }] }, sources), 'Invented quote must fail')
    await reject(() => validateNoteRequest({ ...request, sources: Array.from({ length: 4 }, (_, i) => ({ id: `S${i + 1}`, title: 'Large', text: 'x'.repeat(8000) })) }), 'Oversized source selection must fail')
    results.push('reference validation rejects invented/unknown quotes and oversized input')

    const provenance = { provider: 'groq', model: 'test-model', generated_at: base.updated_at, sources, citations: output.citations, generated_body_md: output.body_md }
    await saveGeneratedNote('note-1', 'course', 'topic', output, provenance)
    await writeNoteDraft('note-1', 'My edited note', 'My manual edits must survive regeneration.')
    await saveGeneratedNote('note-2', 'course', 'topic', output, { ...provenance, derived_from_note_id: 'note-1' })
    await saveGeneratedNote('note-1', 'course', 'topic', output, provenance)
    check((await db.notes.get('note-1')).local_draft.body_md === 'My manual edits must survive regeneration.', 'Retry/regeneration preserves edited note')
    check((await db.notes.get('note-2')).local_draft.body_md === output.body_md && (await db.notes.get('note-2')).body_md === '', 'Generated result is a separate review draft')
    const failNote = () => { throw new Error('Injected note storage failure') }
    db.notes.hook('creating', failNote)
    try { await reject(() => saveGeneratedNote('failed-note', 'course', 'topic', output, provenance), 'Storage failure must propagate') }
    finally { db.notes.hook('creating').unsubscribe(failNote) }
    check(!await db.notes.get('failed-note'), 'Failed save must not create a partial note')
    results.push('separate generations and idempotent retries protect edits; failed saves stay atomic')

    const backup = await exportJson()
    await db.transaction('rw', db.tables, () => Promise.all(db.tables.map(t => t.clear())))
    await importJson(JSON.stringify(backup))
    const restored = await db.notes.get('note-2')
    check(restored.ai_provenance.sources[0].page === 2 && restored.ai_provenance.sources[0].text === quote && restored.local_draft.body_md === output.body_md, 'Backup retains draft, provider, citations and exact source snapshot')
    const invalid = structuredClone(backup)
    invalid.tables.notes[0].ai_provenance.citations[0].quote = 'Forged source quotation.'
    await reject(() => importJson(JSON.stringify(invalid)), 'Forged provenance backup must reject')
    results.push('portable backup restores offline sources and drafts; invalid provenance rejects before writes')
    return results
  })
  assert.equal(results.length, 5)
  results.forEach(result => console.log(`PASS ${result}`))
} finally { await browser.close() }
