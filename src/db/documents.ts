import { db } from './db'
import { alive, put, stamp } from './mutate'
import { MAX_FILE_BYTES } from './files'
import type { SyllabusPdfSource } from './syllabus'
import { uid } from '@/lib/id'

export async function saveReference(courseId: string, title: string, text: string, source?: SyllabusPdfSource) {
  if (!title.trim() || title.length > 200 || !text.trim() || text.length > 100_000) throw new Error('Add a title (up to 200 characters) and reference text (up to 100,000 characters).')
  if (source && (source.file.size > MAX_FILE_BYTES || !source.pages.length || source.pages.length > 80 || source.pages.some(p => !Number.isInteger(p.number) || p.number < 1 || p.number > 80 || typeof p.text !== 'string') || source.pages.reduce((n, p) => n + p.text.length, 0) > 100_000)) throw new Error('This PDF source exceeds the supported limits.')
  return db.transaction('rw', db.courses, db.course_documents, db.attachments, db.blobs, async () => {
    const course = await db.courses.get(courseId)
    if (!course || course.deleted_at) throw new Error('Choose an available course before saving reference material.')
    if (!source) {
      const existing = alive(await db.course_documents.where('course_id').equals(courseId).toArray()).find(d => d.kind === 'reference' && d.title === title.trim() && d.body_text === text)
      if (existing) return existing
    }
    let attachment_id: string | undefined
    if (source) {
      const id = uid()
      await db.blobs.put({ id, data: source.file })
      const attachment = await put('attachments', stamp({ id: uid(), parent_type: 'course' as const, parent_id: courseId, name: source.file.name, storage_path: `local:${id}`, kind: source.file.type || 'application/pdf', size: source.file.size }))
      attachment_id = attachment.id
    }
    return put('course_documents', stamp({ id: uid(), course_id: courseId, title: title.trim(), body_text: text, kind: 'reference' as const, imported_at: new Date().toISOString(), ...(source ? { attachment_id, pages: source.pages, extraction: source.extraction, original_type: source.file.type } : {}) }))
  })
}
