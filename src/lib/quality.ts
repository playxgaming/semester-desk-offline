import type { CourseDocument, Note, QualityReview, QualitySnapshot } from '@/db/db'
import { validNoteProvenance } from '../../server/shared/ai-notes.mjs'

export const QUALITY_CHECKS = {
  accuracy: 'Facts, numbers and equations checked',
  coverage: 'Required topics covered; gaps identified',
  readability: 'Text, layout and equations readable',
  sources: 'Compared with original course material',
} as const

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

export function qualitySnapshot(type: 'note' | 'document', row: Note | CourseDocument): QualitySnapshot {
  if (type === 'note') {
    const note = row as Note
    return { title: note.local_draft?.title ?? note.title, body: note.local_draft?.body_md ?? note.body_md,
      context: canonical({ course_id: note.course_id, topic_id: note.topic_id, provenance: note.ai_provenance ?? null }) }
  }
  const doc = row as CourseDocument
  return { title: doc.title, body: doc.body_text, context: canonical({ course_id: doc.course_id, kind: doc.kind, pages: doc.pages ?? null, attachment_id: doc.attachment_id ?? null, extraction: doc.extraction ?? null, original_type: doc.original_type ?? null }) }
}

export function sameQualitySnapshot(a: QualitySnapshot, b: QualitySnapshot) {
  return a.title === b.title && a.body === b.body && a.context === b.context
}

export function qualityStatus(snapshot: QualitySnapshot, latest?: QualityReview): string {
  return !latest ? 'Not reviewed' : !sameQualitySnapshot(snapshot, latest.snapshot) ? 'Changed since review' : { usable: 'Usable', needs_changes: 'Needs changes', rejected: 'Rejected' }[latest.verdict]
}

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
export function validQualityReview(value: unknown): value is QualityReview {
  if (!record(value) || !['note', 'document'].includes(String(value.target_type)) || typeof value.target_id !== 'string' || !value.target_id.trim() || typeof value.reviewed_at !== 'string' || !Number.isFinite(Date.parse(value.reviewed_at)) || !['usable', 'needs_changes', 'rejected'].includes(String(value.verdict)) || typeof value.issues !== 'string' || value.issues.length > 5000 || !record(value.checks) || !record(value.snapshot)) return false
  if (Object.keys(value.checks).length !== 4 || !Object.keys(QUALITY_CHECKS).every(key => record(value.checks) && ['pass', 'fail', 'na'].includes(String(value.checks[key])))) return false
  const snapshot = value.snapshot
  if (typeof snapshot.title !== 'string' || snapshot.title.length > 10000 || typeof snapshot.body !== 'string' || !snapshot.body.trim() || snapshot.body.length > 2_000_000 || typeof snapshot.context !== 'string' || snapshot.context.length > 2_000_000) return false
  try {
    const context = JSON.parse(snapshot.context)
    if (!record(context)) return false
    if (value.target_type === 'note') {
      if ((context.course_id !== null && typeof context.course_id !== 'string') || (context.topic_id !== null && typeof context.topic_id !== 'string') || (context.provenance !== null && !validNoteProvenance(context.provenance))) return false
    } else {
      if (typeof context.course_id !== 'string' || !['syllabus', 'reference'].includes(String(context.kind)) || (context.attachment_id !== null && typeof context.attachment_id !== 'string') || (context.extraction !== null && context.extraction !== 'ocr') || (context.original_type !== null && typeof context.original_type !== 'string')) return false
      if (context.pages !== null && (!Array.isArray(context.pages) || context.pages.length > 80 || !context.pages.every(p => record(p) && Number.isInteger(p.number) && Number(p.number) >= 1 && Number(p.number) <= 80 && typeof p.text === 'string' && p.text.length <= 100_000))) return false
    }
  } catch { return false }
  if (value.verdict === 'usable' && Object.values(value.checks).some(v => v !== 'pass')) return false
  if (value.verdict !== 'usable' && !value.issues.trim()) return false
  return true
}
