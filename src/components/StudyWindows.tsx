import { useState } from 'react'
import { Button, Field, Modal, Note, Select } from './ui'
import { useProfile } from '@/hooks/data'
import { saveProfile } from '@/db/mutate'
import { validWindows, type StudyWindow } from '@/lib/availability'
export function StudyWindows() {
  const profile = useProfile()
  const [open, setOpen] = useState(false), [enabled, setEnabled] = useState(false), [rows, setRows] = useState<StudyWindow[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const edit = (i: number, value: Partial<StudyWindow>) => setRows(current => current.map((row, index) => index === i ? { ...row, ...value } : row))
  return <><Button onClick={() => { setEnabled(profile.study_windows !== undefined); setRows(profile.study_windows ?? [1, 2, 3, 4, 5].map(weekday => ({ weekday, start: '18:00', end: '20:00' }))); setError(''); setOpen(true) }}>Study hours</Button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false) }} title="Available study hours" wide footer={<Button variant="primary" disabled={busy} onClick={async () => {
      if (enabled && !validWindows(rows)) { setError('Use valid times, with end after start and no overlapping windows on a day.'); return }
      setBusy(true)
      try { await saveProfile({ study_windows: enabled ? rows : undefined }); setOpen(false) }
      catch { setError('Study hours could not be saved. Your previous settings are unchanged.') }
      finally { setBusy(false) }
    }}>Save study hours</Button>}>
      <Note>Timed plans stay within these weekly windows, avoid classes and existing timed blocks, and finish task work before its exact deadline. Daily capacity still caps the total. Existing untimed blocks reserve minutes. Rebuild after changing hours; your saved blocks are not moved automatically.</Note>
      <label className="my-3 flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} />Use timed study windows</label>
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      {enabled && <div className="space-y-3">{rows.map((row, i) => <div key={i} className="grid grid-cols-2 gap-2 rounded border border-rule p-2 sm:grid-cols-4">
        <Select label={`Study day ${i + 1}`} value={row.weekday} disabled={busy} onChange={e => edit(i, { weekday: Number(e.target.value) })}>{days.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}</Select>
        <Field label={`Available from ${i + 1}`} type="time" value={row.start} disabled={busy} onChange={e => edit(i, { start: e.target.value })} />
        <Field label={`Available until ${i + 1}`} type="time" value={row.end} disabled={busy} onChange={e => edit(i, { end: e.target.value })} />
        <Button disabled={busy} onClick={() => setRows(current => current.filter((_, index) => i !== index))}>Remove window {i + 1}</Button>
      </div>)}<Button disabled={busy || rows.length >= 35} onClick={() => setRows(current => [...current, { weekday: 1, start: '18:00', end: '20:00' }])}>Add study window</Button>
      {!rows.length && <p className="text-sm">No windows means no available time. Add a window or turn timed planning off.</p>}</div>}
    </Modal></>
}
