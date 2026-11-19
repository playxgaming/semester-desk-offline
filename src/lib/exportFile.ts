import { Capacitor, registerPlugin } from '@capacitor/core'

export interface ExportTransport {
  begin(options: { name: string; type: string; size: number }): Promise<{ token: string }>
  append(options: { token: string; data: string }): Promise<void>
  finish(options: { token: string }): Promise<{ saved: boolean }>
  cancel(options: { token: string }): Promise<void>
  print(): Promise<void>
}
const native = registerPlugin<ExportTransport>('DeskExport')
const CHUNK = 192 * 1024
let exporting = false

/** Bounded bridge messages; the native picker resolves only after writing. */
export async function sendNativeBlob(blob: Blob, name: string, transport: ExportTransport = native): Promise<boolean> {
  if (exporting) throw new Error('Finish the current export before starting another.')
  if (blob.size > 128 * 1024 * 1024) throw new Error('This export exceeds the Android 128 MB limit. Save large attachments separately.')
  exporting = true
  let token = ''
  try {
    token = (await transport.begin({ name, type: blob.type || 'application/octet-stream', size: blob.size })).token
    for (let start = 0; start < blob.size; start += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(start, start + CHUNK).arrayBuffer())
      const parts: string[] = []
      for (let i = 0; i < bytes.length; i += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)))
      await transport.append({ token, data: btoa(parts.join('')) })
    }
    return (await transport.finish({ token })).saved
  } catch (error) {
    if (token) try { await transport.cancel({ token }) } catch { /* Native failure already cleans its temporary file. */ }
    throw error
  } finally { exporting = false }
}

export async function exportBlob(name: string, blob: Blob): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android') return sendNativeBlob(blob, name)
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

export async function printCurrentPage() {
  if (Capacitor.getPlatform() === 'android') await native.print()
  else window.print()
}
