export interface ChatGPTSession {
  status: 'disconnected' | 'connecting' | 'connected' | 'reauth_required'
  sharing: boolean
  profileId?: string
  email?: string
  name?: string
  error?: { code: string; message: string } | null
}
export interface ChatGPTModel { slug: string; displayName: string }
export const CHATGPT_CONNECTION_EVENT = 'semester-desk:chatgpt-connection'
export const CHATGPT_MODEL_KEY = 'semester-desk:chatgpt-model'
let csrf = '' // Per-launch request protection only; never an OAuth credential.

export function isChatGPTLocalWindow(): boolean {
  return typeof window !== 'undefined' && window.location.origin === 'http://127.0.0.1:4768'
}
async function localRequest<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  if (!isChatGPTLocalWindow()) throw new Error('Open the Windows local connector at http://127.0.0.1:4768 to use your ChatGPT plan.')
  if (data && !csrf) await chatgptSession()
  const response = await fetch(`/api/${path}`, { method: data ? 'POST' : 'GET', cache: 'no-store', signal,
    headers: data ? { 'Content-Type': 'application/json', 'X-Semester-Desk-CSRF': csrf } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error || 'The local ChatGPT connector is unavailable. Keep its terminal open and retry.')
  return result as T
}
export async function chatgptSession(): Promise<ChatGPTSession> {
  const data = await localRequest<ChatGPTSession & { csrf: string }>('chatgpt/session', undefined, AbortSignal.timeout(15_000))
  if (typeof data.csrf !== 'string' || !['connected', 'connecting', 'disconnected', 'reauth_required'].includes(data.status)) throw new Error('The local connection returned an invalid status.')
  csrf = data.csrf
  return data
}
export async function chatgptAction(action: 'signin' | 'cancel' | 'disconnect', data: object = {}): Promise<void> {
  await localRequest(`chatgpt/${action}`, data, AbortSignal.timeout(20_000))
  window.dispatchEvent(new Event(CHATGPT_CONNECTION_EVENT))
}
export async function chatgptModels(): Promise<ChatGPTModel[]> {
  const data = await localRequest<{ models: ChatGPTModel[] }>('chatgpt/models', undefined, AbortSignal.timeout(60_000))
  if (!Array.isArray(data.models) || data.models.some(model => typeof model.slug !== 'string' || typeof model.displayName !== 'string')) throw new Error('Could not load ChatGPT models for this account.')
  return data.models
}
export async function chatgptQuestion<T>(body: object, signal?: AbortSignal, path = 'solve-problem'): Promise<T> {
  if (!['solve-problem', 'generate-notes'].includes(path)) throw new Error('This feature is not supported by the local ChatGPT connector.')
  let model = ''
  try { model = localStorage.getItem(CHATGPT_MODEL_KEY) || '' } catch { /* choose first available */ }
  const data = await localRequest<{ result: T }>(path, { ...body, model }, signal)
  return data.result
}
