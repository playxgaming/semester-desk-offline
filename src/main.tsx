import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400-italic.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/bricolage-grotesque/latin-500.css'
import '@fontsource/bricolage-grotesque/latin-700.css'
import './index.css'
import 'katex/dist/katex.min.css'
import { ensureProfile } from '@/db/mutate'
import { seedIfEmpty } from '@/db/seed'
import { overnightRebalance, startReminderRefresh } from '@/lib/scheduler'
import { initAndroid } from '@/lib/android'
import { repairAttendance } from '@/db/attendance'
import { purgeOrphanBlobs } from '@/db/files'
import { Startup } from '@/components/Startup'
import { prepareOffline } from '@/lib/offline'
import { isChatGPTLocalWindow } from '@/lib/chatgpt'

const root = ReactDOM.createRoot(document.getElementById('root')!)

async function start() {
  root.render(<Startup />)
  try {
    await boot()
  } catch (error) {
    root.render(<Startup error={error} onRetry={() => void start()} />)
  }
}

async function boot() {
  await ensureProfile()
  await seedIfEmpty()
  await repairAttendance()
  void purgeOrphanBlobs().catch(() => { /* collection can wait; keep records available */ })
  void initAndroid()
  startReminderRefresh()

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  // The service worker only earns its place in a browser: inside the Android
  // app the assets are already on disk, and a worker under the capacitor://
  // scheme buys nothing but a class of bug.
  const native = Boolean(
    (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
  )
  if (!native && !isChatGPTLocalWindow() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    void prepareOffline()
  }

  // after paint: pull yesterday's unfinished work forward, then refresh the
  // device's reminder schedule so the morning brief is already correct
  void (async () => {
    try {
      await overnightRebalance()
      const { reschedule } = await import('@/lib/scheduler')
      await reschedule()
    } catch {
      /* reminders are best-effort; never block the app on them */
    }
  })()
}

void start()
