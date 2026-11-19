import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const release = process.argv.includes('--release')
if (release) {
  for (const name of ['SD_KEYSTORE_PATH', 'SD_STORE_PASSWORD', 'SD_KEY_PASSWORD', 'SD_KEY_ALIAS']) if (!process.env[name]) throw new Error(`Set ${name} in your local environment before building a signed release. See ANDROID.md. Keep passwords out of chat and source files.`)
  if (!existsSync(resolve(process.env.SD_KEYSTORE_PATH))) throw new Error('The signing keystore path does not exist.')
  process.env.SD_KEYSTORE_PATH = resolve(process.env.SD_KEYSTORE_PATH)
}
const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : './gradlew', process.platform === 'win32' ? ['/c', 'gradlew.bat', release ? 'assembleRelease' : 'assembleDebug', '--no-daemon'] : [release ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], { cwd: resolve('android'), env: process.env, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
