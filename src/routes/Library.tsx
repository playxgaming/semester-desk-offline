import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Field, PageHeader } from '@/components/ui'
import { restoreLibraryRow, searchLibrary, type LibraryRow } from '@/db/library'
import { useUi } from '@/store/ui'
import type { DataTable } from '@/db/db'
const routes: Partial<Record<DataTable, string>> = { courses: '/courses', course_documents: '/courses', notes: '/notes', note_versions: '/notes', cards: '/review', reviews: '/review', quiz_attempts: '/coach', tasks: '/tasks', subtasks: '/tasks', sessions: '/planner', applications: '/applications', contacts: '/applications', application_events: '/applications', resume_items: '/resume', resume_versions: '/resume', transactions: '/money', budgets: '/money', recurring: '/money', habits: '/money', habit_logs: '/money', timetable_slots: '/timetable', timetable_exceptions: '/timetable', attendance: '/attendance', assessments: '/grades', ai_threads: '/tutor', ai_messages: '/tutor', focus_sessions: '/focus' }
function recordRoute(item: LibraryRow) {
  if (item.table === 'quality_reviews') return `/pilot?item=${encodeURIComponent(`${item.row.target_type}:${item.row.target_id}`)}`
  if (item.table === 'courses') return `/courses/${item.row.id}`
  if (['course_documents', 'topics'].includes(item.table)) return `/courses/${item.row.course_id}`
  if (item.table === 'attachments') return item.row.parent_type === 'course' ? `/courses/${item.row.parent_id}` : item.row.parent_type === 'note' ? '/notes' : item.row.parent_type === 'application' ? '/applications' : '/tasks'
  return routes[item.table] ?? '/settings'
}
export default function Library() {
  const [query, setQuery] = useState(''), [deleted, setDeleted] = useState(false), [limit, setLimit] = useState(50), [busy, setBusy] = useState(false)
  const snapshot = useLiveQuery(async () => ({ query, deleted, rows: await searchLibrary(query, deleted) }), [query, deleted])
  const records = snapshot?.query === query && snapshot.deleted === deleted ? snapshot.rows : undefined
  const notify = useUi(s => s.notify)
  return <><PageHeader eyebrow="On this device" title="Search and Trash" lede="Find text across your notes, sources, cards, deadlines and career records. Restore soft-deleted records from Trash." />
    <div className="mb-4 flex flex-wrap gap-2"><Button onClick={() => { setDeleted(false); setLimit(50) }}>Search records</Button><Button onClick={() => { setDeleted(true); setLimit(50) }}>Trash</Button></div>
    <Field label={deleted ? 'Search Trash' : 'Search all content'} type="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(50) }} />
    <p className="my-3 text-sm text-ink-3">{records ? `${records.length} matches` : 'Searching local records…'}{deleted ? '. File bytes may be reclaimed after the recovery grace period; complete backups retain them.' : ''}</p>
    <div className="space-y-2">{records?.slice(0, limit).map(item => <Card key={`${item.table}:${item.row.id}`} className="p-3">
      <Badge>{item.table.replace(/_/g, ' ')}</Badge><h3 className="my-2 break-words text-sm font-semibold">{item.title}</h3><p className="break-words text-xs text-ink-3">{item.preview}</p>
      {deleted ? <Button className="mt-2" disabled={busy} onClick={async () => { setBusy(true); try { await restoreLibraryRow(item.table, item.row.id); notify('Record restored on this device.', 'ok') } catch (e) { notify(e instanceof Error ? e.message : 'Could not restore this record.', 'crit') } finally { setBusy(false) } }}>Restore record</Button> : <Link aria-label={`Open record: ${item.title}`} className="mt-2 inline-flex min-h-[44px] items-center text-sm text-accent underline" to={recordRoute(item)} onClick={() => { if (item.table === 'notes' || item.table === 'note_versions' || (item.table === 'attachments' && item.row.parent_type === 'note')) { try { localStorage.setItem('semester-desk:notes:selected', item.table === 'notes' ? item.row.id : String(item.table === 'note_versions' ? item.row.note_id : item.row.parent_id)) } catch { /* route still opens */ } } }}>Open record area</Link>}
    </Card>)}</div>
    {records && records.length > limit && <Button className="mt-4" onClick={() => setLimit(n => n + 50)}>Show more matches</Button>}
  </>
}
