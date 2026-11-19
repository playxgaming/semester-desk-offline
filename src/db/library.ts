import { db, DATA_TABLES, type DataTable, type Base } from './db'
import { restore } from './mutate'
export interface LibraryRow { table: DataTable; row: Base & Record<string, unknown>; title: string; preview: string }
export async function searchLibrary(query: string, deleted = false): Promise<LibraryRow[]> {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const result: LibraryRow[] = []
  await db.transaction('r', DATA_TABLES.map(table => db.table(table)), async () => {
    for (const table of DATA_TABLES) {
      if (table === 'profiles' || table === 'notification_prefs') continue
      for (const row of await db.table<Base & Record<string, unknown>>(table).toArray()) {
        if (Boolean(row.deleted_at) !== deleted) continue
        const draft = row.local_draft as { title?: string; body_md?: string } | undefined
        const title = String(draft?.title || row.title || row.name || row.org || row.front || row.code || `${table}: ${row.id}`)
        const preview = [draft?.body_md, row.body_md, row.body_text, row.note, row.notes, row.back, row.role, row.email, row.content, row.bullets].filter(Boolean).map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')
        const haystack = `${table} ${title} ${preview} ${JSON.stringify(row)}`.toLocaleLowerCase()
        if (words.every(word => haystack.includes(word))) result.push({ table, row, title, preview: preview.slice(0, 350) })
      }
    }
  })
  return result.sort((a, b) => b.row.updated_at.localeCompare(a.row.updated_at))
}
export async function restoreLibraryRow(table: DataTable, id: string) {
  if (table === 'profiles') throw new Error('Profiles are restored through complete backups.')
  await db.transaction('rw', [...DATA_TABLES.map(table => db.table(table)), db.blobs], async () => {
    const row = await db.table(table).get(id)
    if (!row?.deleted_at) return
    for (const [field, parentTable] of [['course_id', 'courses'], ['note_id', 'notes'], ['card_id', 'cards'], ['application_id', 'applications'], ['habit_id', 'habits'], ['thread_id', 'ai_threads']] as const) {
      if (row[field]) { const parent = await db.table(parentTable).get(row[field]); if (!parent || parent.deleted_at) throw new Error(`Restore the parent ${parentTable.replace('_', ' ')} record first.`) }
    }
    if (table === 'attachments') {
      const parentTable = { course: 'courses', note: 'notes', task: 'tasks', application: 'applications' }[row.parent_type as 'course' | 'note' | 'task' | 'application']
      const parent = parentTable ? await db.table(parentTable).get(row.parent_id) : null
      if (!parent || parent.deleted_at) throw new Error('Restore the attachment’s parent record first.')
    }
    if (table === 'attachments' && row.storage_path.startsWith('local:') && !await db.blobs.get(row.storage_path.slice(6))) throw new Error('The file bytes have been cleared. Restore a complete backup containing this file.')
    await restore(table, id)
  })
}
