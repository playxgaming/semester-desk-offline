import type { Course, TimetableSlot } from '@/db/db'
import { matchScanCourse, type ScanItem } from '@/db/scanner'
import { weeksOverlap } from './timetable'
const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export function parseTimetableLines(text: string, courses: Course[]): ScanItem[] {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+([0-2]?\d[:.]\d{2})\s*[-–—]\s*([0-2]?\d[:.]\d{2})\s+(.+)$/i)
    if (!match) return []
    const title = match[4].trim()
    return [{ title: title.slice(0, 200), type: 'class' as const, date: '', startTime: match[2].replace('.', ':').padStart(5, '0'), endTime: match[3].replace('.', ':').padStart(5, '0'), dayOfWeek: String(dayNames.indexOf(match[1].slice(0, 3).toLowerCase())), location: '', course: matchScanCourse(title, courses), selected: true, classKind: 'other' as const }]
  }).slice(0, 100)
}
export function scanConflictMessages(items: ScanItem[], existing: TimetableSlot[]): Map<number, string> {
  const messages = new Map<number, string>()
  items.forEach((item, i) => {
    if (!item.selected || item.type !== 'class' || !item.startTime || !item.endTime) return
    const pattern = { week_pattern: item.weekPattern ?? 'all', week_anchor: item.weekAnchor }
    const other = items.find((row, j) => j !== i && row.selected && row.type === 'class' && row.dayOfWeek === item.dayOfWeek && row.startTime < item.endTime && row.endTime > item.startTime && weeksOverlap(pattern, { week_pattern: row.weekPattern ?? 'all', week_anchor: row.weekAnchor }) && !(row.course === item.course && row.startTime === item.startTime && row.endTime === item.endTime && row.location === item.location && row.classKind === item.classKind && (row.section ?? '') === (item.section ?? '') && (row.weekPattern ?? 'all') === (item.weekPattern ?? 'all') && row.weekAnchor === item.weekAnchor))
    const saved = existing.find(slot => !slot.deleted_at && slot.weekday === Number(item.dayOfWeek) && slot.start < item.endTime && slot.end > item.startTime && weeksOverlap(slot, pattern) && !(slot.course_id === item.course && slot.start === item.startTime && slot.end === item.endTime && slot.room === item.location && slot.kind === item.classKind && (slot.section ?? '') === (item.section ?? '') && (slot.week_pattern ?? 'all') === pattern.week_pattern && (pattern.week_pattern === 'all' || slot.week_anchor === pattern.week_anchor)))
    if (other || saved) messages.set(i, `Time conflict with ${other?.title ?? 'a saved class'}. Review sections, weeks and times before importing.`)
  })
  return messages
}
