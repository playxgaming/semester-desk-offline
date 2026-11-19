import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Button, Field, Modal, Note, Select, TextArea } from './ui'
import { Markdown } from './Markdown'
import { ReferenceImport } from './ReferenceImport'
import { db, type Note as NoteRow } from '@/db/db'
import { alive } from '@/db/mutate'
import { saveGeneratedNote } from '@/db/aiNotes'
import { useCourses, useTopics } from '@/hooks/data'
import { aiHealth, aiRequest, type AiProvider } from '@/lib/ai'
import { sourceChoices, validateNoteOutput, validateNoteRequest, type NoteOutput, type NoteProvenance, type NoteSource } from '@/lib/aiNotes'
import { uid } from '@/lib/id'

interface Generated { id: string; courseId: string; topicId: string; output: NoteOutput; provenance: NoteProvenance }
export function AiNotesGenerator({ initialCourse, initialTopic, previous, onClose, onCreated }: {
  initialCourse: string; initialTopic: string; previous?: NoteRow; onClose: () => void; onCreated: (id: string) => void
}) {
  const courses = useCourses(), topics = useTopics()
  const [courseId, setCourseId] = useState(initialCourse), [topicId, setTopicId] = useState(initialTopic)
  const [provider, setProvider] = useState<AiProvider>(previous?.ai_provenance?.provider ?? 'gemini')
  const [style, setStyle] = useState<string>(previous?.ai_provenance?.style ?? 'summary'), [level, setLevel] = useState<string>(previous?.ai_provenance?.level ?? 'undergraduate')
  const [providers, setProviders] = useState<AiProvider[]>([]), [checking, setChecking] = useState(true)
  const [chosen, setChosen] = useState<NoteSource[]>(previous?.ai_provenance?.sources ?? [])
  const [query, setQuery] = useState(''), [visible, setVisible] = useState(12)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [generated, setGenerated] = useState<Generated | null>(null)
  const request = useRef<AbortController | null>(null), lock = useRef(false), saving = useRef(false)
  const documents = useLiveQuery(async () => alive(await db.course_documents.where('course_id').equals(courseId).toArray()), [courseId]) ?? []
  const topic = topics.find(t => t.id === topicId && t.course_id === courseId)
  const course = courses.find(c => c.id === courseId)
  const choices = useMemo(() => sourceChoices(documents, query, topic?.name ?? ''), [documents, query, topic?.name])
  const size = chosen.reduce((n, source) => n + source.text.length, 0)
  useEffect(() => {
    let mounted = true
    void aiHealth().then(health => {
      if (!mounted) return
      const available = health.notesConfigured ? (['chatgpt', 'gemini', 'groq'] as AiProvider[]).filter(p => health.providers?.[p]) : []
      setProviders(available)
      if (available.length) setProvider(current => available.includes(current) || previous ? current : available[0])
      else setError('AI notes are not ready. Connect a provider in Settings; older servers need the updated notes endpoint.')
    }).catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Could not reach the AI connection.') })
      .finally(() => { if (mounted) setChecking(false) })
    return () => { mounted = false; request.current?.abort() }
  }, [])
  function resetSelection() { setChosen([]); setQuery(''); setVisible(12); setError('') }
  const close = () => { if (!saving.current) { request.current?.abort(); onClose() } }
  async function store(result: Generated) {
    if (saving.current) return
    saving.current = true
    try {
      await saveGeneratedNote(result.id, result.courseId, result.topicId, result.output, result.provenance)
      onCreated(result.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not store the draft. Keep this preview open and retry saving.') }
    finally { saving.current = false }
  }
  async function generate() {
    if (lock.current || !topic || !course || !providers.includes(provider)) return
    lock.current = true; setBusy(true); setError('')
    const controller = new AbortController(); request.current = controller
    try {
      const sources = chosen.map((s, i) => ({ ...s, id: `S${i + 1}` }))
      const payload = validateNoteRequest({ topic: topic.name, course: `${course.code}: ${course.name}`.slice(0, 200), sources, style, level })
      const raw = await aiRequest<unknown>('generate-notes', { ...payload, provider }, controller.signal)
      if (controller.signal.aborted) return
      const output = validateNoteOutput(raw, sources)
      if (!raw || typeof raw !== 'object' || !('provider' in raw) || raw.provider !== provider || !('model' in raw) || typeof raw.model !== 'string' || !raw.model.trim() || raw.model.length > 200) throw new Error('The provider returned incomplete model information. No note was changed.')
      const result: Generated = { id: uid(), courseId, topicId, output, provenance: {
        provider, model: raw.model, generated_at: new Date().toISOString(), sources, citations: output.citations,
        style: payload.style, level: payload.level,
        generated_body_md: output.body_md, ...(previous ? { derived_from_note_id: previous.id } : {}),
      } }
      setGenerated(result)
      await store(result)
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not generate notes. Your selections are still here.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal open onClose={close} title="AI notes from your sources" wide footer={<div className="flex flex-wrap justify-end gap-2">
    <Button onClick={close}>{busy && !generated ? 'Cancel generation' : 'Close'}</Button>
    {generated ? <Button variant="primary" disabled={busy} onClick={() => void store(generated)}>Retry saving draft locally</Button> : <Button variant="primary" disabled={busy || checking || !topic || !chosen.length || size > 24000 || !providers.includes(provider)} onClick={() => void generate()}>{busy ? 'Generating draft…' : 'Generate new draft'}</Button>}
  </div>}>
    <div className="space-y-3">
      <Note>Choose teaching material for one topic. The selected excerpts and course/topic labels will be sent to the provider you choose. Every generation creates a separate editable draft; your existing notes stay intact.</Note>
      {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
      {generated ? <><p className="text-sm">Generated preview retained here until it can be stored on this device.</p><Markdown source={generated.output.body_md} /></> : <>
        <Select label="Notes course" value={courseId} disabled={busy} onChange={e => { setCourseId(e.target.value); setTopicId(''); resetSelection() }}>
          <option value="">Choose course</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </Select>
        <Select label="Notes topic" value={topicId} disabled={busy} onChange={e => { setTopicId(e.target.value); resetSelection() }}>
          <option value="">Choose one topic</option>{topics.filter(t => t.course_id === courseId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select label="Notes provider" value={provider} disabled={checking || busy || !providers.length} onChange={e => setProvider(e.target.value as AiProvider)}>
          {!checking && previous && !providers.includes(provider) && <option value={provider} disabled>{provider} (previous provider unavailable — choose another)</option>}
          {providers.length ? providers.map(p => <option key={p} value={p}>{p === 'chatgpt' ? 'ChatGPT (local connection)' : p === 'groq' ? 'Groq' : 'Gemini'}</option>) : <option value="gemini">{checking ? 'Checking connection…' : 'No notes provider connected'}</option>}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Notes format" value={style} disabled={busy} onChange={e => setStyle(e.target.value)}><option value="summary">Key ideas summary</option><option value="exam">Exam preparation</option><option value="detailed">Detailed explanation</option></Select><Select label="Study level" value={level} disabled={busy} onChange={e => setLevel(e.target.value)}><option value="beginner">Beginner</option><option value="undergraduate">Undergraduate</option><option value="advanced">Advanced</option></Select></div>
        {!providers.length && !checking && <Link className="inline-flex min-h-[44px] items-center text-accent underline" to="/settings" onClick={close}>Set up AI connection</Link>}
        {courseId && !busy && <ReferenceImport key={courseId} courseId={courseId} />}
        <Field label="Find source excerpts" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setVisible(12) }} placeholder="Search saved reference material and syllabus text" />
        {!choices.length && <p className="text-sm text-ink-3">No matching source excerpts. Add reference material, or import a syllabus from the course page. A topic list alone cannot supply detailed teaching notes.</p>}
        <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-rule p-2">
          {choices.slice(0, visible).map(choice => {
            const selected = chosen.some(s => s.document_id === choice.document_id && s.title === choice.title)
            return <section key={choice.key} className="rounded border border-rule p-2">
              <p className="break-words text-sm font-semibold">{choice.title}</p>
              <p className="break-words text-xs text-ink-3">{choice.text.slice(0, 220)}{choice.text.length > 220 ? '…' : ''}</p>
              <Button size="sm" disabled={busy || selected || chosen.length >= 8} onClick={() => setChosen(rows => [...rows, { ...choice, id: `S${rows.length + 1}` }])}>{selected ? 'Selected' : 'Select excerpt'}</Button>
            </section>
          })}
          {choices.length > visible && <Button onClick={() => setVisible(n => n + 12)}>Show more excerpts</Button>}
        </div>
        <p role="status" className="text-sm">{chosen.length}/8 excerpts selected · {size.toLocaleString()}/24,000 characters to send to {provider === 'chatgpt' ? 'ChatGPT' : provider === 'groq' ? 'Groq' : 'Gemini'}</p>
        {chosen.map((source, i) => <section key={`${source.document_id}:${source.title}`} className="space-y-2 rounded border border-rule p-3">
          <p className="break-words text-sm font-semibold">[S{i + 1}] {source.title}</p>
          <TextArea label={`Text to send S${i + 1}`} rows={5} maxLength={8000} value={source.text} disabled={busy} onChange={e => setChosen(rows => rows.map((s, index) => index === i ? { ...s, text: e.target.value } : s))} />
          <Button size="sm" disabled={busy} onClick={() => setChosen(rows => rows.filter((_, index) => index !== i))}>Remove S{i + 1}</Button>
        </section>)}
        <p className="text-xs text-ink-3">Reference checks confirm source IDs and quoted text. Review the explanation yourself: a matching quotation does not prove every claim is correct. Generation needs an internet connection; stored drafts and source excerpts work offline.</p>
      </>}
    </div>
  </Modal>
}
