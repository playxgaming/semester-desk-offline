import type { Profile } from '@/db/db'
export type StudyWindow = NonNullable<Profile['study_windows']>[number]
export const minuteOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
export function validWindows(value: unknown): value is StudyWindow[] {
  if (!Array.isArray(value) || value.length > 35) return false
  const validTime = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
  if (value.some(w => !w || !Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6 || !validTime(w.start) || !validTime(w.end) || w.start >= w.end)) return false
  return !value.some((a, i) => value.some((b, j) => j > i && a.weekday === b.weekday && a.start < b.end && a.end > b.start))
}
export function subtractRanges(ranges: [number, number][], blocked: [number, number][]): [number, number][] {
  return blocked.reduce((free, [start, end]) => free.flatMap(([a, b]): [number, number][] => end <= a || start >= b ? [[a, b]] : [...(start > a ? [[a, start] as [number, number]] : []), ...(end < b ? [[end, b] as [number, number]] : [])]), ranges)
}
export const atMinute = (date: string, minute: number) => new Date(`${date}T${clock(minute)}:00`).toISOString()
