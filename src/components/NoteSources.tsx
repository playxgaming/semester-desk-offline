import type { Note as NoteRow } from '@/db/db'
import { prettyDateTime } from '@/lib/date'

export function NoteSources({ note }: { note: NoteRow }) {
  const data = note.ai_provenance
  if (!data) return null
  return <section className="mt-5 space-y-2 border-t border-rule pt-3" aria-label="Generation sources">
    <h3 className="text-sm font-semibold">Sources and generation details</h3>
    <p className="break-words text-xs text-ink-3">{data.provider === 'chatgpt' ? 'ChatGPT' : data.provider === 'groq' ? 'Groq' : 'Gemini'} · {data.model} · {prettyDateTime(data.generated_at)}</p>
    {(data.style || data.level) && <p className="text-xs text-ink-3">Format: {data.style ?? 'summary'} · Level: {data.level ?? 'undergraduate'}</p>}
    <p className="text-xs text-ink-3">These are the excerpts sent for this generation, retained on this device. References belong to the original generated draft; check them again after editing. A matched quote does not verify every claim.</p>
    {data.sources.map(source => <details key={source.id} className="rounded border border-rule p-2">
      <summary className="min-h-[44px] cursor-pointer break-words py-2 text-sm">[{source.id}] {source.title}</summary>
      <div className="space-y-2 text-sm">
        {data.citations.filter(c => c.source_id === source.id).map((citation, i) => <blockquote key={i} className="break-words border-l-2 border-accent pl-3">{citation.quote}</blockquote>)}
        <p className="text-xs font-semibold text-ink-3">Full excerpt sent to the provider</p>
        <pre className="whitespace-pre-wrap break-words font-sans">{source.text}</pre>
      </div>
    </details>)}
  </section>
}
