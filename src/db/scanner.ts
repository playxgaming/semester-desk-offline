import { db, type Course, type SlotKind } from './db'
import { alive, put, remove, stamp } from './mutate'
import { uid } from '@/lib/id'
import { weeksOverlap } from '@/lib/timetable'

export interface ScanItem {
  title: string
  type: 'class' | 'deadline' | 'exam' | 'holiday'
  date: string
  startTime: string
  endTime: string
  dayOfWeek: string
  location: string
  course: string
  selected: boolean
  classKind: SlotKind
  section?: string
  weekPattern?: 'all' | 'a' | 'b'
  weekAnchor?: string
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function matchScanCourse(title: string, courses: Course[]): string {
  const text = ` ${normalize(title)} `
  const matches = (key: string) => Boolean(normalize(key)) && text.includes(` ${normalize(key)} `)
  const codes = [...new Map(courses.filter(c => matches(c.code)).map(c => [c.id, c])).values()]
  if (codes.length) return codes.length === 1 ? codes[0].id : ''
  const names = [...new Map(courses.filter(c => matches(c.name)).map(c => [c.id, c])).values()]
  return names.length === 1 ? names[0].id : ''
}

export interface ImportedScanRow { table: 'tasks' | 'timetable_slots' | 'timetable_exceptions'; id: string; updated_at: string }

/** Compare inside the same transaction as the import, including earlier rows in this batch. */
export async function importScan(items: ScanItem[]) {
  if (items.length > 100) throw new Error('Import up to 100 items at a time.')
  return db.transaction('rw', [db.tasks, db.timetable_slots, db.timetable_exceptions, db.courses], async () => {
    const slots = alive(await db.timetable_slots.toArray())
    const tasks = alive(await db.tasks.toArray())
    const exceptions = alive(await db.timetable_exceptions.toArray())
    const courses = new Set(alive(await db.courses.toArray()).filter(c => !c.archived).map(c => c.id))
    const imported: ImportedScanRow[] = []
    let skipped = 0
    for (const item of items.filter(i => i.selected)) {
      if (!item.title.trim() || item.title.length > 200 || (item.course && !courses.has(item.course))) throw new Error('Each selected item needs a title and an available course.')
      if (item.type === 'class') {
        if (!item.course || !/^[0-6]$/.test(item.dayOfWeek) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.endTime) || item.startTime >= item.endTime) throw new Error('Every class needs a course, weekday and valid start/end times.')
        const pattern = { week_pattern: item.weekPattern ?? 'all', week_anchor: item.weekAnchor }
        if (!['all', 'a', 'b'].includes(pattern.week_pattern) || (pattern.week_pattern !== 'all' && (!pattern.week_anchor || !/^\d{4}-\d{2}-\d{2}$/.test(pattern.week_anchor) || !Number.isFinite(Date.parse(pattern.week_anchor))))) throw new Error('Alternating classes need a valid Week A anchor date.')
        const duplicate = slots.find(s => s.course_id === item.course && s.weekday === Number(item.dayOfWeek) && s.start === item.startTime && s.end === item.endTime && (s.week_pattern ?? 'all') === pattern.week_pattern && (pattern.week_pattern === 'all' || s.week_anchor === pattern.week_anchor))
        if (duplicate) {
          if (duplicate.room !== item.location || duplicate.kind !== item.classKind || (duplicate.section ?? '') !== (item.section ?? '')) throw new Error(`“${item.title}” already exists with different room, section or class type. Edit that slot or exclude this item.`)
          skipped++; continue
        }
        const overlap = slots.find(s => s.weekday === Number(item.dayOfWeek) && s.start < item.endTime && s.end > item.startTime && weeksOverlap(s, pattern))
        if (overlap) throw new Error(`“${item.title}” overlaps an existing or selected class (${overlap.start}–${overlap.end}). Correct the time or exclude it.`)
        const row = await put('timetable_slots', stamp({ id: uid(), course_id: item.course, weekday: Number(item.dayOfWeek), start: item.startTime, end: item.endTime, room: item.location, kind: item.classKind, ...pattern, section: item.section ?? '' }))
        slots.push(row); imported.push({ table: 'timetable_slots', id: row.id, updated_at: row.updated_at })
      } else if (item.type === 'holiday') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date))) throw new Error('Each holiday needs a valid date.')
        if (exceptions.some(e => !e.slot_id && e.date === item.date && e.kind === 'holiday')) { skipped++; continue }
        const row = await put('timetable_exceptions', stamp({ id: uid(), slot_id: null, date: item.date, kind: 'holiday' as const, new_start: null, new_end: null, note: item.title }))
        exceptions.push(row); imported.push({ table: 'timetable_exceptions', id: row.id, updated_at: row.updated_at })
      } else {
        if (!['deadline', 'exam'].includes(item.type) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date)) || (item.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime))) throw new Error('Each deadline or exam needs a valid date and time.')
        const due_at = new Date(`${item.date}T${item.startTime || '23:59'}:00`).toISOString()
        const type = item.type === 'exam' ? 'exam' as const : 'assignment' as const
        if (tasks.some(t => normalize(t.title) === normalize(item.title) && t.course_id === (item.course || null) && t.due_at === due_at && t.type === type)) { skipped++; continue }
        const row = await put('tasks', stamp({ id: uid(), course_id: item.course || null, title: item.title.trim(), type, due_at, status: 'todo' as const, weight_pct: 0, est_minutes: 60, notes: item.location ? `Location: ${item.location}` : '' }))
        tasks.push(row); imported.push({ table: 'tasks', id: row.id, updated_at: row.updated_at })
      }
    }
    return { imported, skipped }
  })
}

export async function undoScanImport(rows: ImportedScanRow[]) {
  await db.transaction('rw', db.tasks, db.timetable_slots, db.timetable_exceptions, async () => {
    for (const row of rows) {
      const current = await db.table(row.table).get(row.id)
      if (current && !current.deleted_at && current.updated_at !== row.updated_at) throw new Error('An imported item was edited. Keep your edits and remove items individually.')
    }
    for (const row of rows) await remove(row.table, row.id)
  })
}
