import { db, type Application } from './db'
import { put } from './mutate'
import { STAGES } from '@/lib/pipeline'
import { uid } from '@/lib/id'

async function writeApplication(row: Application, previous?: Application) {
  if (previous?.submitted_resume) {
    if (row.resume_version_id !== previous.resume_version_id) throw new Error('The submitted CV snapshot is frozen. Keep this application linked to the version you recorded.')
    row = { ...row, submitted_resume: previous.submitted_resume }
  } else if (row.stage !== 'sourced' && row.resume_version_id) {
    const version = await db.resume_versions.get(row.resume_version_id)
    if (!version || version.deleted_at) throw new Error('The selected CV version is no longer available.')
    const profile = await db.profiles.get('me')
    const items = (await db.resume_items.bulkGet(version.item_ids)).filter((item): item is NonNullable<typeof item> => Boolean(item && !item.deleted_at))
    row = { ...row, submitted_resume: { at: new Date().toISOString(), version_name: version.name, target_role: version.target_role, items,
      profile: { name: profile?.name ?? '', institution: profile?.institution ?? '', email: profile?.email ?? '', phone: profile?.phone ?? '', website: profile?.website ?? '' } } }
  }
  await put('applications', row)
  if (previous && previous.stage !== row.stage) await put('application_events', {
    id: uid(), user_id: null, updated_at: '', deleted_at: null,
    application_id: row.id, at: new Date().toISOString(), kind: 'stage',
    note: `Moved to ${STAGES.find(stage => stage.key === row.stage)?.label ?? row.stage}`,
  })
}

export async function saveApplication(row: Application) {
  await db.transaction('rw', [db.applications, db.application_events, db.resume_versions, db.resume_items, db.profiles], async () => {
    await writeApplication(row, await db.applications.get(row.id))
  })
}

export async function moveApplication(id: string, dir: -1 | 1) {
  await db.transaction('rw', [db.applications, db.application_events, db.resume_versions, db.resume_items, db.profiles], async () => {
    const row = await db.applications.get(id)
    if (!row || row.deleted_at) return
    const index = STAGES.findIndex(stage => stage.key === row.stage)
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, index + dir))]
    if (next.key !== row.stage) await writeApplication({ ...row, stage: next.key }, row)
  })
}
