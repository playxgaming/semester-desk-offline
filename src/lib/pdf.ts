import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { MAX_FILE_BYTES } from '@/db/files'

const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI).href
GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`

export interface PdfPageText { number: number; text: string }

/** Render a bounded batch serially for local OCR; release each canvas after use. */
export async function visitPdfImages(file: File, visit: (canvas: HTMLCanvasElement, number: number, total: number) => Promise<void>, signal?: AbortSignal) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a PDF up to 25 MB.')
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` })
  const abort = () => { void task.destroy() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 10) throw new Error('Local PDF OCR supports 10 pages at a time. Split a larger scan first.')
    for (let number = 1; number <= pdf.numPages; number++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      const page = await pdf.getPage(number), initial = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 2200 / Math.max(initial.width, initial.height))
      const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      await visit(canvas, number, pdf.numPages)
      canvas.width = canvas.height = 0; page.cleanup()
    }
  } finally { signal?.removeEventListener('abort', abort); await task.destroy() }
}

/** Local bytes only. No URL fetching, JavaScript actions, rendering or AI calls. */
export async function extractPdf(file: File, signal?: AbortSignal, progress?: (page: number, total: number) => void): Promise<PdfPageText[]> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('Choose a PDF up to 25 MB.')
  const data = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(data.slice(0, 1024)).indexOf('%PDF-') < 0) throw new Error('This file does not contain a PDF header.')
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  const task = getDocument({ data, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, useSystemFonts: false })
  const abort = () => { void task.destroy() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 80) throw new Error('This PDF has more than 80 pages. Split it into smaller files first.')
    const pages: PdfPageText[] = []
    let length = 0
    for (let number = 1; number <= pdf.numPages; number++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      let text = '', lastY: number | undefined
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = item.transform[5]
        if (lastY !== undefined && Math.abs(y - lastY) > 3 && !text.endsWith('\n')) text += '\n'
        text += item.str + (item.hasEOL ? '\n' : ' ')
        lastY = y
      }
      text = text.replace(/[ \t]+\n/g, '\n').trim()
      length += text.length
      if (length > 100_000) throw new Error('Extracted text exceeds 100,000 characters. Split the PDF by unit first.')
      pages.push({ number, text })
      page.cleanup(); progress?.(number, pdf.numPages)
    }
    if (!pages.some(p => p.text.trim())) throw new Error('This PDF has no selectable text. Scanned PDFs need OCR; paste transcribed text for now.')
    return pages
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (e instanceof Error && e.name === 'PasswordException') throw new Error('This PDF is password protected. Use an unlocked copy.')
    throw e
  } finally {
    signal?.removeEventListener('abort', abort)
    await task.destroy()
  }
}
