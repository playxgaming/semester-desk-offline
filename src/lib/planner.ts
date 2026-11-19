import type { Course, StudySession, StudyTask, TimetableException, TimetableSlot, Topic } from '@/db/db'
import { slotsOnDate } from '@/db/attendance'
import { addDays, dayKey, differenceInCalendarDays, durationMin, parseDay, parseISO } from './date'
import { uid } from './id'
import { atMinute, minuteOfDay, subtractRanges, type StudyWindow } from './availability'

/**
 * The load-aware planner.
 *
 * v1's scheduler failed because it wrote days it could never execute: it
 * spread work evenly and ignored both the timetable and the fact that a day
 * has a ceiling. This one starts from capacity and refuses to exceed it. If
 * the work does not fit, it says so instead of quietly writing a 9-hour
 * Tuesday — `diagnostics.shortfallMin` is the number that matters.
 */

export const BLOCK_MIN = 45
export const MAX_BLOCK_MIN = 90
/** Beyond this much class time a day is treated as already loaded. */
const HEAVY_CLASS_MIN = 300
const HEAVY_DAY_FACTOR = 0.6

export interface PlanInput {
  from: string
  days: number
  capacityMin: number
  courses: Course[]
  topics: Topic[]
  tasks: StudyTask[]
  slots: TimetableSlot[]
  exceptions?: TimetableException[]
  /** Sessions already on the calendar: manual ones are respected, auto ones replaced. */
  existing: StudySession[]
  term?: { term_start: string; term_end: string }
  now?: Date
  studyWindows?: StudyWindow[]
}

interface WorkItem {
  kind: 'topic' | 'task'
  id: string
  courseId: string | null
  label: string
  remainingMin: number
  dueDay: string | null
  dueAt?: string | null
  weight: number
  score: number
}

export interface PlannedDay {
  date: string
  capacityMin: number
  classMin: number
  fixedMin: number
  plannedMin: number
  sessions: StudySession[]
  freeRanges?: [number, number][]
}

export interface PlanDiagnostics {
  demandMin: number
  capacityMin: number
  scheduledMin: number
  shortfallMin: number
  unplaceable: { label: string; dueDay: string | null; missingMin: number }[]
  verdict: 'comfortable' | 'tight' | 'overloaded'
  message: string
}

export interface PlanResult {
  days: PlannedDay[]
  sessions: StudySession[]
  diagnostics: PlanDiagnostics
}

function classMinutesOn(date: string, slots: TimetableSlot[], exceptions: TimetableException[] = [], term?: PlanInput['term']): number {
  return slotsOnDate(slots, date, exceptions, term).reduce((sum, s) => sum + durationMin(s.start, s.end), 0)
}

function priority(dueDay: string | null, weight: number, from: Date): number {
  const urgency = dueDay
    ? 1 / Math.max(1, differenceInCalendarDays(parseDay(dueDay), from) + 1)
    : 0.05
  return urgency * 100 + weight
}

