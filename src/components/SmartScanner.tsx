import { useState, useRef, useEffect } from 'react'
import { Button, Modal, Note, Card, Field, Select, TextArea } from '@/components/ui'
import { Camera, Loader2 } from 'lucide-react'
import { useCourses, useSlots, useProfile } from '@/hooks/data'
import { useUi } from '@/store/ui'
import { aiRequest, aiHealth } from '@/lib/ai'
import { importScan, undoScanImport, matchScanCourse, type ScanItem as Item } from '@/db/scanner'
import { ImageAdjust } from './ImageAdjust'
import { parseTimetableLines, scanConflictMessages } from '@/lib/timetableImport'
import { weekApplies } from '@/lib/timetable'
import { addDays, dayKey } from '@/lib/date'

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

export default function SmartScanner({ onClose, courseId }: { onClose?: () => void; courseId?: string }) {
  const courses = useCourses()
  const slots = useSlots(), profile = useProfile()
  const [mode, setMode] = useState('ai'), [ocrText, setOcrText] = useState(''), [legend, setLegend] = useState(''), [section, setSection] = useState(''), [previewWeek, setPreviewWeek] = useState('a')
  const notify = useUi(s => s.notify)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [scannerReady, setScannerReady] = useState<boolean | null>(null)
  useEffect(() => {
    if (!open) return
    let active = true
    setScannerReady(null)
    void aiHealth('scanner').then(health => {
      if (active) setScannerReady(health.scannerConfigured ?? health.providers?.gemini ?? health.aiConfigured)
    }).catch(() => { if (active) setScannerReady(false) })
    return () => { active = false }
  }, [open])
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const close = () => {
    if (saving) return
    generation.current++; request.current?.abort(); setBusy(false); setOpen(false); setFile(null); setItems(null); setError(''); onClose?.()
  }
  const edit = (index: number, changes: Partial<Item>) => setItems(current => current?.map((item, i) => i === index ? { ...item, ...changes } : item) || null)
  const scan = async () => {
    if (!file || busy || (mode === 'ai' && !scannerReady)) return
    setBusy(true); setError('')
    const token = ++generation.current
    const controller = new AbortController(); request.current = controller
    try {
      if (mode === 'local') {
        const { readLocalText } = await import('@/lib/ocr')
        const result = await readLocalText(file, controller.signal)
        if (token === generation.current) { setOcrText(result.text); setItems([]) }
        return
      }
      const form = new FormData(); form.append('document', file)
      const result = await aiRequest<unknown>('scan-document', form, controller.signal)
      if (!Array.isArray(result) || result.length > 100) throw new Error('Invalid scan response. Please try another image.')
      const rows: Item[] = result.map(raw => {
        if (!raw || typeof raw.title !== 'string' || !['class', 'deadline', 'exam', 'holiday'].includes(raw.type)) throw new Error('Invalid extracted item. Please retry.')
        const text = (key: string) => typeof raw[key] === 'string' ? raw[key] : ''
        const matched = matchScanCourse(raw.title, courses)
        return { title: raw.title.slice(0, 200), type: raw.type, date: text('date'), startTime: text('startTime'), endTime: text('endTime'), dayOfWeek: Number.isInteger(raw.dayOfWeek) && raw.dayOfWeek >= 0 && raw.dayOfWeek <= 6 ? String(raw.dayOfWeek) : '', location: text('location'), course: courseId || matched || '', selected: true, classKind: ['lecture', 'lab', 'tutorial', 'other'].includes(raw.classKind) ? raw.classKind : 'other', section: text('section').slice(0, 200), weekPattern: ['a', 'b', 'all'].includes(raw.weekPattern) ? raw.weekPattern : 'all', weekAnchor: '' }
      })
      if (token === generation.current) setItems(rows)
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Scanning failed.') }
    finally { if (token === generation.current) { setBusy(false); request.current = null } }
  }
  const save = async () => {
    if (busy || !items) return
    const chosen = items.filter(i => i.selected)
    if (!chosen.length) return
    for (const item of chosen) {
      if (!item.title.trim()) { setError('Every selected item needs a title.'); return }
      if (item.course && !courses.some(c => c.id === item.course)) { setError('Select an available course.'); return }
      if (item.type === 'class') {
        if (!item.course || !/^[0-6]$/.test(item.dayOfWeek) || !validTime(item.startTime) || !validTime(item.endTime) || item.endTime <= item.startTime) {
          setError('Each weekly class needs a course, weekday, and an end time after its start time.'); return
        }
      } else if (!validDate(item.date) || (item.startTime && !validTime(item.startTime))) {
        setError('Each deadline, exam, or holiday needs a valid date. Check any times too.'); return
      }
    }
    setBusy(true); setSaving(true); setError('')
    try {
      const result = await importScan(chosen)
      notify(`Imported ${result.imported.length} items; skipped ${result.skipped} duplicates. Classes are in Timetable; exams and deadlines are in Deadlines.`, 'ok', result.imported.length ? async () => {
        try { await undoScanImport(result.imported); notify('Import undone') }
        catch (e) { notify(e instanceof Error ? e.message : 'Could not undo this import', 'crit') }
      } : undefined)
      setBusy(false); setSaving(false); setOpen(false); setFile(null); setItems(null); onClose?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the import. No items were added. Please try again.'); setBusy(false); setSaving(false) }
  }
  const conflicts = scanConflictMessages(items ?? [], slots)
  const aliases = () => legend.split(/\r?\n/).flatMap(line => { const [alias, code] = line.split('=').map(value => value.trim()); const course = courses.find(c => c.code.toLowerCase() === code?.toLowerCase()); return alias && course ? [{ ...course, code: alias }] : [] })
  const addRow = () => setItems(rows => [...(rows ?? []), { title: '', type: 'class', date: '', startTime: '', endTime: '', dayOfWeek: '1', location: '', course: courseId ?? '', selected: true, classKind: 'other', weekPattern: 'all', weekAnchor: profile.term_start }])
  return <>
    <Button onClick={() => setOpen(true)} className="text-accent"><Camera size={16} /> Scan Document</Button>
    <Modal open={open} onClose={close} title="Smart Scanner" footer={<div className="flex flex-wrap justify-end gap-3">
      <Button onClick={close} disabled={saving}>{busy && !saving ? 'Cancel scan' : 'Cancel'}</Button>
      <Button variant="primary" onClick={items ? save : scan} disabled={busy || (items ? !items.some(i => i.selected) || conflicts.size > 0 : !file || (mode === 'ai' && !scannerReady))}>
        {busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Working…' : items ? `Import ${items.filter(i => i.selected).length} items` : 'Scan image'}
      </Button>
    </div>}>
      {mode === 'ai' && (scannerReady === null ? <Note>Checking image scanning availability…</Note> : !scannerReady ? <Note tone="warn">Image AI is unavailable. Configure a Gemini image server in Settings → AI connection, or choose Local English OCR below. A ChatGPT text connection alone does not enable image AI.</Note> : null)}
      <Select label="Image processing" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setItems(null); setOcrText('') }}><option value="ai">Gemini image AI</option><option value="local">Local English OCR</option></Select>
      <Note>Upload a timetable or circular (JPEG, PNG, WebP, up to 8 MB). {mode === 'ai' ? 'The image is sent to your configured image AI service.' : 'Recognition runs on this device. Tables may need manual row entry.'} Crop or rotate it, then review classes, sections, weeks and conflicts before importing.</Note>
      <input ref={input} aria-label="Choose document image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || (mode === 'ai' && !scannerReady)} onChange={e => {
        const selected = e.target.files?.[0]; if (!selected) return
        setError(''); setItems(null)
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) { setFile(null); setError('Choose a JPEG, PNG, or WebP image under 8 MB.'); return }
        setFile(selected)
      }} />
      {preview && <img src={preview} alt="Selected document" className="my-4 max-h-[200px] max-w-full rounded object-contain" />}
      {file && !items && <ImageAdjust key={file.name + file.lastModified} file={file} disabled={busy} onApply={setFile} />}
      <TextArea label="Course legend" rows={2} value={legend} disabled={busy} onChange={e => setLegend(e.target.value)} placeholder="One alias per line: MAT = MATH101" />
      {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
      {items && <div className="space-y-3">
        {mode === 'local' && <><TextArea label="Recognized timetable text" rows={7} value={ocrText} onChange={e => setOcrText(e.target.value)} /><Note>For automatic row proposals use one line per class: Mon 09:00-10:00 MATH101. A visual grid may require manual rows. No rows are saved yet.</Note><Button onClick={() => { const parsed = parseTimetableLines(ocrText, [...aliases(), ...courses]); setItems(parsed); if (!parsed.length) setError('No structured class lines found. Correct the text or add rows manually using the photo.') }}>Build rows from text</Button></>}
        <Button disabled={busy || items.length >= 100} onClick={addRow}>Add class row</Button>
        <Button disabled={busy} onClick={() => setItems(rows => rows?.map(item => ({ ...item, course: matchScanCourse(item.title, [...aliases(), ...courses]) || item.course })) ?? null)}>Apply course legend</Button>
        <Field label="My section" value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. CSE-A" />
        <Button disabled={busy || !section.trim()} onClick={() => setItems(rows => rows?.map(item => ({ ...item, selected: !item.section?.trim() || item.section.trim().toLowerCase() === section.trim().toLowerCase() })) ?? null)}>Select my section</Button>
        <Select label="Preview teaching week" value={previewWeek} onChange={e => setPreviewWeek(e.target.value)}><option value="a">Week A</option><option value="b">Week B</option></Select>
        <div className="max-w-full overflow-x-auto rounded border border-rule"><table className="min-w-[640px] text-xs"><caption className="py-2 text-left font-semibold">Weekly grid preview — selected classes only</caption><thead><tr>{weekdays.map(day => <th key={day} className="p-2 text-left">{day}</th>)}</tr></thead><tbody><tr>{weekdays.map((day, weekday) => <td key={day} className="align-top p-2">{items.filter(item => item.selected && item.type === 'class' && item.dayOfWeek === String(weekday) && weekApplies({ week_pattern: item.weekPattern, week_anchor: item.weekAnchor }, item.weekAnchor ? dayKey(addDays(new Date(item.weekAnchor + 'T00:00:00'), previewWeek === 'a' ? 0 : 7)) : '2026-01-05')).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((item, i) => <p key={i} className="mb-2 break-words rounded bg-surface-2 p-2">{item.startTime}–{item.endTime}<br />{courses.find(c => c.id === item.course)?.code ?? item.title}<br />{item.section}</p>)}</td>)}</tr></tbody></table></div>
        <p className="text-sm">{items.length ? 'Select the items to import. AI extraction can make mistakes.' : 'No events found. Try a clearer image.'}</p>
        {items.map((item, i) => <Card key={i} className="p-3 space-y-3">
          {conflicts.has(i) && <Note tone="crit">{conflicts.get(i)}</Note>}
          <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={item.selected} disabled={busy} onChange={e => edit(i, { selected: e.target.checked })} />Include item {i + 1}</label>
          <Field label={`Title ${i + 1}`} value={item.title} disabled={busy} maxLength={200} onChange={e => edit(i, { title: e.target.value })} />
          <Select label={`Type ${i + 1}`} value={item.type} disabled={busy} onChange={e => edit(i, { type: e.target.value as Item['type'] })}>
            <option value="class">Weekly class</option><option value="deadline">Deadline</option><option value="exam">Exam</option><option value="holiday">Holiday (whole day)</option>
          </Select>
          {item.type !== 'holiday' && <Select label={`Course ${i + 1}`} value={item.course} disabled={busy} onChange={e => edit(i, { course: e.target.value })}>
            <option value="">{item.type === 'class' ? 'Select a course (required)' : 'General / no course'}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>}
          {item.type === 'class' && <Select label={`Class type ${i + 1}`} value={item.classKind} disabled={busy} onChange={e => edit(i, { classKind: e.target.value as Item['classKind'] })}>
            <option value="lecture">Lecture</option><option value="lab">Lab</option><option value="tutorial">Tutorial</option><option value="other">Other</option>
          </Select>}
          {item.type === 'class' && <><Field label={`Section ${i + 1}`} value={item.section ?? ''} disabled={busy} onChange={e => edit(i, { section: e.target.value })} /><Select label={`Teaching weeks ${i + 1}`} value={item.weekPattern ?? 'all'} disabled={busy} onChange={e => edit(i, { weekPattern: e.target.value as 'all' | 'a' | 'b', weekAnchor: item.weekAnchor || profile.term_start })}><option value="all">Every week</option><option value="a">Week A only</option><option value="b">Week B only</option></Select>{item.weekPattern && item.weekPattern !== 'all' && <Field label={`Week A anchor ${i + 1}`} type="date" value={item.weekAnchor ?? ''} disabled={busy} onChange={e => edit(i, { weekAnchor: e.target.value })} />}</>}
          {item.type === 'class' ? <Select label={`Weekday ${i + 1}`} value={item.dayOfWeek} disabled={busy} onChange={e => edit(i, { dayOfWeek: e.target.value })}>
            <option value="">Select weekday</option>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </Select> : <Field label={`Date ${i + 1}`} type="date" value={item.date} disabled={busy} onChange={e => edit(i, { date: e.target.value })} />}
          {item.type !== 'holiday' && <Field label={`${item.type === 'class' ? 'Start time' : 'Due time (optional)'} ${i + 1}`} type="time" value={item.startTime} disabled={busy} onChange={e => edit(i, { startTime: e.target.value })} />}
          {item.type === 'class' && <Field label={`End time ${i + 1}`} type="time" value={item.endTime} disabled={busy} onChange={e => edit(i, { endTime: e.target.value })} />}
          {item.type !== 'holiday' && <Field label={`Location ${i + 1}`} value={item.location} disabled={busy} onChange={e => edit(i, { location: e.target.value })} />}
        </Card>)}
      </div>}
    </Modal>
  </>
}
