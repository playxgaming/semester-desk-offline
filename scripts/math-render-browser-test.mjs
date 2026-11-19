import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { createBridge } from './chatgpt-local/bridge.mjs'

// All API calls are intercepted in an isolated browser profile. Never spend
// the user's connected ChatGPT allowance or inspect their saved conversations.
const response = String.raw`Let's learn **matrices from the beginning**, in small steps.

## 1. What is a matrix?

For example, \[ A=\begin{pmatrix}2&5&-1\\4&0&3\end{pmatrix}. \]

- **Rows** run horizontally: \((2,5,-1)\) is the first row.
- **Columns** run vertically: \(\begin{pmatrix}2\\4\end{pmatrix}\) is the first column.

## 2. The size of a matrix

We always write the size as \[\boxed{\text{number of rows}\times\text{number of columns}}.\]

Our matrix \(A\) has \(2\) rows and \(3\) columns. Check: \(2\cdot3=6\).

Code stays literal: \`\(x_1\)\`.
`
const server = createBridge({ client: {}, dist: resolve('dist') })
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4768, '127.0.0.1', resolve) })
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  let requests = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/health') return route.fulfill({ json: { aiConfigured: true, providers: { gemini: false, groq: false, chatgpt: true } } })
    if (path === '/api/chatgpt/session') return route.fulfill({ json: { status: 'connected', sharing: true, csrf: 'synthetic-test-only' } })
    if (path === '/api/solve-problem') { requests++; return route.fulfill({ json: { result: response } }) }
    return route.fulfill({ status: 404, json: { error: 'No live API calls allowed in this test' } })
  })
  const base = 'http://127.0.0.1:4768'
  await page.goto(`${base}/#/tutor`)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByLabel('AI provider').selectOption('chatgpt')
  await page.getByLabel("What's the problem?").fill('Explain matrices from the beginning.')
  await page.getByRole('button', { name: 'Ask Tutor', exact: true }).click()
  await page.locator('.md .katex-display').first().waitFor()
  assert.equal(await page.locator('.md .katex-display').count(), 2)
  assert.ok(await page.locator('.md .mtable').count() >= 2)
  assert.equal(await page.locator('.md .katex-error').count(), 0)
  assert.ok(await page.locator('.md code').filter({ hasText: String.raw`\(x_1\)` }).count() > 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Matrices must not overflow the phone viewport')
  await page.reload()
  await page.getByLabel('Saved conversations').selectOption({ label: 'Explain matrices from the beginning.' })
  await page.locator('.md .katex-display').first().waitFor()
  assert.equal(await page.locator('.md .katex-display').count(), 2, 'Saved answers rerender without a new model request')
  assert.equal(requests, 1)
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS screenshot matrix example renders on mobile, code stays literal and saved conversation rerenders after reload (no real AI calls)')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
