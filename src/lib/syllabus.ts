export interface SyllabusTopicDraft {
  name: string
  unit: string
  excerpt: string
  minutes: number
  selected: boolean
}

export const normalizeTopic = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** A transparent local outline parser. It proposes lines, never invented content. */
export function parseSyllabus(text: string): SyllabusTopicDraft[] {
  if (text.length > 100_000) throw new Error('Paste up to 100,000 characters at a time. Split a larger syllabus by unit.')
  let unit = ''
  const seen = new Set<string>()
  const topics: SyllabusTopicDraft[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#{1,6}\s+/, '')
    if (!line) continue
    if (/^(?:unit|module|chapter)\s+(?:\d+|[ivxlcdm]+)\b/i.test(line)) { unit = line.slice(0, 200); continue }
    if (/^(?:course code|credits?|references?|textbooks?)\s*[:\-]/i.test(line)) continue
    const name = line.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim()
    const key = normalizeTopic(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    topics.push({ name: name.slice(0, 300), unit, excerpt: raw.trim().slice(0, 600), minutes: 60, selected: true })
    if (topics.length > 200) throw new Error('This contains more than 200 topic lines. Import one unit at a time.')
  }
  return topics
}
