import { useState } from 'react'
import { Badge, Button, Check, Note, TextArea } from '@/components/ui'
import { describe, extractCards } from '@/lib/extract'
import { put } from '@/db/mutate'
import { db } from '@/db/db'
import { uid } from '@/lib/id'
import { useUi } from '@/store/ui'

/**
 * Turn a note into candidate cards. Nothing enters the deck until it is
 * ticked, which is why a heuristic is good enough here — you are reading
 * every card either way.
 */
export function CardExtractor({
  markdown,
  courseId,
  topicId,
  onDone,
}: {
  markdown: string
  courseId: string | null
  topicId: string | null
  onDone: () => void
}) {
  const notify = useUi((s) => s.notify)
  const [candidates, setCandidates] = useState(() => extractCards(markdown))
  const [rejected, setRejected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const accepted = candidates.filter((_, i) => !rejected.has(i))

  function toggle(i: number) {
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function commit() {
    if (accepted.some(c => !c.front.trim() || !c.back.trim())) { notify('Every selected card needs a question and answer.', 'warn'); return }
    setBusy(true)
    try {
      await db.transaction('rw', db.cards, async () => {
        for (const c of accepted) {
          await put('cards', {
            id: uid(),
            user_id: null,
            updated_at: '',
            deleted_at: null,
            course_id: courseId,
            topic_id: topicId,
            front: c.front,
            back: c.back,
            ease: 2.5,
            interval: 0,
            reps: 0,
            due_at: new Date().toISOString(),
            lapses: 0,
            suspended: false,
            is_formula: c.isFormula,
          })
        }
      })
      notify(`${accepted.length} card${accepted.length === 1 ? '' : 's'} added to the deck`)
      onDone()
    } catch {
      notify('Cards could not be saved. No cards were imported; free some storage and retry.', 'crit')
    } finally {
      setBusy(false)
    }
  }

  if (!candidates.length) {
    return (
      <>
        <Note tone="warn" title="Nothing found">
          {describe(candidates)}
        </Note>
        <Button onClick={onDone}>Close</Button>
      </>
    )
  }

  return (
    <>
      <Note tone="accent" title={`${accepted.length} of ${candidates.length} selected`}>
        {describe(candidates)}
      </Note>

      <ul className="space-y-2">
        {candidates.map((c, i) => {
          const off = rejected.has(i)
          return (
            <li
              key={i}
              className={`rounded border p-3 transition ${
                off ? 'border-dashed border-rule bg-transparent opacity-55' : 'border-rule bg-surface'
              }`}
            >
              <div className="flex items-start gap-3">
                <Check
                  className="mt-3"
                  checked={!off}
                  disabled={busy}
                  label={`Keep card: ${c.front}`}
                  onChange={() => toggle(i)}
                />
                <div className="min-w-0 flex-1">
                  <TextArea label={`Card question ${i + 1}`} rows={2} value={c.front} disabled={busy} onChange={e => setCandidates(rows => rows.map((row, index) => index === i ? { ...row, front: e.target.value } : row))} />
                  <TextArea label={`Card answer ${i + 1}`} rows={3} value={c.back} disabled={busy} onChange={e => setCandidates(rows => rows.map((row, index) => index === i ? { ...row, back: e.target.value } : row))} />
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{c.rule}</Badge>
                    {c.isFormula ? <Badge tone="accent">formula</Badge> : null}
                    {c.section ? <Badge>{c.section}</Badge> : null}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="sticky bottom-0 -mx-5 mt-4 flex flex-wrap gap-2 border-t border-rule bg-surface px-5 py-3">
        <Button variant="primary" disabled={!accepted.length || busy} onClick={() => void commit()}>
          Add {accepted.length} card{accepted.length === 1 ? '' : 's'}
        </Button>
        <Button disabled={busy} onClick={onDone}>Cancel</Button>
        <Button
          className="ml-auto"
          disabled={busy}
          onClick={() => setRejected(rejected.size ? new Set() : new Set(candidates.map((_, i) => i)))}
        >
          {rejected.size ? 'Select all' : 'Select none'}
        </Button>
      </div>
    </>
  )
}
