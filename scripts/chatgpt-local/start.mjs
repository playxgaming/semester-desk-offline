import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBridge } from './bridge.mjs'
import { windowsCredentialEncryption } from './windows-encryption.mjs'

if (process.platform !== 'win32') throw new Error('This connector currently provides Windows credential storage. Other systems need their own OS-backed adapter.')
const sdk = new URL('../../tools/chatgpt-devkit-source/packages/local/dist/index.js', import.meta.url)
if (!existsSync(sdk)) throw new Error('Run npm run chatgpt:setup first to install the pinned official SDK.')
const dist = fileURLToPath(new URL('../../dist', import.meta.url))
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run npm run build before starting the local connection.')
const encryption = windowsCredentialEncryption()
const probe = 'Semester Desk credential encryption check'
if (await encryption.decrypt(await encryption.encrypt(probe)) !== probe) throw new Error('Windows credential encryption failed its startup check.')
const { createChatGPT } = await import(sdk.href)
const client = createChatGPT({ appName: 'Semester Desk', appId: 'app.semesterdesk', redirectPort: 0, sendHostId: true,
  storageDir: join(homedir(), 'AppData', 'Local', 'SemesterDesk', 'ChatGPT'), credentialEncryption: encryption,
})
const server = createBridge({ client, dist })
server.once('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4768 is busy. Close the other local connector first.' : 'The local connector could not start.'); process.exitCode = 1 })
server.listen(4768, '127.0.0.1', () => console.log('Semester Desk ChatGPT connection: http://127.0.0.1:4768/#/settings\nOpen Settings and choose Continue with ChatGPT. Keep this terminal running. Credentials stay encrypted for this Windows user.'))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { client.cancelSignIn(); server.close(() => process.exit(0)) })
