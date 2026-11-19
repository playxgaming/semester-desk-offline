import { createWorker } from 'tesseract.js'
import { Capacitor } from '@capacitor/core'
import { visitPdfImages } from './pdf'
import { adjustImage } from './images'
let active = false
export async function readLocalText(file: File, signal?: AbortSignal, progress?: (text: string) => void) {
  if (active) throw new Error('Another local OCR job is finishing. Wait briefly and try again.')
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) throw new Error('Choose a PDF, PNG, JPEG or WebP up to 25 MB.')
  active = true
  const assets = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href
  const pending = createWorker('eng', 1, { workerPath: `${assets}worker.min.js`, corePath: `${assets}core`, langPath: `${assets}lang`, gzip: Capacitor.getPlatform() !== 'android', workerBlobURL: false, cacheMethod: 'none', logger: message => progress?.(`${message.status} ${Math.round(message.progress * 100)}%`) })
  let worker: Awaited<typeof pending> | undefined
  let cancel: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new DOMException('Cancelled', 'AbortError')) })
  void cancelled.catch(() => {})
  signal?.addEventListener('abort', cancel, { once: true })
  const pages: { number: number; text: string }[] = [], confidence: number[] = []
  try {
    worker = await Promise.race([pending, cancelled])
    let length = 0
    const recognize = async (image: File | HTMLCanvasElement, number: number) => {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      const result = await Promise.race([worker!.recognize(image), cancelled])
      length += result.data.text.length
      if (length > 100_000) throw new Error('OCR text exceeds 100,000 characters. Split the scan first.')
      pages.push({ number, text: result.data.text.trim() }); confidence.push(result.data.confidence)
    }
    if (file.type === 'application/pdf') await visitPdfImages(file, async (canvas, number, total) => { progress?.(`Reading page ${number} of ${total}`); await recognize(canvas, number) }, signal)
    else await recognize(await adjustImage(file, { rotate: 0, left: 0, top: 0, width: 100, height: 100 }), 1)
    if (!pages.some(p => p.text.trim())) throw new Error('No printed English text was recognized. Try a sharper crop or enter the text manually.')
    return { pages, text: pages.map(p => p.text).join('\n\n'), confidence: Math.min(...confidence) }
  } finally {
    signal?.removeEventListener('abort', cancel)
    try { await (worker ?? await pending).terminate() } catch { /* failed initialization has no live worker */ }
    active = false
  }
}
