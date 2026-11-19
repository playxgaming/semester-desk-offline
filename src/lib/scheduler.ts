import { db, type StudySession } from '@/db/db'
import { alive, ensureProfile, put, remove } from '@/db/mutate'
import { DATA_CHANGED } from '@/db/events'
import { useUi } from '@/store/ui'
import { applySchedule, buildSchedule, permissionState, isNative } from './notify'
import { dayKey, today as localToday } from './date'
import { slotsOnDate } from '@/db/attendance'
import { minuteOfDay } from './availability'

/**
 * Rebuild the device's reminder schedule from whatever is currently in the
 * database. Called on launch, after the planner writes a week, and from the
 * Settings button — it is cheap and idempotent, so calling it more often than
 * necessary costs nothing.
 */
async function scheduleOnce(): Promise<{ scheduled: number; native: boolean }> {
  if ((await permissionState()) !== 'granted') return { scheduled: 0, native: false }

  const [profile, courses, slots, tasks, sessions, cards, attendance, exceptions] = await Promise.all(
    [
      ensureProfile(),
      db.courses.toArray(),
      db.timetable_slots.toArray(),
      db.tasks.toArray(),
      db.sessions.toArray(),
      db.cards.toArray(),
      db.attendance.toArray(),
      db.timetable_exceptions.toArray(),
    ],
  )

  const planned = buildSchedule({
    profile,
    courses: alive(courses),
    slots: alive(slots),
    tasks: alive(tasks),
    sessions: alive(sessions),
    cards: alive(cards),
    attendance: alive(attendance),
    exceptions: alive(exceptions),
  })

  return applySchedule(planned)
}

let activeRefresh: Promise<{ scheduled: number; native: boolean }> | null = null
let refreshAgain = false

/** Serialize native schedule changes; changes arriving during a refresh get a fresh snapshot. */
export function reschedule(): Promise<{ scheduled: number; native: boolean }> {
  refreshAgain = true
  if (!activeRefresh) activeRefresh = (async () => {
    let result = { scheduled: 0, native: false }
    do { refreshAgain = false; result = await scheduleOnce() } while (refreshAgain)
    return result
  })().finally(() => { activeRefresh = null })
  return activeRefresh
}

export function startReminderRefresh(): () => void {
  if (!isNative()) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const tables = new Set(['profiles', 'courses', 'timetable_slots', 'timetable_exceptions', 'tasks', 'sessions', 'cards', 'attendance'])
  const changed = (event: Event) => {
    if (!tables.has((event as CustomEvent<string>).detail)) return
    clearTimeout(timer)
    timer = setTimeout(() => void reschedule().catch(() => {
      useUi.getState().notify('Your changes were saved, but reminders could not be refreshed. Retry in Settings.', 'warn')
    }), 600)
  }
  window.addEventListener(DATA_CHANGED, changed)
  return () => { clearTimeout(timer); window.removeEventListener(DATA_CHANGED, changed) }
}

/** Replace only untouched auto blocks inside the preview, as one local commit. */
export async function replacePlanWindow(from: string, through: string, replacements: StudySession[]): Promise<void> {
  if (from > through || replacements.some(s => s.date < from || s.date > through)) {
    throw new Error('The plan contains a block outside its preview window.')
  }
  await db.transaction('rw', [db.sessions, db.tasks, db.timetable_slots, db.timetable_exceptions, db.profiles, db.courses], async () => {
    // Read inside the transaction: a block completed since preview must survive.
    const current = alive(await db.sessions.where('date').between(from, through, true, true).toArray())
    const stale = current.filter(s => s.auto && s.status === 'planned' && s.actual_min === 0)
    const preserved = current.filter(s => !stale.some(old => old.id === s.id))
    const [tasks, slots, exceptions, profile, courses] = await Promise.all([db.tasks.toArray(), db.timetable_slots.toArray(), db.timetable_exceptions.toArray(), db.profiles.get('me'), db.courses.toArray()])
    const active = new Set(courses.filter(c => !c.deleted_at && !c.archived).map(c => c.id))
    const checked: StudySession[] = []
    for (const row of replacements) {
      if (preserved.some(s => s.id === row.id)) throw new Error('A preview block now contains saved work. Rebuild the preview.')
      if (row.starts_at && row.ends_at) {
        const start = new Date(row.starts_at), end = new Date(row.ends_at)
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || dayKey(start) !== row.date || dayKey(end) !== row.date) throw new Error('The preview contains an invalid timed block.')
        const task = tasks.find(t => t.id === row.task_id && !t.deleted_at)
        if (task?.due_at && end > new Date(task.due_at)) throw new Error('A deadline changed after preview. Rebuild before saving.')
        if ([...preserved, ...checked].some(s => (!s.course_id || active.has(s.course_id)) && s.status !== 'skipped' && s.starts_at && s.ends_at && new Date(s.starts_at) < end && new Date(s.ends_at) > start)) throw new Error('A saved block changed after preview. Rebuild to avoid overlapping work.')
        const a = start.getHours() * 60 + start.getMinutes(), b = end.getHours() * 60 + end.getMinutes()
        if (profile?.study_windows && !profile.study_windows.some(w => w.weekday === start.getDay() && minuteOfDay(w.start) <= a && minuteOfDay(w.end) >= b)) throw new Error('Study hours changed after preview. Rebuild before saving.')
        if (slotsOnDate(slots.filter(s => active.has(s.course_id)), row.date, exceptions, profile).some(s => minuteOfDay(s.start) < b && minuteOfDay(s.end) > a)) throw new Error('A class now overlaps this preview. Rebuild before saving.')
      }
      checked.push(row)
    }
    for (const s of stale) await remove('sessions', s.id)
    for (const s of replacements) await put('sessions', s)
  })
}

