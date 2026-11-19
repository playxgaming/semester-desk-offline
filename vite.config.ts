import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'

// Ship PDF.js workers, character maps and fonts with the app, including offline.
const pdfAssets = fileURLToPath(new URL('./public/pdfjs/', import.meta.url))
const pdfPackage = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
mkdirSync(pdfAssets, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) cpSync(`${pdfPackage}${folder}`, `${pdfAssets}${folder}`, { recursive: true })
cpSync(`${pdfPackage}legacy/build/pdf.worker.min.mjs`, `${pdfAssets}pdf.worker.min.mjs`)
cpSync(`${pdfPackage}LICENSE`, `${pdfAssets}LICENSE`)

// OCR has no CDN fallback: the worker, portable LSTM core and English data are local.
const ocrAssets = fileURLToPath(new URL('./public/ocr/', import.meta.url))
const ocrCore = fileURLToPath(new URL('./node_modules/tesseract.js-core/', import.meta.url))
mkdirSync(`${ocrAssets}core`, { recursive: true }); mkdirSync(`${ocrAssets}lang`, { recursive: true })
// One portable LSTM core works across supported browsers without downloading
// three architecture variants. Only remove this producer's old generated files.
for (const file of readdirSync(`${ocrAssets}core`).filter(name => /^tesseract-core-(?:simd-|relaxedsimd-)?lstm\.wasm\.js$/.test(name))) unlinkSync(`${ocrAssets}core/${file}`)
cpSync(`${ocrCore}tesseract-core-lstm.wasm.js`, `${ocrAssets}core/portable-lstm.wasm.js`)
cpSync(`${ocrCore}LICENSE`, `${ocrAssets}core/LICENSE`)
cpSync(fileURLToPath(new URL('./node_modules/tesseract.js/dist/worker.min.js', import.meta.url)), `${ocrAssets}worker.min.js`)
cpSync(fileURLToPath(new URL('./node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', import.meta.url)), `${ocrAssets}LICENSE-worker.txt`)
cpSync(fileURLToPath(new URL('./node_modules/tesseract.js/LICENSE.md', import.meta.url)), `${ocrAssets}LICENSE-tesseract.md`)
cpSync(fileURLToPath(new URL('./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url)), `${ocrAssets}lang/eng.traineddata.gz`)

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:3001' } },
  preview: { proxy: { '/api': 'http://localhost:3001' } },
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // registered by hand in main.tsx, and skipped entirely in the Android
      // build where the assets are already local
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Semester Desk',
        short_name: 'Desk',
        description: 'Your whole semester in one place — offline first.',
        theme_color: '#DAFBE9',
        background_color: '#F3FBF6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}', 'pdfjs/**/*', 'ocr/**/*'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          math: ['katex'],
          db: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
})
