import { db, DATA_TABLES, type DataTable, type StoredBlob } from '@/db/db'
import { put, type TableRow } from '@/db/mutate'
import { MAX_FILE_BYTES } from '@/db/files'
import { validNoteProvenance } from '../../server/shared/ai-notes.mjs'
import { validWindows } from './availability'
import { validQualityReview } from './quality'

/**
 * Your data is yours: one file, every table, readable without the app and
 * importable back into it. No account required to read it.
 */

export interface Backup {
  app: 'semester-desk'
  version: 3
  exported_at: string
  tables: Record<string, unknown[]>
  blobs: BackupBlob[]
}

interface BackupBlob {
  id: string
  type: string
  size: number
  sha256: string
  base64: string
}

/** Bound base64/JSON memory use on phones. Larger resource banks need separate files. */
export const MAX_PORTABLE_BYTES = 64 * 1024 * 1024
export const MAX_BACKUP_TEXT_BYTES = 96 * 1024 * 1024

async function recordSnapshot(includeBlobs: boolean) {
  const tables: Record<string, unknown[]> = {}
  const files: StoredBlob[] = []
  let bytes = 0
  await db.transaction('r', [...DATA_TABLES.map((name) => db.table(name)), db.blobs], async () => {
    for (const t of DATA_TABLES) tables[t] = await db.table(t).toArray()
    if (!includeBlobs) return
    const seen = new Set<string>()
    for (const row of tables.attachments as TableRow['attachments'][]) {
      if (!row.storage_path.startsWith('local:')) continue
      const id = row.storage_path.slice(6)
      if (seen.has(id)) continue
      const file = await db.blobs.get(id)
      if (!file) {
        if (!row.deleted_at) throw new Error(`The file “${row.name}” is missing on this device. Restore or remove its attachment before making a complete backup.`)
        continue
      }
      if (file.data.size !== row.size || file.data.size > MAX_FILE_BYTES) throw new Error(`The file “${row.name}” does not match its saved size. Attach it again before exporting.`)
      bytes += file.data.size
      if (bytes > MAX_PORTABLE_BYTES) throw new Error('A portable JSON backup supports up to 64 MB of attached files. Save larger files separately and remove their attachments before exporting.')
      seen.add(id)
      files.push(file)
    }
  })
  return { tables, files }
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  return btoa(chunks.join(''))
}

async function digest(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function exportJson(): Promise<Backup> {
  const { tables, files } = await recordSnapshot(true)
  const blobs: BackupBlob[] = []
  // Blob reads/digests run outside the IDB transaction, after a consistent snapshot.
  for (const file of files) {
    const bytes = new Uint8Array(await file.data.arrayBuffer())
    blobs.push({ id: file.id, type: file.data.type, size: bytes.byteLength, sha256: await digest(bytes), base64: encodeBase64(bytes) })
  }
  const backup: Backup = { app: 'semester-desk', version: 3, exported_at: new Date().toISOString(), tables, blobs }
  if (JSON.stringify(backup).length > MAX_BACKUP_TEXT_BYTES) throw new Error('This backup exceeds the 96 MB JSON limit. Export CSV records and save attached files separately.')
  return backup
}

export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Keep the Blob alive while the browser hands the download to the OS.
  // Immediate/one-second revocation can cancel downloads on a busy device.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export async function exportCsvBundle(): Promise<string> {
  const { tables } = await recordSnapshot(false)
  return Object.entries(tables)
    .filter(([, rows]) => rows.length)
    .map(([name, rows]) => `# ${name}\n${toCsv(rows as Record<string, unknown>[])}`)
    .join('\n\n')
}

