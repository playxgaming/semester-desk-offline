import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Note, Panel } from '@/components/ui'
import { aiHealth, getAiApiBase, setAiApiBase } from '@/lib/ai'
import { ChatGPTConnection } from './ChatGPTConnection'
import { AI_GUIDE_URL } from '@/lib/release'

export function AiConnection() {
  const [address, setAddress] = useState(getAiApiBase)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)
  async function connect() {
    setBusy(true); setMessage(''); setOk(false)
    try {
      setAiApiBase(address)
      const health = await aiHealth('scanner')
      if (health.localChatGPT) throw new Error('This is the ChatGPT text connector. Enter a separate Gemini/Groq server address for the image backend.')
      if (!health.aiConfigured) throw new Error('The server is reachable, but no Gemini or Groq key is configured in its environment settings.')
      setOk(true)
      const names = health.providers ? Object.entries(health.providers).filter(([, enabled]) => enabled).map(([name]) => name === 'groq' ? 'Groq' : 'Gemini').join(' and ') : 'AI'
      setMessage(`Server connected and a key is configured. ${names} available. Ask a Tutor question to verify model access and quota.${health.scannerConfigured === false ? ' Image Scanner still needs Gemini.' : ''}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed. Check the server address and CORS settings.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-4"><ChatGPTConnection />{<Panel title="AI connection" sub="Gemini / Groq server">
    <p className="mb-3 text-[13.5px] text-ink-2">Connect the server once on this device. It keeps your Gemini and Groq keys private. Choose the provider in Tutor or AI notes; remote image AI uses Gemini. Local English OCR needs no key. Never enter an API key here.</p>
    <Field label="AI server address" type="url" placeholder="https://your-server.onrender.com" value={address} onChange={e => setAddress(e.target.value)} disabled={busy} hint="Use the server origin only, without /api. Leave empty to use the address bundled with the app." />
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="primary" disabled={busy} onClick={() => void connect()}>{busy ? 'Checking connection…' : 'Save & test connection'}</Button>
      <Button disabled={busy} onClick={() => { setAiApiBase(''); setAddress(getAiApiBase()); setMessage('Using the default server address.'); setOk(false) }}>Use default</Button>
      <a className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-accent underline" href={AI_GUIDE_URL} target="_blank" rel="noopener noreferrer">AI setup guide</a>
    </div>
    {message && <div role="status"><Note tone={ok ? 'ok' : 'warn'}>{message}</Note></div>}
    <p className="mt-3 text-[12px] text-ink-3">A connection check does not spend model tokens. <Link className="inline-flex min-h-[44px] items-center text-accent underline" to="/tutor">Open AI Tutor</Link> to test an answer.</p>
  </Panel>}</div>
}
