export type OfflineStatus = 'idle' | 'preparing' | 'ready' | 'error'
export const OFFLINE_STATUS_EVENT = 'semester-desk:offline-status'
let status: OfflineStatus = 'idle'
let pending: Promise<boolean> | null = null
export const getOfflineStatus = () => status

function update(next: OfflineStatus) {
  status = next
  window.dispatchEvent(new Event(OFFLINE_STATUS_EVENT))
}

function activated(registration: ServiceWorkerRegistration, timeoutMs: number) {
  if (registration.active?.state === 'activated') return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting ?? registration.active
    if (!worker) { reject(new Error('No offline installer was created.')); return }
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed) }
    const changed = () => {
      if (worker.state === 'activated') { cleanup(); resolve() }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('Offline asset download failed.')) }
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Offline download timed out.')) }, timeoutMs)
    worker.addEventListener('statechange', changed)
    changed()
  })
}

/** Retry interrupted public-asset downloads. Matching cached files are reused. */
export async function installOffline(
  register: () => Promise<ServiceWorkerRegistration>,
  report: (status: OfflineStatus) => void,
  delayMs = 2000,
  timeoutMs = 180_000,
): Promise<boolean> {
  report('preparing')
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await activated(await register(), timeoutMs); report('ready'); return true }
    catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))) }
  }
  report('error')
  return false
}

export function prepareOffline(): Promise<boolean> {
  if (pending) return pending
  pending = installOffline(async () => {
    try { return await navigator.serviceWorker.register('sw.js', { scope: './' }) }
    catch (error) {
      const existing = await navigator.serviceWorker.getRegistration()
      if (existing?.active?.state === 'activated') return existing
      throw error
    }
  }, update)
    .finally(() => { pending = null })
  return pending
}
