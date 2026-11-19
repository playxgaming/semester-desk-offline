import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Field, Modal, Note, Row, TextArea } from './ui'
import { db, type CourseDocument } from '@/db/db'
import { alive } from '@/db/mutate'
import { importSyllabus, undoSyllabus } from '@/db/syllabus'
import { parseSyllabus, type SyllabusTopicDraft } from '@/lib/syllabus'
import { useUi } from '@/store/ui'
import { readFile } from '@/db/files'
import type { PdfPageText } from '@/lib/pdf'
import { LocalOcrImport } from './LocalOcrImport'

export function SyllabusImport({ courseId }: { courseId: string }) {
  const documents = useLiveQuery(async () => alive(await db.course_documents.where('course_id').equals(courseId).toArray()), [courseId]) ?? []
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Course syllabus')
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<SyllabusTopicDraft[] | null>(null)
  const [viewing, setViewing] = useState<CourseDocument | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const extraction = useRef<AbortController | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState(false)
  const [pages, setPages] = useState<PdfPageText[]>([])
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState('')
  const [sourceQuery, setSourceQuery] = useState('')
  useEffect(() => () => extraction.current?.abort(), [])
  const notify = useUi(s => s.notify)
  const edit = (i: number, changes: Partial<SyllabusTopicDraft>) => setDrafts(rows => rows?.map((row, index) => index === i ? { ...row, ...changes } : row) ?? null)
  const close = () => { if (!lock.current) { extraction.current?.abort(); setOpen(false) } }
  async function loadPdf(file: File) {
    extraction.current?.abort()
    const controller = new AbortController()
    extraction.current = controller
    setReading(true); setError(''); setProgress('Opening PDF…')
    try {
      const { extractPdf } = await import('@/lib/pdf')
      const extracted = await extractPdf(file, controller.signal, (page, total) => setProgress(`Reading page ${page} of ${total}…`))
      if (controller.signal.aborted) return
      setPdfFile(file); setOcr(false); setPages(extracted); setSelectedPages(extracted.map(p => p.number)); setDrafts(null)
      setText(extracted.map(p => p.text).join('\n\n')); setTitle(file.name.replace(/\.pdf$/i, ''))
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not read this PDF. Try pasting its text.')
    } finally { if (extraction.current === controller) { setReading(false); setProgress('') } }
  }
  async function downloadOriginal(doc: CourseDocument) {
    try {
      const attachment = doc.attachment_id ? await db.attachments.get(doc.attachment_id) : undefined
      const blob = attachment && !attachment.deleted_at ? await readFile(attachment) : null
      if (!attachment || !blob) throw new Error('The original PDF is no longer on this device. Restore its complete backup.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not open the original PDF', 'crit') }
  }
  async function commit() {
    if (!drafts || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await importSyllabus(courseId, title, text, drafts, pdfFile ? { file: pdfFile, pages: pages.filter(p => selectedPages.includes(p.number)), ...(ocr ? { extraction: 'ocr' as const } : {}) } : undefined)
      setOpen(false); setDrafts(null); setText(''); setPdfFile(null); setPages([]); setSelectedPages([])
      notify(`${result.added.length} topics added; ${result.skipped} duplicates skipped. Syllabus saved on this device.`, 'ok', result.newDocument || result.added.length ? async () => {
        try { await undoSyllabus(result); notify('Syllabus import undone') }
        catch (e) { notify(e instanceof Error ? e.message : 'Could not undo this import', 'crit') }
      } : undefined)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this syllabus. No topics were added; retry.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="mb-4 space-y-2">
    <Button onClick={() => { setError(''); setOpen(true) }}>Import syllabus</Button>
    <p className="text-[12px] text-ink-3">Paste an outline or read a PDF, review topics, then save. Works offline; no AI upload.</p>
    {documents.map(doc => <Button key={doc.id} size="sm" className="max-w-full break-all text-left" aria-label={`View ${doc.kind === 'reference' ? 'reference' : 'syllabus'}: ${doc.title}`} onClick={() => { setSourceQuery(''); setViewing(doc) }}>View {doc.title}</Button>)}
    <Modal open={open} onClose={close} title={drafts ? 'Review syllabus topics' : 'Import syllabus'} wide footer={<div className="flex flex-wrap justify-end gap-2">
      <Button disabled={busy} onClick={close}>Cancel</Button>
      {drafts ? <><Button disabled={busy} onClick={() => { setDrafts(null); setError('') }}>Back to text</Button><Button variant="primary" disabled={busy || !drafts.some(d => d.selected)} onClick={() => void commit()}>{busy ? 'Saving…' : `Import ${drafts.filter(d => d.selected).length} topics`}</Button></> : <Button variant="primary" disabled={reading || !text.trim() || !title.trim() || Boolean(pdfFile && !selectedPages.length)} onClick={() => {
        try {
          const parsed = parseSyllabus(text)
          if (!parsed.length) throw new Error('No topic lines found. Add one topic per line under your unit headings.')
          setDrafts(parsed); setError('')
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this outline.') }
      }}>Preview topics</Button>}
    </div>}>
      {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
      {!drafts ? <div className="space-y-3">
        {!reading && <LocalOcrImport onRead={(source, text, title) => { setPdfFile(source.file); setOcr(true); setPages(source.pages); setSelectedPages(source.pages.map(p => p.number)); setText(text); setTitle(title); setDrafts(null) }} />}
        <label className="block text-sm">Read syllabus PDF (up to 25 MB / 80 pages)
          <input aria-label="Syllabus PDF" className="field mt-1" type="file" accept="application/pdf,.pdf" disabled={reading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void loadPdf(file) }} />
        </label>
        {reading && <p role="status">{progress}</p>}
        {pdfFile && <div className="space-y-2">
          <p className="break-all text-sm">Original: {pdfFile.name}. Choose pages before editing extracted text. Changing pages resets text edits.</p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">{pages.map(p => <label key={p.number} className="flex min-h-[44px] items-center gap-2 rounded border border-rule px-2"><input type="checkbox" aria-label={`Include page ${p.number}`} checked={selectedPages.includes(p.number)} disabled={reading} onChange={e => {
            const next = e.target.checked ? [...selectedPages, p.number] : selectedPages.filter(n => n !== p.number)
            setSelectedPages(next); setText(pages.filter(page => next.includes(page.number)).map(page => page.text).join('\n\n'))
          }} />Page {p.number}{!p.text.trim() ? ' (no text)' : ''}</label>)}</div>
          {pages.some(p => !p.text.trim()) && <Note>Some pages have no selectable text and may contain scans or diagrams. OCR is not available yet.</Note>}
          <Button disabled={reading} onClick={() => { setPdfFile(null); setPages([]); setSelectedPages([]) }}>Use text only</Button>
        </div>}
        <Field label="Source title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
        <TextArea label="Syllabus text" rows={12} value={text} disabled={reading} maxLength={100_000} onChange={e => setText(e.target.value)} placeholder={'Unit 1: Linear algebra\n- Matrices and determinants\n- Systems of linear equations\nUnit 2: Calculus\n- Differentiation'} />
        <Note>Use one topic per line. Unit, Module and Chapter headings become labels. Columns, tables and OCR can read out of order: correct the text before previewing. Local recognition supports printed English photos and scanned PDFs.</Note>
      </div> : <div className="space-y-3">
        <Note>Check the names and units. Study minutes are editable estimates, not official syllabus hours. Existing topic names are skipped when saving. Nothing changes until you import.</Note>
        {drafts.map((draft, i) => <section key={i} className="rounded-lg border border-rule p-3">
          <label className="mb-2 flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={draft.selected} disabled={busy} onChange={e => edit(i, { selected: e.target.checked })} />Include topic {i + 1}</label>
          <Field label={`Topic ${i + 1}`} value={draft.name} disabled={busy} maxLength={300} onChange={e => edit(i, { name: e.target.value })} />
          <Row className="mt-2"><Field label={`Unit ${i + 1}`} value={draft.unit} disabled={busy} maxLength={200} onChange={e => edit(i, { unit: e.target.value })} /><Field label={`Study minutes ${i + 1}`} type="number" min={5} max={1440} value={draft.minutes} disabled={busy} onChange={e => edit(i, { minutes: Number(e.target.value) })} /></Row>
          <p className="mt-2 break-words text-[12px] text-ink-3">Source: {draft.excerpt}</p>
        </section>)}
      </div>}
    </Modal>
    <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title ?? 'Syllabus'} wide>
      <p className="mb-3 text-[12px] text-ink-3">{viewing?.pages ? 'Reviewed extraction and original page text' : 'Original pasted text'}, saved on this device and included in complete JSON backups.</p>
      {viewing?.attachment_id && <Button onClick={() => void downloadOriginal(viewing)}>{viewing.original_type?.startsWith('image/') ? 'Download original image' : 'Download original PDF'}</Button>}
      {viewing?.pages && <Field label="Search original pages" value={sourceQuery} onChange={e => setSourceQuery(e.target.value)} />}
      {viewing?.pages && sourceQuery.trim() && !viewing.pages.some(p => p.text.toLowerCase().includes(sourceQuery.trim().toLowerCase())) && <p role="status">No original pages match this search.</p>}
      {viewing?.pages && <div className="my-3 space-y-2">{viewing.pages.filter(p => !sourceQuery.trim() || p.text.toLowerCase().includes(sourceQuery.trim().toLowerCase())).map(p => <details key={p.number} className="rounded border border-rule p-2"><summary className="cursor-pointer py-2">Original page {p.number}</summary><pre className="whitespace-pre-wrap break-words font-sans text-sm">{p.text || 'No selectable text on this page.'}</pre></details>)}</div>}
      <p className="mt-3 text-sm font-semibold">{viewing?.pages ? 'Reviewed syllabus text' : 'Syllabus text'}</p>
      <pre className="whitespace-pre-wrap break-words font-sans text-[14px]">{viewing?.body_text}</pre>
      {viewing && <Link className="mt-3 inline-flex min-h-[44px] items-center text-sm text-accent underline" to={`/pilot?item=${encodeURIComponent(`document:${viewing.id}`)}`}>Review extraction quality</Link>}
    </Modal>
  </div>
}
