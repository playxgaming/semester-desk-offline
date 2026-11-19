import { db, type QuizAttempt } from './db'
import { alive, patch, put, stamp } from './mutate'
import type { Question } from '@/lib/quiz'
import { uid } from '@/lib/id'
import { dayKey } from '@/lib/date'

export const questionCorrect = (q: Question, answer: number | boolean | undefined) => q.kind === 'choice' ? answer === q.answerIndex : answer === true
export async function startQuiz(questions: Question[], courseId: string | null) {
  if (!questions.length || questions.length > 100) throw new Error('Choose one to 100 quiz questions.')
  return put('quiz_attempts', stamp({ id: uid(), course_id: courseId, started_at: new Date().toISOString(), completed_at: null, questions, answers: {}, position: 0 }))
}
export async function progressQuiz(id: string, answers: QuizAttempt['answers'], position: number) {
  await db.transaction('rw', db.quiz_attempts, async () => {
    const attempt = await db.quiz_attempts.get(id)
    if (!attempt || attempt.deleted_at || attempt.completed_at) throw new Error('This quiz is no longer active.')
    if (position < attempt.position || position > attempt.questions.length || !Number.isInteger(position)) throw new Error('Invalid quiz progress.')
    for (const q of attempt.questions.slice(0, position)) if (answers[q.id] === undefined) throw new Error('Answer the question before advancing.')
    await patch('quiz_attempts', id, { answers, position, completed_at: position === attempt.questions.length ? new Date().toISOString() : null })
  })
}
/** An explicit student action; retries do not duplicate revision blocks. */
export async function planQuizRevision(attemptId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || date < dayKey(new Date())) throw new Error('Choose today or a later date.')
  return db.transaction('rw', db.quiz_attempts, db.sessions, db.topics, db.courses, async () => {
    const attempt = await db.quiz_attempts.get(attemptId)
    if (!attempt || attempt.deleted_at || !attempt.completed_at) throw new Error('Complete this quiz before proposing revision.')
    const active = new Set(alive(await db.courses.toArray()).filter(c => !c.archived).map(c => c.id))
    const wrong = attempt.questions.filter(q => !questionCorrect(q, attempt.answers[q.id]) && (!q.card.course_id || active.has(q.card.course_id)))
    const grouped = new Map<string, Question>()
    wrong.forEach(q => grouped.set(q.topicId ?? `course:${q.card.course_id ?? 'general'}`, q))
    const existing = alive(await db.sessions.toArray())
    let added = 0
    for (const q of grouped.values()) {
      if (existing.some(s => s.quiz_attempt_id === attemptId && s.topic_id === q.topicId && s.course_id === q.card.course_id)) continue
      if (q.topicId) {
        const topic = await db.topics.get(q.topicId)
        if (!topic || topic.deleted_at || topic.course_id !== q.card.course_id) continue
      }
      await put('sessions', stamp({ id: uid(), course_id: q.card.course_id, topic_id: q.topicId, task_id: null, date, kind: 'revise' as const, planned_min: 20, actual_min: 0, status: 'planned' as const, auto: false, quiz_attempt_id: attemptId }))
      added++
    }
    return added
  })
}
