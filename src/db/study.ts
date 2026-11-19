import { db, type FocusSession } from './db'
import { alive, patch, put } from './mutate'
import { schedule, type Grade } from '@/lib/srs'
import { uid } from '@/lib/id'
import { dayKey } from '@/lib/date'

/** A failed review must change neither the card nor its review history. */
export async function recordReview(cardId: string, grade: Grade) {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId)
    if (!card || card.deleted_at) throw new Error('This card is no longer available.')
    const next = schedule(card, grade)
    await patch('cards', card.id, next)
    await put('reviews', {
      id: uid(), user_id: null, updated_at: '', deleted_at: null,
      card_id: card.id, at: new Date().toISOString(), grade,
      prev_interval: card.interval, next_interval: next.interval,
    })
    return { ...card, ...next }
  })
}

/** A stable completion ID makes recovery/retry safe, including after a reload. */
export async function recordFocus(row: FocusSession): Promise<boolean> {
  return db.transaction('rw', db.focus_sessions, db.sessions, async () => {
    if (await db.focus_sessions.get(row.id)) return false
    const sessions = alive(await db.sessions.where('date').equals(dayKey(row.ended ?? row.started)).toArray())
    const block = sessions.find(s => s.status === 'planned' &&
      (row.task_id ? s.task_id === row.task_id : s.course_id === row.course_id))
    await put('focus_sessions', row)
    if (block) {
      const actual = block.actual_min + row.minutes
      await patch('sessions', block.id, {
        actual_min: actual, status: actual >= block.planned_min ? 'done' : 'planned',
      })
    }
    return Boolean(block)
  })
}