export function buildWorkItems(input: PlanInput): WorkItem[] {
  const now = input.now ?? new Date()
  const items: WorkItem[] = []
  const active = new Set(input.courses.filter((c) => !c.deleted_at && !c.archived).map((c) => c.id))

  const doneByTask = new Map<string, number>()
  const doneByTopic = new Map<string, number>()
  for (const s of input.existing) {
    if (s.deleted_at || s.status === 'skipped' || s.actual_min <= 0) continue
    if (s.task_id) doneByTask.set(s.task_id, (doneByTask.get(s.task_id) ?? 0) + s.actual_min)
    if (s.topic_id) doneByTopic.set(s.topic_id, (doneByTopic.get(s.topic_id) ?? 0) + s.actual_min)
  }

  for (const t of input.tasks) {
    if (t.status === 'done' || t.deleted_at || (t.course_id && !active.has(t.course_id))) continue
    const remaining = Math.max(0, t.est_minutes - (doneByTask.get(t.id) ?? 0))
    if (remaining < 10) continue
    const dueDay = t.due_at ? dayKey(parseISO(t.due_at)) : null
    items.push({
      kind: 'task',
      id: t.id,
      courseId: t.course_id,
      label: t.title,
      remainingMin: remaining,
      dueDay,
      dueAt: t.due_at,
      weight: t.weight_pct,
      score: priority(dueDay, t.weight_pct * 1.5, now),
    })
  }

  const nextExamByCourse = new Map<string, string>()
  for (const t of input.tasks) {
    if (!t.course_id || !t.due_at || t.status === 'done' || t.deleted_at || (t.type !== 'exam' && t.type !== 'quiz')) continue
    const d = dayKey(parseISO(t.due_at))
    if (d < input.from) continue
    const cur = nextExamByCourse.get(t.course_id)
    if (!cur || d < cur) nextExamByCourse.set(t.course_id, d)
  }

  for (const tp of input.topics) {
    if (tp.deleted_at || tp.confidence >= 3 || !active.has(tp.course_id)) continue
    const gap = (3 - tp.confidence) / 3
    const remaining = Math.max(0, Math.round(tp.est_minutes * gap) - (doneByTopic.get(tp.id) ?? 0))
    if (remaining < 10) continue
    const dueDay = nextExamByCourse.get(tp.course_id) ?? null
    const dueAt = input.tasks.filter(t => t.course_id === tp.course_id && t.due_at && t.status !== 'done' && !t.deleted_at && (t.type === 'exam' || t.type === 'quiz') && dayKey(t.due_at) === dueDay).map(t => t.due_at!).sort()[0]
    const weight = (tp.exam_critical ? 30 : 10) * gap
    items.push({
      kind: 'topic',
      id: tp.id,
      courseId: tp.course_id,
      label: tp.name,
      remainingMin: remaining,
      dueDay,
      dueAt,
      weight,
      score: priority(dueDay, weight, now),
    })
  }

  return items.sort((a, b) => b.score - a.score)
}

