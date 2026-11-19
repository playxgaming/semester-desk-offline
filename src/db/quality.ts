import { db, type QualityReview, type QualitySnapshot } from './db'
import { put, stamp } from './mutate'
import { qualitySnapshot, sameQualitySnapshot, validQualityReview } from '@/lib/quality'

/** Persist an append-only human review against exactly what the reviewer saw. */
export async function saveQualityReview(input: Pick<QualityReview, 'target_type' | 'target_id' | 'verdict' | 'checks' | 'issues'>, expected: QualitySnapshot) {
  const review = stamp({ ...input, deleted_at: null, snapshot: structuredClone(expected), checks: { ...input.checks }, reviewed_at: new Date().toISOString() })
  if (!validQualityReview(review)) throw new Error('Complete all checks for a usable verdict, or describe the issues for a failed review. Empty content cannot be reviewed.')
  return db.transaction('rw', [db.notes, db.course_documents, db.quality_reviews], async () => {
    const row = review.target_type === 'note' ? await db.notes.get(review.target_id) : await db.course_documents.get(review.target_id)
    if (!row || row.deleted_at) throw new Error('This item was removed. Choose an available note or document.')
    if (!sameQualitySnapshot(review.snapshot, qualitySnapshot(review.target_type, row))) throw new Error('Content changed while this review was open. Reopen the review and check the latest version.')
    await put('quality_reviews', review)
    return review
  })
}
