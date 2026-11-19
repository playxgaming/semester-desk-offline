import type { CourseDocument } from '@/db/db'
import type { NoteSource } from '../../server/shared/ai-notes.mjs'
export { validateNoteRequest, validateNoteOutput } from '../../server/shared/ai-notes.mjs'
export type { NoteSource, NoteOutput, NoteProvenance } from '../../server/shared/ai-notes.mjs'

export interface SourceChoice extends NoteSource { key: string }

/** Keep page identity and bounded excerpts; no source is selected automatically. */
export function sourceChoices(documents: CourseDocument[], query: string, topic: string): SourceChoice[] {
  const result: SourceChoice[] = []
  for (const doc of documents.filter(d => !d.deleted_at)) {
    const sections = [{ text: doc.body_text, label: doc.pages ? 'reviewed text' : doc.kind, page: undefined as number | undefined },
      ...(doc.pages ?? []).map(p => ({ text: p.text, label: `${doc.extraction === 'ocr' ? 'OCR' : 'original'} page ${p.number}`, page: p.number }))]
    for (const section of sections) {
      let offset = 0, part = 0
      while (offset < section.text.length) {
        let end = Math.min(section.text.length, offset + 6000)
        if (end < section.text.length) {
          const line = section.text.lastIndexOf('\n', end)
          if (line > offset + 3000) end = line
        }
        const text = section.text.slice(offset, end).trim()
        if (text.length >= 12) result.push({ key: `${doc.id}:${section.label}:${part}`, id: '', title: `${doc.title} — ${section.label}${section.text.length > 6000 ? `, excerpt ${part + 1}` : ''}`.slice(0, 300), text, document_id: doc.id, ...(section.page ? { page: section.page } : {}) })
        offset = end; part++
      }
    }
  }
  const search = query.trim().toLowerCase()
  const words = topic.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2)
  const score = (source: SourceChoice) => words.reduce((n, word) => n + Number(`${source.title} ${source.text}`.toLowerCase().includes(word)), 0)
  return result.filter(s => !search || `${s.title} ${s.text}`.toLowerCase().includes(search)).sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title))
}
