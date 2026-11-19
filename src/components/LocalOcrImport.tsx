import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Note, TextArea } from './ui'
import { ImageAdjust } from './ImageAdjust'
import type { SyllabusPdfSource } from '@/db/syllabus'
export function LocalOcrImport({ onRead }: { onRead: (source: SyllabusPdfSource, text: string, title: string) => void }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null), [prepared, setPrepared] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [text, setText] = useState('')
  const [pages, setPages] = useState<{ number: number; text: string }[]>([]), [confidence, setConfidence] = useState(100)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const close = () => { request.current?.abort(); setOpen(false) }
  return <><Button onClick={() => { setError(''); setOpen(true) }}>Read photo or scanned PDF locally</Button>
    <Modal open={open} onClose={close} title="Local text recognition" wide footer={<div className="flex flex-wrap justify-end gap-2"><Button onClick={close}>{busy ? 'Cancel recognition' : 'Cancel'}</Button><Button variant="primary" disabled={busy || !text.trim() || !pages.length || !file} onClick={() => { if (file) { onRead({ file, pages, extraction: 'ocr' }, text, file.name.replace(/\.[^.]+$/, '').slice(0, 200)); setOpen(false) } }}>Use reviewed text</Button></div>}>
      <Note>Printed English OCR runs on this device using bundled assets. Check every line, especially equations, handwriting and tables. PDF OCR supports up to 10 pages and 25 MB. No image is sent to an AI provider.</Note>
      <input aria-label="Local OCR file" className="field my-3" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const next = e.target.files?.[0]; if (next) { setFile(next); setPrepared(next); setText(''); setPages([]); setError('') } }} />
      {file?.type.startsWith('image/') && <ImageAdjust key={file.name + file.lastModified} file={file} disabled={busy} onApply={setPrepared} />}
      <Button disabled={busy || !prepared} onClick={async () => {
        if (!prepared || busy) return
        const controller = new AbortController(); request.current = controller; setBusy(true); setError('')
        try { const { readLocalText } = await import('@/lib/ocr'); const result = await readLocalText(prepared, controller.signal, setProgress); if (!controller.signal.aborted) { setText(result.text); setPages(result.pages); setConfidence(result.confidence) } }
        catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Recognition failed. Try a clearer image.') }
        finally { setBusy(false) }
      }}>{busy ? 'Recognizing…' : 'Recognize text locally'}</Button>
      {busy && <p role="status" className="my-2 text-sm">{progress}</p>}
      {error && <p role="alert" className="my-2 text-sm text-crit">{error}</p>}
      {pages.length > 0 && <div className="mt-3 space-y-2"><Note tone={confidence < 60 ? 'warn' : 'accent'}>Engine confidence: {Math.round(confidence)}%. This is a recognition estimate, not an accuracy guarantee. Correct the text before using it.</Note><TextArea label="Recognized text to review" rows={12} maxLength={100_000} value={text} onChange={e => setText(e.target.value)} /></div>}
    </Modal></>
}
