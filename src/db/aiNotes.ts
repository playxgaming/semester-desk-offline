import { db } from './db'
import { put, stamp } from './mutate'
import { validateNoteOutput, validNoteProvenance, type NoteProvenance } from '../../server/shared/ai-notes.mjs'

/** Each generation has its own ID and can never replace an edited note. */
export async function saveGeneratedNote(id: string, courseId: string, topicId: string, output: unknown, provenance: NoteProvenance) {
  if (!validNoteProvenance(provenance)) throw new Error('The generated source information is invalid. Keep the preview open and retry.')
  const draft = validateNoteOutput(output, provenance.sources)
  if (draft.body_md !== provenance.generated_body_md || JSON.stringify(draft.citations) !== JSON.stringify(provenance.citations)) throw new Error('The generated draft does not match its source record.')
  return db.transaction('rw', db.courses, db.topics, db.course_documents, db.notes, async () => {
    const course = await db.courses.get(courseId), topic = await db.topics.get(topicId)
    if (!course || course.deleted_at || course.archived || !topic || topic.deleted_at || topic.course_id !== courseId) throw new Error('The selected course or topic is no longer available. Your generated preview is still here.')
    for (const source of provenance.sources) {
      const doc = source.document_id ? await db.course_documents.get(source.document_id) : null
      if (!doc || doc.deleted_at || doc.course_id !== courseId) throw new Error('A selected source was removed. Your generated preview is still here; restore the source before saving.')
    }
    const existing = await db.notes.get(id)
    if (existing) {
      if (existing.deleted_at) throw new Error('This generated draft was deleted. Restore it from Undo rather than generating a duplicate.')
      return existing
    }
    return put('notes', stamp({ id, course_id: courseId, topic_id: topicId, title: draft.title, body_md: '', pinned: false,
      local_draft: { title: draft.title, body_md: draft.body_md, at: provenance.generated_at }, ai_provenance: provenance }))
  })
}
