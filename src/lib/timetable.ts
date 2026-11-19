import type { TimetableSlot } from '@/db/db'
const monday = (date: string) => {
  const time = Date.parse(`${date}T00:00:00Z`)
  const weekday = new Date(time).getUTCDay()
  return time - ((weekday + 6) % 7) * 86400000
}
export function weekApplies(slot: Pick<TimetableSlot, 'week_pattern' | 'week_anchor'>, date: string): boolean {
  if (!slot.week_pattern || slot.week_pattern === 'all') return true
  if (!slot.week_anchor || !Number.isFinite(Date.parse(slot.week_anchor))) return false
  const even = Math.abs(Math.round((monday(date) - monday(slot.week_anchor)) / 604800000)) % 2 === 0
  return slot.week_pattern === 'a' ? even : !even
}
export function weeksOverlap(a: Pick<TimetableSlot, 'week_pattern' | 'week_anchor'>, b: Pick<TimetableSlot, 'week_pattern' | 'week_anchor'>): boolean {
  if (!a.week_pattern || a.week_pattern === 'all' || !b.week_pattern || b.week_pattern === 'all') return true
  return ['2026-01-05', '2026-01-12'].some(date => weekApplies(a, date) && weekApplies(b, date))
}
