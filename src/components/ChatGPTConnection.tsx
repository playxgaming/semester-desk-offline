import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Note, Panel, Select, Modal } from './ui'
import { chatgptAction, chatgptModels, chatgptSession, isChatGPTLocalWindow, CHATGPT_CONNECTION_EVENT, CHATGPT_MODEL_KEY, type ChatGPTModel, type ChatGPTSession } from '@/lib/chatgpt'
import { AI_CONNECTION_EVENT } from '@/lib/ai'

export function ChatGPTConnection() {
  const local = isChatGPTLocalWindow()
  const [session, setSession] = useState<ChatGPTSession | null>(null)
  const [models, setModels] = useState<ChatGPTModel[]>([])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [welcome, setWelcome] = useState(false)
  const alive = useRef(true)
  const previousState = useRef('')
  async function refresh() {
    try {
      const next = await chatgptSession()
      if (!alive.current) return
      setSession(next)
      setConnecting(next.status === 'connecting')
      if (next.error) setError(next.error.message)
      const state = `${next.status}:${next.sharing}:${next.profileId || ''}`
      if (state !== previousState.current) {
        previousState.current = state
        window.dispatchEvent(new Event(AI_CONNECTION_EVENT))
        if (next.status === 'connected' && next.sharing) {
          const options = await chatgptModels()
          if (!alive.current) return
          setModels(options)
          let selected = ''
          try { selected = localStorage.getItem(CHATGPT_MODEL_KEY) || '' } catch { /* use available default */ }
          const chosen = options.find(option => option.slug === selected)?.slug || options[0]?.slug || ''
          setModel(chosen)
          try {
            localStorage.setItem(CHATGPT_MODEL_KEY, chosen)
            if (!localStorage.getItem(`semester-desk:chatgpt-welcome:${next.profileId}`)) setWelcome(true)
          } catch { setWelcome(true) }
        } else { setModels([]); setModel('') }
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'The local ChatGPT connection is unavailable.') }
  }
  useEffect(() => {
    alive.current = true
    if (!local) return
    void refresh()
    const update = () => { void refresh() }
    window.addEventListener(CHATGPT_CONNECTION_EVENT, update)
    return () => { alive.current = false; window.removeEventListener(CHATGPT_CONNECTION_EVENT, update) }
  }, [local])
  useEffect(() => {
    if (!connecting) return
    const timer = window.setInterval(() => { void refresh() }, 1500)
    return () => window.clearInterval(timer)
  }, [connecting])
  async function act(action: 'signin' | 'cancel' | 'disconnect') {
    setBusy(true); setError('')
    try {
      await chatgptAction(action, action === 'signin' ? { reconsent: session?.status === 'connected' && !session.sharing } : {})
      if (action === 'signin') setConnecting(true)
      else setConnecting(false)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The connection action failed.') }
    finally { setBusy(false) }
  }
  function dismissWelcome() {
    try { localStorage.setItem(`semester-desk:chatgpt-welcome:${session?.profileId}`, '1') } catch { /* display may repeat if storage blocked */ }
    setWelcome(false)
  }
  return <Panel title="Connect ChatGPT" sub="Use your own ChatGPT plan · local Windows preview">
    <p className="mb-3 text-[13.5px] text-ink-2">Eligible ChatGPT accounts can authorize plan usage for text tutoring and source-linked notes. Tutor sends your question, course label and recent conversation. AI notes sends the course/topic labels and reference excerpts you review and select.</p>
    {!local ? <Note>Start the Windows connector with <code>npm run chatgpt:start</code>, then open its local app at <a className="inline-flex min-h-[44px] items-center underline" href="http://127.0.0.1:4768/#/settings" rel="noreferrer">127.0.0.1:4768</a>. It must be running on this computer. The hosted website and Android app do not use this local sign-in.</Note> : <>
      <p className="mb-3 text-[13px]">{connecting ? 'Complete sign-in in the OpenAI browser window. You can cancel below.' : session?.status === 'connected' ? `Connected${session.email ? ` as ${session.email}` : ''}${session.sharing ? ' · Using ChatGPT plan' : ' · Plan usage not authorized'}` : 'No active ChatGPT plan connection.'}</p>
      <div className="flex flex-wrap gap-2">
        {!connecting && <Button variant="primary" disabled={busy} onClick={() => void act('signin')}>Continue with ChatGPT</Button>}
        {connecting && <Button disabled={busy} onClick={() => void act('cancel')}>Cancel sign-in</Button>}
        {session?.status === 'connected' && <Button disabled={busy} onClick={() => void act('disconnect')}>Disconnect ChatGPT</Button>}
        <Button disabled={busy} onClick={() => { previousState.current = ''; setError(''); void refresh() }}>Refresh connection</Button>
        <a className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-accent underline" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage usage</a>
      </div>
      {models.length > 0 && <div className="mt-3"><Select label="ChatGPT model" value={model} onChange={event => { setModel(event.target.value); try { localStorage.setItem(CHATGPT_MODEL_KEY, event.target.value) } catch { setError('Could not save the model choice.') } }}>{models.map(option => <option key={option.slug} value={option.slug}>{option.displayName}</option>)}</Select><Link className="mt-2 inline-flex min-h-[44px] items-center text-accent underline" to="/tutor">Open Tutor and choose ChatGPT</Link></div>}
    </>}
    {error && <div role="alert"><Note tone="warn">{error} <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer" className="underline">Manage usage</a></Note></div>}
    <Modal open={welcome} onClose={dismissWelcome} title="You're using your ChatGPT plan" footer={<Button variant="primary" onClick={dismissWelcome}>Got it</Button>}><p>Eligible requests in Semester Desk use your ChatGPT plan allowance or available credits. Review and limit app usage in ChatGPT settings. This is separate from Semester Desk's guest data and other AI providers.</p><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-[44px] items-center text-accent underline">Manage usage</a></Modal>
  </Panel>
}
