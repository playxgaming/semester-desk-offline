import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Field, Note, Panel } from './ui'
import { db, type QuizAttempt } from '@/db/db'
import { alive } from '@/db/mutate'
import { planQuizRevision, questionCorrect } from '@/db/quizzes'
import { today, prettyDateTime } from '@/lib/date'
import { useUi } from '@/store/ui'
import { Markdown } from './Markdown'
export function QuizArchive({ onResume }: { onResume: (attempt: QuizAttempt) => void }) {
  const attempts = useLiveQuery(async () => alive(await db.quiz_attempts.toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at)), []) ?? []
  const [date, setDate] = useState(today()), [busy, setBusy] = useState(false)
  const notify = useUi(s => s.notify)
  if (!attempts.length) return null
  return <Panel title="Quiz history and revision" sub="Saved on this device">
    <Field label="Revision date" type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} />
    {attempts.slice(0, 20).map(attempt => {
      const wrong = attempt.questions.filter(q => !questionCorrect(q, attempt.answers[q.id]))
      return <details key={attempt.id} className="mt-3 rounded border border-rule p-3"><summary className="min-h-[44px] cursor-pointer text-sm">{prettyDateTime(attempt.started_at)} · {attempt.completed_at ? `${attempt.questions.length - wrong.length}/${attempt.questions.length} correct` : `${attempt.position}/${attempt.questions.length} answered — unfinished`}</summary>
        {!attempt.completed_at ? <Button onClick={() => onResume(attempt)}>Resume unfinished quiz</Button> : <>
          {wrong.map(q => <div key={q.id} className="my-2 break-words border-b border-rule py-2 text-sm"><Markdown className="font-semibold" source={q.prompt} /><p className="mt-2 text-xs font-semibold">Answer</p><Markdown source={q.card.back} /><p className="text-ink-3">Your answer: {q.kind === 'choice' && typeof attempt.answers[q.id] === 'number' ? q.options[attempt.answers[q.id] as number] : attempt.answers[q.id] ? 'Recalled' : 'Did not recall'}</p></div>)}
          {wrong.length > 0 && <><Note>Proposal: one 20-minute revision block per missed topic (or course for unlinked cards). Add only if this suits your day; these are untimed blocks, and duplicates from this attempt are skipped.</Note><Button disabled={busy} onClick={async () => {
            setBusy(true)
            try { const count = await planQuizRevision(attempt.id, date); notify(`${count} revision blocks added to Planner. Existing blocks were preserved.`, 'ok') }
            catch (e) { notify(e instanceof Error ? e.message : 'Could not save revision blocks', 'crit') }
            finally { setBusy(false) }
          }}>Add revision blocks</Button></>}
        </>}
      </details>
    })}
  </Panel>
}
