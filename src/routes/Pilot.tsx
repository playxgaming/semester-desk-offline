import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { db, type QualityReview, type QualitySnapshot } from '@/db/db'
import { saveQualityReview } from '@/db/quality'
import { QUALITY_CHECKS, qualitySnapshot, qualityStatus, sameQualitySnapshot } from '@/lib/quality'
import { download } from '@/lib/backup'
import { Badge, Button, Card, Modal, PageHeader, Select, TextArea } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { useUi } from '@/store/ui'

type Target = { key: string; type: 'note' | 'document'; id: string; snapshot: QualitySnapshot; course: string | null; generated: boolean }
type Draft = { target: Target; verdict: QualityReview['verdict']; checks: QualityReview['checks']; issues: string }
const initialChecks = (): QualityReview['checks'] => ({ accuracy: 'na', coverage: 'na', readability: 'na', sources: 'na' })

export default function Pilot() {
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const notify = useUi(s => s.notify)
  const data = useLiveQuery(() => db.transaction('r', [db.notes, db.course_documents, db.quality_reviews, db.courses], async () => {
    const [notes, docs, reviews, courses] = await Promise.all([db.notes.toArray(), db.course_documents.toArray(), db.quality_reviews.toArray(), db.courses.toArray()])
    const targets: Target[] = [
      ...notes.filter(n => !n.deleted_at).map(n => ({ key: `note:${n.id}`, type: 'note' as const, id: n.id, snapshot: qualitySnapshot('note', n), course: n.course_id, generated: Boolean(n.ai_provenance) })),
      ...docs.filter(d => !d.deleted_at).map(d => ({ key: `document:${d.id}`, type: 'document' as const, id: d.id, snapshot: qualitySnapshot('document', d), course: d.course_id, generated: d.extraction === 'ocr' })),
    ]
    return { targets, reviews: reviews.filter(r => !r.deleted_at).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || b.id.localeCompare(a.id)), courses }
  }), [])
  if (!data) return <p role="status">Loading local quality reviews…</p>
  const latest = (target: Target) => data.reviews.find(r => `${r.target_type}:${r.target_id}` === target.key)
  const visible = data.targets.filter(t => filter === 'all' || (filter === 'generated' ? t.generated : qualityStatus(t.snapshot, latest(t)) !== 'Usable'))
  const selected = data.targets.find(t => t.key === params.get('item'))
  const history = selected ? data.reviews.filter(r => `${r.target_type}:${r.target_id}` === selected.key) : []
  const courseName = (id: string | null) => data.courses.find(c => c.id === id)?.code ?? 'Unassigned'
  const open = (target: Target) => { setError(''); setDraft({ target: structuredClone(target), verdict: 'needs_changes', checks: initialChecks(), issues: '' }) }
  const exportReport = () => download(`semester-desk-quality-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({
    app: 'semester-desk', report_version: 1, exported_at: new Date().toISOString(),
    method: 'Manual student reviews. No automatic factual-accuracy certification. Contains reviewed content and source context; share deliberately.',
    items: data.targets.map(t => ({ type: t.type, id: t.id, title: t.snapshot.title, course: courseName(t.course), status: qualityStatus(t.snapshot, latest(t)), latest_review_id: latest(t)?.id ?? null })),
    reviews: data.reviews,
  }, null, 2))

  return <>
    <PageHeader eyebrow="Browser pilot" title="Quality reviews" lede="Check your real course notes and extracted text against the original material. Record what works and what needs correcting, entirely on this device." action={<Button onClick={exportReport}>Export review report</Button>} />
    <p className="mb-4 text-sm text-ink-3">{data.targets.filter(t => qualityStatus(t.snapshot, latest(t)) === 'Usable').length} of {data.targets.length} items marked usable for their current content. A usable verdict requires all four manual checks. Edited content needs a fresh review. Reports contain reviewed text and source context.</p>
    <Select label="Show items" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All notes and documents</option><option value="generated">AI notes and OCR documents</option><option value="attention">Needs review or correction</option></Select>
    <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        {!visible.length && <p>No matching items. Add a note or import course material to begin.</p>}
        {visible.map(t => <Card key={t.key} className="p-3">
          <Badge>{qualityStatus(t.snapshot, latest(t))}</Badge><h2 className="my-2 break-words font-semibold">{t.snapshot.title || 'Untitled'}</h2>
          <p className="mb-2 text-xs text-ink-3">{courseName(t.course)} · {t.type}{t.generated ? ' · AI / OCR' : ''}</p>
          <Button onClick={() => setParams({ item: t.key })}>Inspect item</Button>
        </Card>)}
      </div>
      <div className="min-w-0 space-y-3">
        {!selected ? <Card className="p-4"><p>Select an item to inspect its saved content and review history.</p>{params.has('item') && <p className="mt-2 text-sm text-ink-3">The linked item is unavailable or in Trash.</p>}</Card> : <>
          <Card className="min-w-0 p-4">
            <h2 className="break-words text-lg font-semibold">{selected.snapshot.title || 'Untitled'}</h2><p className="my-2 text-sm">{qualityStatus(selected.snapshot, history[0])}</p>
            <div className="mb-3 flex flex-wrap items-center gap-3"><Button disabled={!selected.snapshot.body.trim()} onClick={() => open(selected)}>Review this content</Button>
              <Link className="inline-flex min-h-[44px] items-center text-sm text-accent underline" to={selected.type === 'note' ? '/notes' : `/courses/${selected.course}`} onClick={() => { if (selected.type === 'note') try { localStorage.setItem('semester-desk:notes:selected', selected.id) } catch { /* area still opens */ } }}>Open original item</Link></div>
            <Content snapshot={selected.snapshot} type={selected.type} />
          </Card>
          <h3 className="font-semibold">Review history ({history.length})</h3>
          {history.map(review => <Card key={review.id} className="min-w-0 p-3">
            <p className="text-sm font-semibold">{review.verdict.replace('_', ' ')} · {new Date(review.reviewed_at).toLocaleString()}</p>
            <p className="my-2 text-xs text-ink-3">{sameQualitySnapshot(selected.snapshot, review.snapshot) ? 'Matches current content' : 'Older content — see saved snapshot'}</p>
            <ul className="mb-2 text-xs">{Object.entries(QUALITY_CHECKS).map(([key, label]) => <li key={key}>{label}: {review.checks[key as keyof QualityReview['checks']]}</li>)}</ul>
            <p className="whitespace-pre-wrap break-words text-sm">{review.issues || 'No issues recorded.'}</p>
            <SavedContent review={review} />
          </Card>)}
        </>}
      </div>
    </div>
    <Modal open={Boolean(draft)} onClose={() => { if (!busy) setDraft(null) }} title="Review course content" wide>
      {draft && <div className="space-y-3">
        <p className="text-sm text-ink-3">Compare this saved version with your original syllabus, textbook or lecture material. Check facts and formulas yourself. This review records your judgement; it makes no AI request.</p>
        <details><summary className="min-h-[44px] cursor-pointer py-2">Content being reviewed: {draft.target.snapshot.title}</summary><Content snapshot={draft.target.snapshot} type={draft.target.type} /></details>
        {Object.entries(QUALITY_CHECKS).map(([key, label]) => <Select key={key} label={label} disabled={busy} value={draft.checks[key as keyof QualityReview['checks']]} onChange={e => setDraft({ ...draft, checks: { ...draft.checks, [key]: e.target.value } })}><option value="na">Not checked / not applicable</option><option value="pass">Pass — checked manually</option><option value="fail">Fail — correction needed</option></Select>)}
        <Select label="Verdict" disabled={busy} value={draft.verdict} onChange={e => setDraft({ ...draft, verdict: e.target.value as Draft['verdict'] })}><option value="needs_changes">Needs changes</option><option value="rejected">Rejected</option><option value="usable">Usable — all checks passed</option></Select>
        <TextArea label="Issues and corrections" rows={4} maxLength={5000} disabled={busy} value={draft.issues} onChange={e => setDraft({ ...draft, issues: e.target.value })} />
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
        <Button variant="primary" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await saveQualityReview({ target_type: draft.target.type, target_id: draft.target.id, verdict: draft.verdict, checks: draft.checks, issues: draft.issues.trim() }, draft.target.snapshot); setDraft(null); notify('Quality review saved locally.', 'ok') }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not save review. Try again.') }
          finally { setBusy(false) }
        }}>{busy ? 'Saving…' : 'Save quality review'}</Button>
      </div>}
    </Modal>
  </>
}

function SavedContent({ review }: { review: QualityReview }) {
  const [open, setOpen] = useState(false)
  return <details className="mt-2" onToggle={e => setOpen(e.currentTarget.open)}><summary className="min-h-[44px] cursor-pointer py-2 text-sm">Exact reviewed content</summary>{open && <Content snapshot={review.snapshot} type={review.target_type} />}</details>
}

function Content({ snapshot, type }: { snapshot: QualitySnapshot; type: 'note' | 'document' }) {
  const context = JSON.parse(snapshot.context)
  const sources: { title: string; text: string; page?: number }[] = context.provenance?.sources ?? []
  const pages: { number: number; text: string }[] = context.pages ?? []
  return <div className="min-w-0 space-y-3 overflow-hidden">
    {type === 'note' ? <Markdown source={snapshot.body} /> : <pre className="whitespace-pre-wrap break-words font-sans text-sm">{snapshot.body}</pre>}
    <details><summary className="min-h-[44px] cursor-pointer py-2 text-sm">Saved sources and extraction context</summary>
      {context.provenance && <p className="mb-2 text-xs text-ink-3">Generated with {context.provenance.provider} · {context.provenance.model}. These are the excerpts provided for generation.</p>}
      {sources.map((s, i) => <section key={i} className="mb-3"><h4 className="break-words text-sm font-semibold">{s.title}{s.page ? ` · Page ${s.page}` : ''}</h4><pre className="whitespace-pre-wrap break-words font-sans text-sm">{s.text}</pre></section>)}
      {pages.map(p => <section key={p.number} className="mb-3"><h4 className="text-sm font-semibold">Original extraction · Page {p.number}</h4><pre className="whitespace-pre-wrap break-words font-sans text-sm">{p.text}</pre></section>)}
      {!sources.length && !pages.length && <p className="text-sm text-ink-3">No saved source excerpts. Open the original course material separately to verify this content.</p>}
      {context.extraction === 'ocr' && <p className="text-sm text-ink-3">Text recognized locally with OCR. Compare with the original file from the course page.</p>}
    </details>
  </div>
}
