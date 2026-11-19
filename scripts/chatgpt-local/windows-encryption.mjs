import { spawn } from 'node:child_process'
import { join } from 'node:path'

// All sensitive input/output stays in private pipes, not process arguments/logs.
const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$data = [Convert]::FromBase64String([Console]::In.ReadToEnd())
$entropy = [Text.Encoding]::UTF8.GetBytes('app.semesterdesk.chatgpt.v1')
if ($env:SEMESTER_DESK_DPAPI_OP -eq 'encrypt') {
  $result = [Security.Cryptography.ProtectedData]::Protect($data, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
  $result = [Security.Cryptography.ProtectedData]::Unprotect($data, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
}
[Console]::Out.Write([Convert]::ToBase64String($result))
`
function transform(operation, bytes) {
  if (process.platform !== 'win32') throw new Error('This local connector currently requires Windows OS credential encryption.')
  return new Promise((resolve, reject) => {
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000,
      env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', SEMESTER_DESK_DPAPI_OP: operation },
    })
    const chunks = []
    child.stdout.on('data', chunk => chunks.push(chunk))
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.once('error', () => reject(new Error('Windows credential encryption could not start.')))
    child.once('close', code => {
      if (code !== 0) return reject(new Error('Windows credential encryption is unavailable. Saved connections were not changed.'))
      resolve(Buffer.from(Buffer.concat(chunks).toString('utf8').trim(), 'base64'))
    })
    child.stdin.end(Buffer.from(bytes).toString('base64'))
  })
}
export function windowsCredentialEncryption() {
  return {
    id: 'semester-desk-windows-dpapi-v1',
    isAvailable: () => process.platform === 'win32',
    encrypt: plaintext => transform('encrypt', Buffer.from(plaintext, 'utf8')),
    decrypt: async ciphertext => (await transform('decrypt', ciphertext)).toString('utf8'),
  }
}