export function buildPlan(input: PlanInput): PlanResult {
  const now = input.now ?? new Date()
  const items = buildWorkItems(input)
  const start = parseDay(input.from)

  // manual sessions hold their slot; auto ones are ours to rewrite
  const fixed = input.existing.filter((s) => (!s.auto || s.actual_min > 0) && s.status === 'planned' && !s.deleted_at)

  const days: PlannedDay[] = []
  for (let i = 0; i < input.days; i++) {
    const date = dayKey(addDays(start, i))
    const classMin = classMinutesOn(date, input.slots.filter(s => input.courses.some(c => c.id === s.course_id && !c.deleted_at && !c.archived)), input.exceptions, input.term)
    const base = input.capacityMin
    let capacityMin = Math.round(classMin > HEAVY_CLASS_MIN ? base * HEAVY_DAY_FACTOR : base)
    const completedMin = input.existing.filter((s) => s.date === date && s.status === 'done' && !s.deleted_at).reduce((sum, s) => sum + s.actual_min, 0)
    const fixedMin = completedMin + fixed.filter((s) => s.date === date).reduce((sum, s) => sum + Math.max(s.planned_min, s.actual_min), 0)
    let freeRanges: [number, number][] | undefined
    if (input.studyWindows !== undefined) {
      const weekday = parseDay(date).getDay()
      const windows = input.studyWindows.filter(w => w.weekday === weekday).map(w => [minuteOfDay(w.start), minuteOfDay(w.end)] as [number, number]).sort((a, b) => a[0] - b[0])
      const classes = slotsOnDate(input.slots.filter(s => input.courses.some(c => c.id === s.course_id && !c.archived && !c.deleted_at)), date, input.exceptions, input.term).map(s => [minuteOfDay(s.start), minuteOfDay(s.end)] as [number, number])
      const anchored = input.existing.filter(s => !s.deleted_at && s.date === date && s.status !== 'skipped' && (!s.auto || s.actual_min > 0 || s.status === 'done') && s.starts_at && s.ends_at).map(s => {
        const start = parseISO(s.starts_at!), end = parseISO(s.ends_at!)
        return [start.getHours() * 60 + start.getMinutes(), end.getHours() * 60 + end.getMinutes()] as [number, number]
      })
      const past: [number, number][] = date < dayKey(now) ? [[0, 1440]] : date === dayKey(now) ? [[0, Math.ceil((now.getTime() - parseDay(date).getTime()) / 60000)]] : []
      freeRanges = subtractRanges(windows, [...classes, ...anchored, ...past])
      const available = freeRanges.reduce((sum, [a, b]) => sum + b - a, 0)
      capacityMin = Math.min(capacityMin, fixedMin + available)
      // Untimed legacy fixed blocks still reserve capacity, even though their exact location is unknown.
    }
    days.push({ date, capacityMin, classMin, fixedMin, plannedMin: fixedMin, sessions: [], ...(freeRanges ? { freeRanges } : {}) })
  }

  const remaining = new Map(items.map((it) => {
    const reserved = fixed.filter((s) => s.date >= input.from && s.date <= days[days.length - 1]?.date && (s.task_id === it.id || s.topic_id === it.id)).reduce((sum, s) => sum + Math.max(0, s.planned_min - s.actual_min), 0)
    return [it.id, Math.max(0, it.remainingMin - reserved)]
  }))
  const sessions: StudySession[] = []

  // Round-robin over items each day: interleaving beats blocking for retention,
  // and it means one heavy topic cannot eat a whole day.
  for (const day of days) {
    let guard = 0
    let placedSomething = true
    while (day.plannedMin < day.capacityMin && placedSomething && guard++ < 40) {
      placedSomething = false
      for (const item of items) {
        const left = remaining.get(item.id) ?? 0
        if (left < 10) continue
        if (item.dueDay && day.date > item.dueDay) continue // past its deadline, no point
        const room = day.capacityMin - day.plannedMin
        if (room < 15) break
        const alreadyToday = day.sessions
          .filter((s) => s.topic_id === item.id || s.task_id === item.id)
          .reduce((sum, s) => sum + s.planned_min, 0)
        if (alreadyToday >= MAX_BLOCK_MIN) continue

        let block = Math.min(left, room, BLOCK_MIN, MAX_BLOCK_MIN - alreadyToday)
        let range: [number, number] | undefined
        if (day.freeRanges) {
          const due = item.dueAt ? parseISO(item.dueAt) : null
          const cutoff = due && dayKey(due) === day.date ? due.getHours() * 60 + due.getMinutes() : 1440
          range = day.freeRanges.find(([a, b]) => Math.min(b, cutoff) - a >= 15)
          if (!range) continue
          block = Math.min(block, Math.min(range[1], cutoff) - range[0])
        }
        block = Math.floor(block)
        if (block < 15) continue

        const session: StudySession = {
          id: uid(),
          user_id: null,
          updated_at: now.toISOString(),
          deleted_at: null,
          course_id: item.courseId,
          topic_id: item.kind === 'topic' ? item.id : null,
          task_id: item.kind === 'task' ? item.id : null,
          date: day.date,
          kind: item.kind === 'task' ? 'task' : 'study',
          planned_min: block,
          actual_min: 0,
          status: 'planned',
          auto: true,
          ...(range ? { starts_at: atMinute(day.date, range[0]), ends_at: atMinute(day.date, range[0] + block) } : {}),
        }
        day.sessions.push(session)
        sessions.push(session)
        day.plannedMin += block
        remaining.set(item.id, left - block)
        if (range && day.freeRanges) day.freeRanges = subtractRanges(day.freeRanges, [[range[0], range[0] + block]])
        placedSomething = true
      }
    }
  }

  const demandMin = items.reduce((s, i) => s + i.remainingMin, 0)
  const capacityMin = days.reduce((s, d) => s + d.capacityMin, 0)
  const reservedMin = fixed.filter((s) => s.date >= input.from && s.date <= days[days.length - 1]?.date).reduce((sum, s) => sum + Math.max(0, s.planned_min - s.actual_min), 0)
  const scheduledMin = sessions.reduce((s, x) => s + x.planned_min, 0) + reservedMin
  const unplaceable = items
    .map((i) => ({ label: i.label, dueDay: i.dueDay, missingMin: remaining.get(i.id) ?? 0 }))
    .filter((u) => u.missingMin >= 10)
    .sort((a, b) => b.missingMin - a.missingMin)
  for (const day of days) if (day.fixedMin > day.capacityMin) unplaceable.push({ label: `Existing fixed work on ${day.date}`, dueDay: day.date, missingMin: day.fixedMin - day.capacityMin })
  const shortfallMin = unplaceable.reduce((s, u) => s + u.missingMin, 0)

  const ratio = capacityMin ? demandMin / capacityMin : 0
  const verdict: PlanDiagnostics['verdict'] =
    shortfallMin > 0 ? 'overloaded' : ratio > 0.75 ? 'tight' : 'comfortable'

  const message =
    verdict === 'overloaded'
      ? `The next ${input.days} days do not fit. ${Math.round(shortfallMin / 60)}h of work has nowhere to go — raise your daily capacity, drop a topic, or accept that something slips.`
      : verdict === 'tight'
        ? `It fits, with almost nothing spare. One bad day and you are behind.`
        : `Comfortable. About ${Math.round((capacityMin - scheduledMin) / 60)}h of slack across the window.`

  return {
    days,
    sessions,
    diagnostics: { demandMin, capacityMin, scheduledMin, shortfallMin, unplaceable, verdict, message },
  }
}

