/** Storage recovery must work before the app's database-dependent UI mounts. */
export function Startup({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const failed = error !== undefined || onRetry !== undefined
  const name = error instanceof Error ? error.name : ''
  const detail = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 400) : 'Local storage could not be opened.'
  const guidance = name === 'QuotaExceededError'
    ? 'Your device may be out of storage. Free some space in other apps, then retry.'
    : name === 'SecurityError'
      ? 'Your browser may be blocking local storage. Allow site storage or open the app in a normal browser window, then retry.'
      : 'Close other Semester Desk tabs and retry. If the problem continues, restart your browser or device.'

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12" aria-busy={!failed}>
      <p className="eyebrow text-accent">Semester Desk</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-ink">
        {failed ? 'Your study data could not be opened' : 'Opening your study desk…'}
      </h1>
      {failed ? (
        <div role="alert">
          <p className="mt-4 text-ink-2">{guidance}</p>
          <p className="mt-3 text-ink-2">Retrying does not clear your saved data. Avoid uninstalling the app or clearing site storage: those actions can remove your only local copy.</p>
          <button type="button" className="mt-6 min-h-[44px] rounded bg-accent px-5 py-3 font-semibold text-[color:var(--accent-ink)]" onClick={onRetry}>Try again</button>
          <details className="mt-6 text-sm text-ink-3">
            <summary>Technical details</summary>
            <p className="mt-2 break-words font-mono">{detail}</p>
          </details>
        </div>
      ) : <p className="mt-4 text-ink-2" role="status">Loading records stored on this device.</p>}
    </main>
  )
}
