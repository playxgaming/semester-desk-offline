import { useMemo, useState } from 'react'
import { CalendarClock, RefreshCw, Wand2 } from 'lucide-react'
import { Badge, Bar, Button, Card, Dot, Empty, Note, PageHeader, Stat } from '@/components/ui'
import {
  useCourseMap,
  useCourses,
  useExceptions,
  useProfile,
  useSessions,
  useSlots,
  useTasks,
  useTopics,
} from '@/hooks/data'
import { buildPlan, catchUp, type PlanResult } from '@/lib/planner'
import { humanMinutes, prettyDay, today } from '@/lib/date'
import { patch, remove, saveProfile } from '@/db/mutate'
import { clearRebalance, lastRebalance, undoRebalance, replacePlanWindow, reschedule } from '@/lib/scheduler'
import { db, type StudySession } from '@/db/db'
import { useUi } from '@/store/ui'
import { StudyWindows } from '@/components/StudyWindows'

const HORIZONS = [7, 10, 14, 21]

export default function Planner() {
  const profile = useProfile()
  const courses = useCourses()
  const topics = useTopics()
  const tasks = useTasks()
  const slots = useSlots()
  const exceptions = useExceptions()
  const sessions = useSessions()
  const byId = useCourseMap()
  const notify = useUi((s) => s.notify)
  const [horizon, setHorizon] = useState(10)
  const [busy, setBusy] = useState(false)
  // an automated change you did not ask for should always be reversible
  const [moved, setMoved] = useState(() => lastRebalance())

  const preview: PlanResult = useMemo(
    () =>
      buildPlan({
        from: today(),
        days: horizon,
        capacityMin: profile.daily_capacity_min,
        studyWindows: profile.study_windows,
        term: profile,
        courses,
        topics,
        tasks,
        slots,
        exceptions,
        existing: sessions,
      }),
    [horizon, profile, courses, topics, tasks, slots, exceptions, sessions],
  )

  const key = today()
  const missed = sessions.filter((s) => s.status === 'planned' && s.date < key)
  const upcoming = sessions
    .filter((s) => s.date >= key)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, StudySession[]>()
  for (const s of upcoming) {
    const list = byDate.get(s.date) ?? []
    list.push(s)
    byDate.set(s.date, list)
  }

  async function writePlan() {
    if (busy) return
    setBusy(true)
    try {
      const through = preview.days[preview.days.length - 1]?.date
      if (!through) return
      await replacePlanWindow(key, through, preview.sessions)
      const reminderFailed = await reschedule().then(() => false, () => true)
      notify(`Planned ${preview.sessions.length} blocks over ${horizon} days.${reminderFailed ? ' Your plan is saved; retry reminders in Settings.' : ''}`, reminderFailed ? 'warn' : 'ok')
    } catch {
      notify('The plan could not be saved. Your previous blocks are unchanged.', 'crit')
    } finally {
      setBusy(false)
    }
  }

  async function runCatchUp() {
    if (!missed.length) return
    setBusy(true)
    try {
      // A preview is unsaved work. Catch up against the actual calendar,
      // otherwise a full preview prevents moving blocks into an empty day.
      const base = profile.study_windows !== undefined ? buildPlan({ from: key, days: horizon, capacityMin: profile.daily_capacity_min, studyWindows: profile.study_windows, term: profile, courses, topics: [], tasks: [], slots, exceptions, existing: sessions.map(s => ({ ...s, auto: false })) }) : preview
      const calendar = base.days.map((day) => ({ ...day, plannedMin: sessions.filter((s) => s.date === day.date && s.status !== 'skipped').reduce((sum, s) => sum + (s.status === 'done' ? s.actual_min : s.planned_min), 0) }))
      const deadlines = new Map(tasks.filter((t) => t.due_at).map((t) => [t.id, t.due_at!]))
      const { moved, dropped } = catchUp(missed, calendar, deadlines)
      await db.transaction('rw', [db.sessions], async () => {
        for (const s of moved) await patch('sessions', s.id, { date: s.date, starts_at: s.starts_at, ends_at: s.ends_at })
      })
      const reminderFailed = await reschedule().then(() => false, () => true)
      notify(
        (dropped.length
          ? `Moved ${moved.length} blocks forward. ${dropped.length} had nowhere to go.`
          : `Moved ${moved.length} missed blocks forward.`) + (reminderFailed ? ' Blocks are saved; retry reminders in Settings.' : ''),
        dropped.length || reminderFailed ? 'warn' : 'ok',
      )
    } catch {
      notify('Catch-up could not be saved. Your previous blocks are unchanged.', 'crit')
    } finally {
      setBusy(false)
    }
  }

  const tone =
    preview.diagnostics.verdict === 'overloaded'
      ? 'crit'
      : preview.diagnostics.verdict === 'tight'
        ? 'warn'
        : 'ok'

  return (
    <>
      <PageHeader
        eyebrow="Study engine"
        title="Planner"
        lede="It starts from what a day can actually hold, not from what needs doing. If the work does not fit, it says so instead of writing a Tuesday you were never going to execute."
        action={
          <div className="flex flex-wrap gap-2"><StudyWindows /><Button variant="primary" disabled={busy} onClick={() => void writePlan()}>
            <Wand2 size={15} /> Rebuild plan
          </Button></div>
        }
      />

      {moved && (
        <Note tone="accent" title="Moved overnight">
          <p className="mb-2">
            {moved.moves.length} block{moved.moves.length === 1 ? '' : 's'} you did not get to were
            pulled forward into the first days with room. Nothing was dropped.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const n = await undoRebalance()
                  setMoved(null)
                  const reminderFailed = await reschedule().then(() => false, () => true)
                  notify(`Put ${n} blocks back where they were.${reminderFailed ? ' Retry reminders in Settings.' : ''}`, 'warn')
                } catch {
                  notify('Could not undo catch-up. Your blocks are unchanged.', 'crit')
                }
              }}
            >
              Undo
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                clearRebalance()
                setMoved(null)
              }}
            >
              Keep it
            </Button>
          </div>
        </Note>
      )}

      <Card className="mb-5 flex flex-wrap items-end gap-4 p-4">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-ink-2">
            Daily capacity — {humanMinutes(profile.daily_capacity_min)}
          </span>
          <input
            type="range"
            min={30}
            max={480}
            step={15}
            value={profile.daily_capacity_min}
            className="w-[220px] accent-[color:var(--accent)]"
            onChange={(e) => void saveProfile({ daily_capacity_min: Number(e.target.value) })}
          />
        </label>
        <div>
          <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Horizon</span>
          <div className="flex gap-1">
            {HORIZONS.map((h) => (
              <Button
                key={h}
                size="sm"
                variant={h === horizon ? 'primary' : 'ghost'}
                onClick={() => setHorizon(h)}
              >
                {h}d
              </Button>
            ))}
          </div>
        </div>
        {missed.length > 0 && (
          <Button className="ml-auto" disabled={busy} onClick={() => void runCatchUp()}>
            <RefreshCw size={14} /> Catch up {missed.length} missed
          </Button>
        )}
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={humanMinutes(preview.diagnostics.demandMin)}
          label="Work outstanding"
          hint="topics + deadlines, on your estimates"
        />
        <Stat
          value={humanMinutes(preview.diagnostics.capacityMin)}
          label={`Capacity over ${horizon} days`}
          hint="reduced on heavy class days"
        />
        <Stat
          value={humanMinutes(preview.diagnostics.scheduledMin)}
          label="Fits in the window"
          tone={preview.diagnostics.shortfallMin ? 'warn' : 'ok'}
        />
        <Stat
          value={humanMinutes(preview.diagnostics.shortfallMin)}
          label="Does not fit"
          tone={preview.diagnostics.shortfallMin ? 'crit' : undefined}
          hint={preview.diagnostics.shortfallMin ? 'something has to give' : 'nothing left over'}
        />
      </div>

      <Note tone={tone} title={`Verdict: ${preview.diagnostics.verdict}`}>
        <p className="mb-2">{preview.diagnostics.message}</p>
        {preview.diagnostics.unplaceable.length > 0 && (
          <ul className="text-[13px]">
            {preview.diagnostics.unplaceable.slice(0, 5).map((u) => (
              <li key={u.label}>
                <b>{u.label}</b> — {humanMinutes(u.missingMin)} unplaced
                {u.dueDay ? ` before ${prettyDay(u.dueDay)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Note>

      <h2 className="mb-3 mt-6 text-[18px]">The next {horizon} days</h2>
      <p className="mb-3 text-[12.5px] text-ink-3">Rebuilding replaces untouched automatic blocks in this window. Manual, started, completed and later blocks stay.</p>

      {preview.days.some((d) => d.sessions.length) || upcoming.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {preview.days.map((d) => {
            const saved = byDate.get(d.date) ?? []
            const shown = saved.length ? saved : d.sessions
            const load = shown.reduce((s, x) => s + x.planned_min, 0)
            return (
              <Card key={d.date} className={d.date === key ? 'border-accent p-4' : 'p-4'}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-[14px]">{prettyDay(d.date)}</h3>
                  {saved.length ? <Badge tone="accent">planned</Badge> : <Badge>preview</Badge>}
                  <span className="ml-auto font-mono text-[11.5px] text-ink-3 tabnum">
                    {humanMinutes(load)} / {humanMinutes(d.capacityMin)}
                  </span>
                </div>
                <Bar
                  className="mb-3"
                  value={load / Math.max(1, d.capacityMin)}
                  tone={load > d.capacityMin ? 'crit' : load > d.capacityMin * 0.85 ? 'warn' : 'accent'}
                />
                {d.classMin > 0 && (
                  <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                    <CalendarClock size={12} /> {humanMinutes(d.classMin)} of classes
                  </p>
                )}
                {shown.length ? (
                  <ul className="-my-1">
                    {shown.map((s) => {
                      const c = s.course_id ? byId.get(s.course_id) : undefined
                      const topic = topics.find((t) => t.id === s.topic_id)
                      const task = tasks.find((t) => t.id === s.task_id)
                      return (
                        <li
                          key={s.id}
                          className="flex items-center gap-2 border-b border-rule py-2 text-[13px] last:border-0"
                        >
                          <Dot colour={c?.colour ?? 'var(--rule-2)'} />
                          <span className="min-w-0 flex-1 truncate">
                            {topic?.name ?? task?.title ?? 'Study'}
                          </span>
                          <span className="font-mono text-[11.5px] text-ink-3 tabnum">
                             {s.starts_at && s.ends_at ? `${new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ` : ''}{humanMinutes(s.planned_min)}
                          </span>
                          {saved.length ? (
                            s.status === 'done' ? (
                              <Badge tone="ok">done</Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() =>
                                  void patch('sessions', s.id, {
                                    status: 'done',
                                    actual_min: s.planned_min,
                                  })
                                }
                              >
                                Done
                              </Button>
                            )
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="py-2 text-[12.5px] text-ink-3">Nothing scheduled.</p>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty
          title="Nothing to schedule yet"
          action={
            <Button variant="primary" onClick={() => void writePlan()}>
              Build a plan
            </Button>
          }
        >
          Add topics to your courses with effort estimates, or deadlines with estimated effort. The
          planner needs something to place.
        </Empty>
      )}

      <Card className="mt-6 p-4 text-[13px] text-ink-2">
        <b className="mb-1 block font-display text-[14px] text-ink">How it decides</b>
        Work is ranked by urgency × weight, then dealt out round-robin across each day in 45-minute
        blocks, capped at 90 minutes per topic per day. Interleaving beats blocking for retention, and
        it stops one heavy topic from eating a whole evening. A day with more than five hours of class
        gets 60% of your usual capacity. Enable Study hours for exact start/end times and deadline-time checks. Capacity-only plans reserve minutes by date. Work that does not fit is reported as unplaced.
        <span className="mt-2 block">
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              try {
                await db.transaction('rw', [db.sessions], async () => {
                  const auto = sessions.filter((s) => s.auto && s.status === 'planned' && s.actual_min === 0)
                  for (const s of auto) await remove('sessions', s.id)
                })
                const reminderFailed = await reschedule().then(() => false, () => true)
                notify(`Cleared untouched auto-planned blocks.${reminderFailed ? ' Retry reminders in Settings.' : ''}`, 'warn')
              } catch {
                notify('Blocks could not be cleared. Your previous blocks are unchanged.', 'crit')
              }
            }}
          >
            Clear planned blocks
          </Button>
        </span>
      </Card>
    </>
  )
}
