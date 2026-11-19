import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Pinned official DevKit. Never fetch or execute a floating main branch.
export const revision = '0a36fefeb913055c8c7a1a29b63d82b96b2e841a'
const root = fileURLToPath(new URL('../../', import.meta.url))
const sdk = fileURLToPath(new URL('../../tools/chatgpt-devkit-source/', import.meta.url))
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, shell: false })
  if (result.error || result.status !== 0) throw new Error(`Setup failed: ${command}. Review the output above.`)
}
if (!existsSync(new URL('../../tools/chatgpt-devkit-source/.git', import.meta.url))) {
  run('git', ['clone', 'https://github.com/openai/sign-in-with-chatgpt-devkit.git', 'tools/chatgpt-devkit-source'], root)
}
const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: sdk, encoding: 'utf8', windowsHide: true }).stdout?.trim()
if (current !== revision) {
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: sdk, encoding: 'utf8', windowsHide: true }).stdout?.trim()
  if (dirty) throw new Error('The SDK checkout has local changes. Preserve them before setting up the pinned SDK.')
  run('git', ['fetch', 'origin', revision], sdk)
  run('git', ['checkout', '--detach', revision], sdk)
}
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this setup through npm run chatgpt:setup.')
run(process.execPath, [npmCli, 'ci', '--workspace', '@siwc/local', '--include-workspace-root', '--ignore-scripts', '--no-audit', '--no-fund'], sdk)
run(process.execPath, [npmCli, 'run', 'build', '-w', '@siwc/local'], sdk)
console.log('ChatGPT local SDK ready. Its license/notices remain in tools/chatgpt-devkit-source. Run npm run build, then npm run chatgpt:start.')
