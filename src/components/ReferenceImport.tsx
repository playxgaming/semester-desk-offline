import { useEffect, useRef, useState } from 'react'
import { Button, Field, Modal, Note, TextArea } from './ui'
import { saveReference } from '@/db/documents'
import type { SyllabusPdfSource } from '@/db/syllabus'
import { useUi } from '@/store/ui'
import { LocalOcrImport } from './LocalOcrImport'

export function ReferenceImport({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(''), [text, setText] = useState('')
  const [source, setSource] = useState<SyllabusPdfSource | undefined>()
  const [reading, setReading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const request = useRef<AbortController | null>(null), lock = useRef(false)
  const notify = useUi(s => s.notify)
  useEffect(() => () => request.current?.abort(), [])
  const close = () => { if (!lock.current) { request.current?.abort(); setOpen(false) } }
  async function read(file: File) {
    const controller = new AbortController(); request.current?.abort(); request.current = controller
    setReading(true); setError('')
    try {
      const { extractPdf } = await import('@/lib/pdf')
      const pages = await extractPdf(file, controller.signal)
      if (controller.signal.aborted) return
      setSource({ file, pages }); setTitle(file.name.replace(/\.pdf$/i, '').slice(0, 200)); setText(pages.map(p => p.text).join('\n\n').slice(0, 100_000))
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not read this PDF.') }
    finally { if (request.current === controller) setReading(false) }
  }
  async function save() {
    if (lock.current) return
    lock.current = true; setSaving(true); setError('')
    try {
      await saveReference(courseId, title, text, source)
      setOpen(false); setTitle(''); setText(''); setSource(undefined)
      notify('Reference saved on this device. You can now select its excerpts for AI notes.', 'ok')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this reference. Your text is still here.') }
    finally { lock.current = false; setSaving(false) }
  }
  return <>
    <Button onClick={() => { setOpen(true); setError('') }}>Add reference material</Button>
    <Modal open={open} onClose={close} title="Add reference material" wide footer={<div className="flex justify-end gap-2"><Button disabled={saving} onClick={close}>Cancel</Button><Button variant="primary" disabled={saving || reading || !title.trim() || !text.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save reference locally'}</Button></div>}>
      <div className="space-y-3">
        <Note>Save lecture notes or textbook excerpts you are allowed to use. This import stays on this device. AI receives only excerpts you select later.</Note>
        {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
        {!saving && !reading && <LocalOcrImport onRead={(source, text, title) => { setSource(source); setText(text); setTitle(title) }} />}
        <label className="block text-sm">Read a text-based PDF (25 MB / 80 pages maximum)<input aria-label="Reference PDF" className="field mt-1" type="file" accept="application/pdf,.pdf" disabled={reading || saving} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file) }} /></label>
        {reading && <p role="status">Reading PDF on this device…</p>}
        {source && <p className="break-all text-sm">Original {source.file.type.startsWith('image/') ? 'image' : 'PDF'}: {source.file.name}. {source.pages.length} pages retained. Check columns and missing diagrams before saving.</p>}
        <Field label="Reference title" value={title} maxLength={200} disabled={reading || saving} onChange={e => setTitle(e.target.value)} />
        <TextArea label="Reference text" rows={12} maxLength={100_000} value={text} disabled={reading || saving} onChange={e => setText(e.target.value)} />
        <p className="text-xs text-ink-3">Paste text or review extracted text. For photos and scanned PDFs, choose local text recognition and correct its output before saving.</p>
      </div>
    </Modal>
  </>
}