async function readBackup(text: string) {
  if (text.length > MAX_BACKUP_TEXT_BYTES) throw new Error('This backup exceeds the 96 MB JSON import limit.')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('This file is not valid JSON.') }
  if (!isRecord(parsed) || parsed.app !== 'semester-desk') throw new Error('That file is not a Semester Desk backup.')
  if (parsed.version !== 2 && parsed.version !== 3) throw new Error('This backup version is not supported. Use a version 2 or 3 Semester Desk backup.')
  if (!isRecord(parsed.tables)) throw new Error('The backup is missing its data tables.')
  const entries: [DataTable, Record<string, unknown>[]][] = []
  // Validate the entire backup before writing any record. Internal stores,
  // blobs and arbitrary properties of the db object are never import targets.
  for (const [name, list] of Object.entries(parsed.tables)) {
    if (!(DATA_TABLES as readonly string[]).includes(name)) throw new Error(`Unknown backup table: ${name}.`)
    if (!Array.isArray(list)) throw new Error(`Invalid data in ${name}: expected a list of rows.`)
    const ids = new Set<string>()
    for (const row of list) {
      if (!validRow(name as DataTable, row) || ids.has(row.id)) throw new Error(`Invalid or duplicate row in ${name}. No data was imported.`)
      ids.add(row.id)
    }
    if (list.length) entries.push([name as DataTable, list])
  }
  const blobs: StoredBlob[] = []
  const blobSizes = new Map<string, number>()
  if (parsed.version === 3) {
    if (!Array.isArray(parsed.blobs)) throw new Error('The portable backup is missing its files manifest.')
    let totalBytes = 0
    for (const file of parsed.blobs) {
      if (!isRecord(file) || typeof file.id !== 'string' || !file.id.trim() || blobSizes.has(file.id) || typeof file.type !== 'string' || file.type.length > 255 || !Number.isInteger(file.size) || Number(file.size) < 0 || Number(file.size) > MAX_FILE_BYTES || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.base64 !== 'string') throw new Error('Invalid or duplicate file in the backup. No data was imported.')
      totalBytes += Number(file.size)
      if (totalBytes > MAX_PORTABLE_BYTES) throw new Error('The backup exceeds the 64 MB attached-file limit.')
      const padding = Number(file.size) % 3 ? 3 - Number(file.size) % 3 : 0
      const dataEnd = file.base64.length - padding
      // Avoid a repeating-group regex over tens of MB: its backtracking stack
      // can overflow even for valid large files in some browser engines.
      if (file.base64.length !== Math.ceil(Number(file.size) / 3) * 4 || /[^A-Za-z0-9+/]/.test(file.base64.slice(0, dataEnd)) || file.base64.slice(dataEnd) !== '='.repeat(padding)) throw new Error('A backup file has invalid base64 data. No data was imported.')
      const decoded = atob(file.base64)
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
      if (bytes.length !== file.size || await digest(bytes) !== file.sha256) throw new Error('A backup file failed its integrity check. No data was imported.')
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      blobs.push({ id: file.id, data: new Blob([buffer], { type: file.type }) })
      blobSizes.set(file.id, bytes.length)
    }
    const referenced = new Set<string>()
    for (const row of (parsed.tables.attachments ?? []) as TableRow['attachments'][]) {
      if (!row.storage_path.startsWith('local:')) continue
      const id = row.storage_path.slice(6)
      referenced.add(id)
      if ((!row.deleted_at || blobSizes.has(id)) && blobSizes.get(id) !== row.size) throw new Error(`The backup is missing or has a mismatched file for “${row.name}”. No data was imported.`)
    }
    if (blobs.some((file) => !referenced.has(file.id))) throw new Error('The backup contains an unreferenced file. No data was imported.')
  }
  return { parsed, entries, blobs }
}

export async function previewBackup(text: string) {
  const { entries, blobs } = await readBackup(text)
  const conflicts: { table: DataTable; id: string; title: string; deleted: boolean }[] = []
  const expected: Record<string, string | null> = {}
  let total = 0
  await db.transaction('r', DATA_TABLES.map(table => db.table(table)), async () => {
    for (const [table, list] of entries) for (const row of list) {
      total++
      const current = await db.table(table).get(String(row.id))
      expected[`${table}:${row.id}`] = current?.updated_at ?? null
      if (current) conflicts.push({ table, id: String(row.id), title: String(row.title || row.name || row.org || row.front || row.id).slice(0, 200), deleted: Boolean(row.deleted_at) })
    }
  })
  return { total, files: blobs.length, added: total - conflicts.length, conflicts, expected }
}

