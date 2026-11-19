export interface NoteSource { id: string; title: string; text: string; document_id?: string; page?: number }
export interface NoteRequest { topic: string; course: string; sources: NoteSource[]; style: 'summary' | 'exam' | 'detailed'; level: 'beginner' | 'undergraduate' | 'advanced' }
export interface NoteOutput { title: string; body_md: string; citations: { source_id: string; quote: string }[] }
export interface NoteProvenance {
  provider: 'chatgpt' | 'gemini' | 'groq'; model: string; generated_at: string
  sources: NoteSource[]; citations: NoteOutput['citations']; generated_body_md: string; derived_from_note_id?: string
  style?: 'summary' | 'exam' | 'detailed'; level?: 'beginner' | 'undergraduate' | 'advanced'
}
export function validateNoteRequest(value: unknown): NoteRequest
export function validateNoteOutput(raw: unknown, sources: NoteSource[]): NoteOutput
export function validNoteProvenance(value: unknown): value is NoteProvenance
export function noteInput(value: unknown): string
export const NOTE_INSTRUCTIONS: string
export const NOTE_FORMAT_INSTRUCTIONS: string
