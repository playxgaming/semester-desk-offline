import { db } from './db'
import { alive, put, remove, stamp } from './mutate'
import { normalizeTopic, type SyllabusTopicDraft } from '@/lib/syllabus'
import { uid } from '@/lib/id'
import { MAX_FILE_BYTES } from './files'

export interface SyllabusPdfSource {
  file: File
  pages: { number: number; text: string }[]
  extraction?: 'ocr'
}

export async function importSyllabus(courseId: string, title: string, text: string, drafts: SyllabusTopicDraft[], source?: SyllabusPdfSource) {
  const selected = drafts.filter(d => d.selected)
  if (!title.trim() || !text.trim() || text.length > 100_000 || !selected.length || selected.length > 200) throw new Error('Provide a source title, syllabus text and at least one topic (up to 200).')
  if (selected.some(d => !d.name.trim() || d.name.length > 300 || !Number.isFinite(d.minutes) || d.minutes < 5 || d.minutes > 1440)) throw new Error('Each selected topic needs a name and a study estimate from 5 to 1,440 minutes.')
  if (source && (source.file.size > MAX_FILE_BYTES || !source.pages.length || source.pages.length > 80 || source.pages.some(p => !Number.isInteger(p.number) || p.number < 1 || p.number > 80 || typeof p.text !== 'string') || source.pages.reduce((n, p) => n + p.text.length, 0) > 100_000)) throw new Error('The PDF source exceeds the supported file, page or text limits.')
  return db.transaction('rw', db.courses, db.course_documents, db.topics, db.attachments, db.blobs, async () => {
    const course = await db.courses.get(courseId)
    if (!course || course.deleted_at) throw new Error('The course is no longer available.')
    const docs = alive(await db.course_documents.where('course_id').equals(courseId).toArray())
    const previous = !source && docs.find(d => !d.attachment_id && d.body_text === text && d.kind === 'syllabus')
    let attachmentId: string | undefined
    if (source) {
      const blobId = uid()
      await db.blobs.put({ id: blobId, data: source.file })
      const attachment = await put('attachments', stamp({ id: uid(), parent_type: 'course' as const, parent_id: courseId, name: source.file.name, storage_path: `local:${blobId}`, kind: source.file.type || 'application/pdf', size: source.file.size }))
      attachmentId = attachment.id
    }
    const document = previous || await put('course_documents', stamp({ id: uid(), course_id: courseId, title: title.trim(), body_text: text, kind: 'syllabus' as const, imported_at: new Date().toISOString(), ...(source ? { attachment_id: attachmentId, pages: source.pages, extraction: source.extraction, original_type: source.file.type } : {}) }))
    const existing = new Set(alive(await db.topics.where('course_id').equals(courseId).toArray()).map(t => normalizeTopic(t.name)))
    const current = await db.topics.where('course_id').equals(courseId).toArray()
    let order = Math.max(-1, ...current.map(t => t.order_index)) + 1
    const added: { id: string; updated_at: string }[] = []
    let skipped = 0
    for (const draft of selected) {
      const key = normalizeTopic(draft.name)
      if (!key || existing.has(key)) { skipped++; continue }
      const topic = await put('topics', stamp({
        id: uid(), course_id: courseId, name: draft.name.trim(), order_index: order++,
        confidence: 0 as const, est_minutes: draft.minutes, exam_critical: false,
        unit_title: draft.unit.trim().slice(0, 200), source_document_id: document.id,
        source_excerpt: draft.excerpt,
      }))
      existing.add(key); added.push({ id: topic.id, updated_at: topic.updated_at })
    }
    return { documentId: document.id, newDocument: !previous, added, skipped, attachmentId }
  })
}

export async function undoSyllabus(result: Awaited<ReturnType<typeof importSyllabus>>) {
  await db.transaction('rw', db.topics, db.course_documents, db.attachments, async () => {
    for (const row of result.added) {
      const current = await db.topics.get(row.id)
      if (current && !current.deleted_at && current.updated_at !== row.updated_at) throw new Error('An imported topic was edited. Keep your edits and remove topics individually.')
    }
    for (const row of result.added) await remove('topics', row.id)
    if (result.newDocument) {
      const referenced = alive(await db.topics.toArray()).some(t => t.source_document_id === result.documentId)
      if (!referenced) {
        await remove('course_documents', result.documentId)
        if (result.attachmentId) await remove('attachments', result.attachmentId)
      }
    }
  })
}