export async function importJson(text: string, options: { keepExisting?: boolean; expected?: Record<string, string | null> } = {}): Promise<{ tables: number; rows: number; files: number; missingFiles: number; skipped: number }> {
  const { parsed, entries, blobs } = await readBackup(text)
  let missingFiles = 0, rows = 0, files = 0, skipped = 0
  await db.transaction('rw', [...DATA_TABLES.map((name) => db.table(name)), db.blobs], async () => {
    if (options.expected) for (const [table, list] of entries) for (const row of list) {
      const current = await db.table(table).get(String(row.id))
      if ((current?.updated_at ?? null) !== options.expected[`${table}:${row.id}`]) throw new Error('Device records changed after preview. Cancel and select the backup again to review the latest conflicts.')
    }
    if (options.keepExisting) for (const row of (parsed.tables as Record<string, unknown[]>).attachments ?? []) {
      const attachment = row as TableRow['attachments']
      if (!await db.attachments.get(attachment.id) && attachment.storage_path.startsWith('local:') && await db.blobs.get(attachment.storage_path.slice(6))) throw new Error('A new attachment conflicts with an existing file ID. Import into a separate browser profile or review replacement mode.')
    }
    for (const [name, list] of entries) {
      for (const row of list) {
        if (options.keepExisting && await db.table(name).get(String(row.id))) { skipped++; continue }
        // Restore through the same local write path with fresh timestamps.
        await put(name, row as unknown as TableRow[typeof name])
        rows++
      }
    }
    const referenced = new Set((await db.attachments.toArray()).filter(a => a.storage_path.startsWith('local:')).map(a => a.storage_path.slice(6)))
    for (const blob of blobs) {
      if (!referenced.has(blob.id) || (options.keepExisting && await db.blobs.get(blob.id))) continue
      await db.blobs.put(blob); files++
    }
    if (parsed.version === 2) {
      for (const row of (parsed.tables as Record<string, unknown[]>).attachments ?? []) {
        const attachment = row as TableRow['attachments']
        if (!attachment.deleted_at && attachment.storage_path.startsWith('local:') && !await db.blobs.get(attachment.storage_path.slice(6))) missingFiles++
      }
    }
  })
  return { tables: entries.length, rows, files, missingFiles, skipped }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Validate field types consumed by every route. A malformed record must not
// turn a successful import into a crash on the next screen.
const ROW_FIELDS: Record<DataTable, Record<string, 'string' | 'number' | 'boolean' | 'array' | 'nullable' | 'object'>> = {
  quality_reviews: { target_type: 'string', target_id: 'string', reviewed_at: 'string', verdict: 'string', checks: 'object', issues: 'string', snapshot: 'object' },
  quiz_attempts: { course_id: 'nullable', started_at: 'string', completed_at: 'nullable', questions: 'array', answers: 'object', position: 'number' },
  profiles: { name: 'string', institution: 'string', timezone: 'string', term_start: 'string', term_end: 'string', grading_scheme: 'string', grade_bands: 'array', attendance_threshold: 'number', daily_capacity_min: 'number', quiet_hours: 'array', theme: 'string', onboarded: 'boolean', brief_time: 'string', current_semester: 'string' },
  course_documents: { course_id: 'string', title: 'string', kind: 'string', body_text: 'string', imported_at: 'string' },
  courses: { code: 'string', name: 'string', credits: 'number', colour: 'string', instructor: 'string', target_grade: 'number', attendance_threshold: 'number', archived: 'boolean', semester: 'string' },
  timetable_slots: { course_id: 'string', weekday: 'number', start: 'string', end: 'string', room: 'string', kind: 'string' },
  timetable_exceptions: { slot_id: 'nullable', date: 'string', kind: 'string', new_start: 'nullable', new_end: 'nullable', note: 'string' },
  attendance: { course_id: 'string', slot_id: 'nullable', date: 'string', status: 'string' },
  assessments: { course_id: 'string', title: 'string', weight_pct: 'number', max: 'number', date: 'nullable' },
  topics: { course_id: 'string', name: 'string', order_index: 'number', confidence: 'number', est_minutes: 'number', exam_critical: 'boolean' },
  tasks: { course_id: 'nullable', title: 'string', type: 'string', due_at: 'nullable', weight_pct: 'number', est_minutes: 'number', status: 'string', notes: 'string' },
  subtasks: { task_id: 'string', title: 'string', done: 'boolean', order_index: 'number' },
  attachments: { parent_type: 'string', parent_id: 'string', name: 'string', storage_path: 'string', kind: 'string', size: 'number' },
  sessions: { course_id: 'nullable', topic_id: 'nullable', task_id: 'nullable', date: 'string', kind: 'string', planned_min: 'number', actual_min: 'number', status: 'string', auto: 'boolean' },
  cards: { course_id: 'nullable', topic_id: 'nullable', front: 'string', back: 'string', ease: 'number', interval: 'number', reps: 'number', due_at: 'string', lapses: 'number', suspended: 'boolean', is_formula: 'boolean' },
  reviews: { card_id: 'string', at: 'string', grade: 'number', prev_interval: 'number', next_interval: 'number' },
  focus_sessions: { course_id: 'nullable', task_id: 'nullable', started: 'string', ended: 'nullable', minutes: 'number', interruptions: 'number' },
  notes: { course_id: 'nullable', topic_id: 'nullable', title: 'string', body_md: 'string', pinned: 'boolean' },
  note_versions: { note_id: 'string', body_md: 'string', at: 'string', source: 'string' },
  applications: { org: 'string', role: 'string', kind: 'string', stage: 'string', deadline: 'nullable', link: 'string', note: 'string', resume_version_id: 'nullable', sop_status: 'string', lor_status: 'string' },
  application_events: { application_id: 'string', at: 'string', kind: 'string', note: 'string' },
  contacts: { name: 'string', org: 'string', email: 'string', last_touch: 'nullable', follow_up_at: 'nullable', note: 'string' },
  resume_items: { kind: 'string', title: 'string', org: 'string', start: 'nullable', end: 'nullable', bullets: 'array' },
  resume_versions: { name: 'string', item_ids: 'array', target_role: 'string' },
  transactions: { at: 'string', amount: 'number', category: 'string', method: 'string', note: 'string' },
  budgets: { month: 'string', category: 'string', limit_amount: 'number' },
  recurring: { name: 'string', amount: 'number', cadence: 'string', next_at: 'string' },
  habits: { name: 'string', cadence: 'string', target: 'number', colour: 'string' },
  habit_logs: { habit_id: 'string', date: 'string', value: 'number' },
  ai_threads: { course_id: 'nullable', title: 'string', task_type: 'string' },
  ai_messages: { thread_id: 'string', role: 'string', content: 'string', tokens_in: 'number', tokens_out: 'number', cost_inr: 'number' },
  notification_prefs: { channel: 'string', enabled: 'boolean' },
}

function validRow(table: DataTable, row: unknown): row is Record<string, unknown> & { id: string } {
  if (table === 'quality_reviews' && !validQualityReview(row)) return false
  if (!isRecord(row) || typeof row.id !== 'string' || !row.id.trim()) return false
  if (row.user_id !== null && typeof row.user_id !== 'string') return false
  if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) return false
  if (row.deleted_at !== null && (typeof row.deleted_at !== 'string' || !Number.isFinite(Date.parse(row.deleted_at)))) return false
  for (const [field, type] of Object.entries(ROW_FIELDS[table])) {
    const value = row[field]
    if (type === 'array' ? !Array.isArray(value) : type === 'nullable' ? value !== null && typeof value !== 'string' : typeof value !== type || (type === 'number' && !Number.isFinite(value))) return false
  }
  if (table === 'quiz_attempts') {
    if (!Array.isArray(row.questions) || !row.questions.length || row.questions.length > 100 || !isRecord(row.answers) || !Number.isInteger(row.position) || Number(row.position) < 0 || Number(row.position) > row.questions.length || !Number.isFinite(Date.parse(String(row.started_at))) || (row.completed_at !== null && (!Number.isFinite(Date.parse(String(row.completed_at))) || row.position !== row.questions.length))) return false
    const ids = new Set<string>()
    for (const q of row.questions) {
      if (!isRecord(q) || typeof q.id !== 'string' || ids.has(q.id) || !['choice', 'recall'].includes(String(q.kind)) || typeof q.prompt !== 'string' || (q.topicId !== null && typeof q.topicId !== 'string') || !Array.isArray(q.options) || q.options.length > 20 || !q.options.every(o => typeof o === 'string') || !Number.isInteger(q.answerIndex) || (q.kind === 'choice' && (Number(q.answerIndex) < 0 || Number(q.answerIndex) >= q.options.length)) || !isRecord(q.card) || typeof q.card.id !== 'string' || typeof q.card.front !== 'string' || typeof q.card.back !== 'string' || (q.card.course_id !== null && typeof q.card.course_id !== 'string')) return false
      ids.add(q.id)
      const answer = row.answers[q.id]
      if (answer !== undefined && (q.kind === 'recall' ? typeof answer !== 'boolean' : !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= q.options.length)) return false
    }
    if (Object.keys(row.answers).some(id => !ids.has(id)) || row.questions.slice(0, Number(row.position)).some(q => row.answers && isRecord(row.answers) && row.answers[String((q as Record<string, unknown>).id)] === undefined)) return false
    if (row.completed_at === null && row.position === row.questions.length) return false
  }
  if (table === 'profiles') {
    if (row.study_windows !== undefined && !validWindows(row.study_windows)) return false
    if (['email', 'phone', 'website'].some(key => row[key] !== undefined && typeof row[key] !== 'string')) return false
  }
  if (table === 'sessions') {
    if (['starts_at', 'ends_at', 'quiz_attempt_id'].some(key => row[key] !== undefined && typeof row[key] !== 'string')) return false
    if ((row.starts_at === undefined) !== (row.ends_at === undefined)) return false
    if (row.starts_at !== undefined && (!Number.isFinite(Date.parse(String(row.starts_at))) || !Number.isFinite(Date.parse(String(row.ends_at))) || Date.parse(String(row.starts_at)) >= Date.parse(String(row.ends_at)))) return false
  }
  if (table === 'timetable_slots') {
    if (row.section !== undefined && typeof row.section !== 'string') return false
    if (row.week_pattern !== undefined && !['all', 'a', 'b'].includes(String(row.week_pattern))) return false
    if (row.week_anchor !== undefined && (typeof row.week_anchor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.week_anchor) || !Number.isFinite(Date.parse(row.week_anchor)))) return false
    if (['a', 'b'].includes(String(row.week_pattern)) && !row.week_anchor) return false
  }
  if (table === 'topics') {
    for (const key of ['unit_title', 'source_document_id', 'source_excerpt']) if (row[key] !== undefined && typeof row[key] !== 'string') return false
  }
  if (table === 'course_documents' && String(row.body_text).length > 100_000) return false
  if (table === 'course_documents') {
    if (row.extraction !== undefined && row.extraction !== 'ocr') return false
    if (row.original_type !== undefined && typeof row.original_type !== 'string') return false
    if (row.attachment_id !== undefined && typeof row.attachment_id !== 'string') return false
    if (row.pages !== undefined && (!Array.isArray(row.pages) || row.pages.length > 80 || !row.pages.every(p => isRecord(p) && Number.isInteger(p.number) && Number(p.number) >= 1 && Number(p.number) <= 80 && typeof p.text === 'string' && p.text.length <= 100_000) || row.pages.reduce((n, p) => n + String(p.text).length, 0) > 100_000 || new Set(row.pages.map(p => p.number)).size !== row.pages.length)) return false
  }
  if (table === 'notes' && row.local_draft !== undefined && row.local_draft !== null) {
    const d = row.local_draft
    if (!isRecord(d) || typeof d.title !== 'string' || typeof d.body_md !== 'string' || typeof d.at !== 'string' || !Number.isFinite(Date.parse(d.at))) return false
  }
  if (table === 'notes' && row.ai_provenance !== undefined && !validNoteProvenance(row.ai_provenance)) return false
  if (table === 'applications' && row.submitted_resume !== undefined) {
    const cv = row.submitted_resume
    if (!isRecord(cv) || typeof cv.at !== 'string' || !Number.isFinite(Date.parse(cv.at)) || typeof cv.version_name !== 'string' || typeof cv.target_role !== 'string' || !Array.isArray(cv.items) || !cv.items.every(item => validRow('resume_items', item)) || !isRecord(cv.profile) || typeof cv.profile.name !== 'string' || typeof cv.profile.institution !== 'string' || ['email', 'phone', 'website'].some(key => isRecord(cv.profile) && cv.profile[key] !== undefined && typeof cv.profile[key] !== 'string')) return false
  }
  if (table === 'recurring') {
    if (row.anchor_at !== undefined && (typeof row.anchor_at !== 'string' || !Number.isFinite(Date.parse(row.anchor_at)))) return false
    if (row.category !== undefined && typeof row.category !== 'string') return false
    if (row.method !== undefined && !['upi', 'cash', 'card', 'other'].includes(String(row.method))) return false
  }
  if (table === 'profiles') {
    if (row.id !== 'me' || !['cgpa10', 'gpa4', 'percent'].includes(String(row.grading_scheme)) || !['system', 'light', 'dark'].includes(String(row.theme))) return false
    if (!(row.grade_bands as unknown[]).length || !(row.grade_bands as unknown[]).every((band) => isRecord(band) && typeof band.letter === 'string' && typeof band.min_pct === 'number' && band.min_pct >= 0 && band.min_pct <= 100 && typeof band.points === 'number' && Number.isFinite(band.points) && band.points >= 0 && band.points <= (row.grading_scheme === 'gpa4' ? 4 : 10))) return false
    const time = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    if ((row.quiet_hours as unknown[]).length !== 2 || !(row.quiet_hours as unknown[]).every(time) || !time(row.brief_time)) return false
    if (row.notify !== undefined && (!isRecord(row.notify) || !Object.values(row.notify).every((value) => typeof value === 'boolean'))) return false
    if (Number(row.daily_capacity_min) <= 0 || Number(row.attendance_threshold) < 0 || Number(row.attendance_threshold) > 1) return false
    if (String(row.term_end) < String(row.term_start)) return false
  }
  if (table === 'resume_items' && !(row.bullets as unknown[]).every((item) => typeof item === 'string')) return false
  if (table === 'resume_versions' && !(row.item_ids as unknown[]).every((item) => typeof item === 'string')) return false
  if (table === 'assessments' && row.score !== null && (typeof row.score !== 'number' || !Number.isFinite(row.score))) return false
  if (table === 'notification_prefs' && !isRecord(row.config)) return false
  if (table === 'ai_messages' && row.sequence !== undefined && (typeof row.sequence !== 'number' || !Number.isInteger(row.sequence) || row.sequence < 0)) return false
  const enums: Partial<Record<DataTable, Record<string, readonly string[]>>> = {
    course_documents: { kind: ['syllabus', 'reference'] },
    timetable_slots: { kind: ['lecture', 'lab', 'tutorial', 'other'] },
    timetable_exceptions: { kind: ['cancelled', 'moved', 'holiday', 'extra'] },
    attendance: { status: ['present', 'absent', 'cancelled', 'excused'] },
    tasks: { status: ['todo', 'doing', 'done'], type: ['assignment', 'exam', 'quiz', 'project', 'reading', 'admin'] },
    attachments: { parent_type: ['task', 'note', 'course', 'application'] },
    sessions: { kind: ['study', 'revise', 'practice', 'task'], status: ['planned', 'done', 'skipped'] },
    note_versions: { source: ['local', 'remote'] },
    applications: { kind: ['internship', 'job', 'scholarship', 'university', 'competition'], stage: ['sourced', 'applied', 'test', 'interview', 'offer', 'rejected'], sop_status: ['none', 'draft', 'sent'], lor_status: ['none', 'requested', 'received'] },
    resume_items: { kind: ['experience', 'project', 'education', 'award'] },
    transactions: { method: ['upi', 'cash', 'card', 'other'] },
    recurring: { cadence: ['monthly', 'weekly', 'yearly'] },
    habits: { cadence: ['daily', 'weekly'] },
    ai_messages: { role: ['user', 'assistant', 'system'] },
  }
  for (const [field, values] of Object.entries(enums[table] ?? {})) if (!values.includes(String(row[field]))) return false
  const dates: Partial<Record<DataTable, string[]>> = {
    course_documents: ['imported_at'],
    profiles: ['term_start', 'term_end'], timetable_exceptions: ['date'], attendance: ['date'], assessments: ['date'],
    tasks: ['due_at'], sessions: ['date'], cards: ['due_at'], reviews: ['at'], focus_sessions: ['started', 'ended'],
    note_versions: ['at'], applications: ['deadline'], application_events: ['at'], contacts: ['last_touch', 'follow_up_at'],
    resume_items: ['start', 'end'], transactions: ['at'], recurring: ['next_at'], habit_logs: ['date'],
  }
  for (const field of dates[table] ?? []) {
    const value = row[field]
    if (value === null) continue
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value))) return false
    const day = value.slice(0, 10)
    if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return false
  }
  if (table === 'budgets' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.month))) return false
  if ((table === 'transactions' || table === 'recurring') && Number(row.amount) <= 0) return false
  if (table === 'budgets' && Number(row.limit_amount) < 0) return false
  if (table === 'habits' && Number(row.target) <= 0) return false
  return true
}

/** Same, for binary payloads (the .docx export). */
export function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const url = URL.createObjectURL(new Blob([buffer], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