export interface RebalanceRecord {
  at: string
  moves: { id: string; from: string; to: string; starts_at?: string; ends_at?: string }[]
}

const LAST_REBALANCE = 'semester-desk:last-rebalance'

/** What the overnight pass moved, so the planner can offer to undo it. */
export function lastRebalance(): RebalanceRecord | null {
  try {
    const raw = localStorage.getItem(LAST_REBALANCE)
    if (!raw) return null
    const rec = JSON.parse(raw) as RebalanceRecord
    return rec.moves?.length ? rec : null
  } catch {
    return null
  }
}

export function clearRebalance() {
  try {
    localStorage.removeItem(LAST_REBALANCE)
  } catch {
    /* ignore */
  }
}

/** Put every moved block back where it was. */
export async function undoRebalance(): Promise<number> {
  const rec = lastRebalance()
  if (!rec) return 0
  const { patch } = await import('@/db/mutate')
  await db.transaction('rw', [db.sessions], async () => {
    for (const m of rec.moves) await patch('sessions', m.id, { date: m.from, starts_at: m.starts_at, ends_at: m.ends_at })
  })
  clearRebalance()
  return rec.moves.length
}

/**
 * Yesterday's unfinished blocks move forward on their own, so the morning
 * brief is already correct when it fires. Runs once per day at launch — and
 * because an automated change you did not ask for should always be
 * reversible, it records exactly what it moved.
 */
export async function overnightRebalance(): Promise<number> {
  const KEY = 'semester-desk:rebalanced'
  const today = localToday()
  try {
    if (localStorage.getItem(KEY) === today) return 0
  } catch {
    /* private mode — just do the work */
  }

  const [sessionsRaw, profile] = await Promise.all([db.sessions.toArray(), ensureProfile()])
  // Timed plans require an explicit preview; automatic date-only moves would invalidate their times.
  if (profile.study_windows !== undefined) return 0
  const sessions = alive(sessionsRaw)
  const missed = sessions.filter((s) => s.status === 'planned' && s.date < today)
  if (!missed.length) {
    try {
      localStorage.setItem(KEY, today)
    } catch {
      /* ignore */
    }
    return 0
  }

  const { buildPlan, catchUp } = await import('./planner')
  const [courses, topics, tasks, slots, exceptions] = await Promise.all([
    db.courses.toArray(),
    db.topics.toArray(),
    db.tasks.toArray(),
    db.timetable_slots.toArray(),
    db.timetable_exceptions.toArray(),
  ])

  const plan = buildPlan({
    from: today,
    days: 10,
    capacityMin: profile.daily_capacity_min,
    term: profile,
    courses: alive(courses),
    topics: alive(topics),
    tasks: alive(tasks),
    slots: alive(slots),
    exceptions: alive(exceptions),
    existing: sessions,
  })

  const before = new Map(missed.map((s) => [s.id, s.date]))
  const active = new Set(alive(courses).filter((c) => !c.archived).map((c) => c.id))
  const calendar = plan.days.map((day) => ({ ...day, plannedMin: sessions.filter((s) => s.date === day.date && s.status !== 'skipped' && (!s.course_id || active.has(s.course_id))).reduce((sum, s) => sum + (s.status === 'done' ? s.actual_min : s.planned_min), 0) }))
  const deadlines = new Map(alive(tasks).filter((t) => t.due_at).map((t) => [t.id, dayKey(t.due_at!)]))
  const { moved } = catchUp(missed.filter((s) => !s.course_id || active.has(s.course_id)), calendar, deadlines)
  const { patch } = await import('@/db/mutate')
  await db.transaction('rw', [db.sessions], async () => {
      for (const s of moved) await patch('sessions', s.id, { date: s.date, starts_at: s.starts_at, ends_at: s.ends_at })
  })

  if (moved.length) {
    try {
      localStorage.setItem(
        LAST_REBALANCE,
        JSON.stringify({
          at: new Date().toISOString(),
          moves: moved.map((s) => ({ id: s.id, from: before.get(s.id) ?? s.date, to: s.date, starts_at: sessions.find(old => old.id === s.id)?.starts_at, ends_at: sessions.find(old => old.id === s.id)?.ends_at })),
        } satisfies RebalanceRecord),
      )
    } catch {
      /* the move still happened; only the undo is lost */
    }
  }

  try {
    localStorage.setItem(KEY, today)
  } catch {
    /* ignore */
  }
  return moved.length
}