/**
 * Catch-up: yesterday's unfinished planned work moves forward into the first
 * days that still have room — oldest and most exam-critical first, and still
 * inside the cap. Nothing is silently dropped; what does not fit is returned.
 */
export function catchUp(
  missed: StudySession[],
  days: PlannedDay[],
  deadlines: Map<string, string> = new Map(),
): { moved: StudySession[]; dropped: StudySession[] } {
  const moved: StudySession[] = []
  const dropped: StudySession[] = []
  const ordered = [...missed].sort((a, b) => a.date.localeCompare(b.date))
  const calendar = days.map((day) => ({ ...day, ...(day.freeRanges ? { freeRanges: day.freeRanges.map(r => [...r] as [number, number]) } : {}) }))

  for (const s of ordered) {
    const deadline = s.task_id ? deadlines.get(s.task_id) : undefined
    const dueDay = deadline ? dayKey(deadline) : null
    const cutoff = (date: string) => deadline && deadline.includes('T') && dueDay === date ? new Date(deadline).getHours() * 60 + new Date(deadline).getMinutes() : 1440
    const day = calendar.find((d) => (!dueDay || d.date <= dueDay) && d.capacityMin - d.plannedMin >= s.planned_min && (!d.freeRanges || d.freeRanges.some(([a, b]) => Math.min(b, cutoff(d.date)) - a >= s.planned_min)))
    if (!day) {
      dropped.push(s)
      continue
    }
    day.plannedMin += s.planned_min
    const range = day.freeRanges?.find(([a, b]) => Math.min(b, cutoff(day.date)) - a >= s.planned_min)
    const times = range ? { starts_at: atMinute(day.date, range[0]), ends_at: atMinute(day.date, range[0] + s.planned_min) } : { starts_at: undefined, ends_at: undefined }
    if (range && day.freeRanges) day.freeRanges = subtractRanges(day.freeRanges, [[range[0], range[0] + s.planned_min]])
    moved.push({ ...s, ...times, date: day.date, updated_at: new Date().toISOString() })
  }
  return { moved, dropped }
}
