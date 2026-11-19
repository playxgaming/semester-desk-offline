import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

// All browser scripts use disposable profiles. No live AI inference is required.
const root = resolve(import.meta.dirname, '..')
process.chdir(root)
const output = resolve(root, 'node_modules/.release-verification')
await mkdir(output, { recursive: true })
const core = process.argv.includes('--core')
const results = [], servers = []
async function run(name, args, env = {}, timeout = 240_000) {
  const started = Date.now()
  process.stdout.write(`\nVERIFY ${name}\n`)
  let log = ''
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  child.stdout.on('data', chunk => { log += chunk; process.stdout.write(chunk) })
  child.stderr.on('data', chunk => { log += chunk; process.stderr.write(chunk) })
  const timer = setTimeout(() => child.kill(), timeout)
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) }).finally(() => clearTimeout(timer))
  await writeFile(resolve(output, `${name.replace(/[^a-z0-9-]/gi, '-')}.log`), log)
  results.push({ name, passed: code === 0, seconds: Math.round((Date.now() - started) / 1000) })
  if (code !== 0) throw new Error(`${name} failed (${code}). See ${output}.`)
}
async function startServer(port, preview) {
  const ready = async () => { try { const r = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) }); return r.ok && (await r.text()).includes('Semester Desk') } catch { return false } }
  if (await ready()) { console.log(`Using existing Semester Desk server on ${port}.`); return }
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  servers.push(child)
  let log = ''; child.stdout.on('data', c => { log += c }); child.stderr.on('data', c => { log += c })
  for (let i = 0; i < 45; i++) {
    if (await ready()) return
    if (child.exitCode !== null) throw new Error(`Server ${port} failed: ${log}`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Server ${port} did not start: ${log}`)
}
try {
  if (!process.argv.includes('--skip-build')) {
    await run('TypeScript', ['node_modules/typescript/bin/tsc', '--noEmit'])
    await run('Production build', ['node_modules/vite/bin/vite.js', 'build'])
  }
  await build({ entryPoints: ['scripts/check.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: resolve(output, 'calculators.cjs'), loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, logLevel: 'error' })
  await run('Calculators', [resolve(output, 'calculators.cjs')])
  await run('AI server contracts', ['--test', 'server/test.mjs'])
  await run('ChatGPT bridge contracts', ['--test', 'scripts/chatgpt-local/test.mjs'])
  for (const script of ['render-recovery-test', 'planner-reminder-regression', 'backup-regression', 'offline-data-regression', 'improvement-regression', 'ai-notes-data-test', 'notes-quality-eval', 'remaining-milestones-data-test', 'quality-reviews-data-test']) await run(script, [`scripts/${script}.mjs`])
  if (!core) {
    await startServer(5173, false); await startServer(4173, true)
    const scripts = [
      ['improvement-ui-test', 'dev'], ['documents-phase-test', 'preview'], ['ai-notes-ui-test', 'preview'],
      ['remaining-milestones-ui-test', 'preview'], ['ocr-pdf-test', 'preview'], ['card-edit-test', 'preview'],
      ['planner-persistence-test', 'dev'], ['pilot-ui-test', 'preview'], ['quality-reviews-ui-test', 'preview'],
      ['onboarding-test', 'preview'], ['category-regression', 'dev'], ['life-flows-test', 'dev'],
      ['tutor-test', 'dev'], ['scanner-cancel-test', 'dev'], ['ai-flow-test', 'dev'],
      ['math-render-browser-test', 'dev'], ['install-test', 'preview'], ['offline-test', 'preview'],
      ['flow-test', 'preview'], ['mobile-audit', 'preview'], ['chatgpt-local/browser-test', 'preview'],
      ['release-ui-test', 'preview'],
    ]
    for (const [script, mode] of scripts) {
      const url = `http://127.0.0.1:${mode === 'dev' ? 5173 : 4173}`
      await run(script, [`scripts/${script}.mjs`], { APP_URL: url, BASE_URL: url }, script === 'mobile-audit' ? 360_000 : 240_000)
    }
  }
  console.log(`\nPASS: ${results.length} release verification groups. Synthetic AI only; no physical-device or live-model accuracy claim.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally {
  for (const child of servers) child.kill()
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ at: new Date().toISOString(), coreOnly: core, results }, null, 2))
}
