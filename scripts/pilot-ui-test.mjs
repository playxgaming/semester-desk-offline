import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let request
  const providers = { gemini: true, groq: true }
  await page.route('**/api/health', route => route.fulfill({ json: { aiConfigured: true, providers, scannerConfigured: providers.gemini } }))
  await page.route('**/api/solve-problem', route => {
    request = route.request().postDataJSON()
    return route.fulfill({ json: { result: 'A different provider can explain this step.' } })
  })
  const base = process.env.BASE_URL || 'http://127.0.0.1:5173'
  await page.goto(base)
  const dialog = page.getByRole('dialog', { name: 'Set up Semester Desk' })
  await dialog.waitFor()
  const skip = dialog.getByRole('button', { name: 'Skip', exact: true })
  const close = dialog.getByRole('button', { name: 'Close', exact: true })
  await skip.focus()
  await page.keyboard.press('Tab')
  assert.equal(await close.evaluate(node => node === document.activeElement), true, 'Tab wraps inside the modal')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await skip.evaluate(node => node === document.activeElement), true, 'Reverse Tab wraps inside the modal')
  assert.equal(await page.getByRole('navigation', { name: 'Main', includeHidden: true }).evaluate(node => Boolean(node.closest('[inert]'))), true, 'Background navigation is inert')
  await skip.click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('[inert]').count(), 0, 'Closing restores background interaction')
  await page.goto(`${base}/#/tutor`)
  await page.getByLabel('AI provider').selectOption('groq')
  await page.getByLabel("What's the problem?").fill('Explain a quadratic without solving it for me.')
  await page.getByRole('button', { name: 'Ask Tutor', exact: true }).click()
  await page.getByText('A different provider can explain this step.', { exact: true }).waitFor()
  assert.equal(request.provider, 'groq', 'The chosen provider receives the request')
  assert.equal(await page.getByLabel('AI provider').inputValue(), 'groq')
  await page.getByLabel('AI provider').selectOption('gemini')
  providers.gemini = false
  await page.evaluate(() => window.dispatchEvent(new Event('semester-desk:ai-connection-changed')))
  await page.getByText("This conversation's provider is unavailable on the connected server.", { exact: false }).waitFor()
  assert.equal(await page.getByLabel('AI provider').inputValue(), 'gemini', 'Health refresh cannot silently move an existing conversation')
  await page.getByLabel("What's the problem?").fill('A private follow-up stays with the selected provider.')
  assert.equal(await page.getByRole('button', { name: 'Ask follow-up', exact: true }).isDisabled(), true)
  await page.getByLabel('AI provider').selectOption('groq')
  assert.equal(await page.getByRole('button', { name: 'Ask follow-up', exact: true }).isEnabled(), true)
  assert.deepEqual(errors, [])
  console.log('PASS modal keyboard containment/background isolation, explicit Groq selection and no automatic conversation reassignment')
  await context.close()
  const blocked = await browser.newContext()
  await blocked.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('Storage blocked for regression test', 'SecurityError') }
  })
  const recovery = await blocked.newPage()
  await recovery.goto(base)
  await recovery.getByRole('heading', { name: 'Your study data could not be opened' }).waitFor()
  await recovery.getByRole('button', { name: 'Try again', exact: true }).click()
  await recovery.getByRole('heading', { name: 'Your study data could not be opened' }).waitFor()
  assert.equal(await recovery.getByText('Retrying does not clear your saved data.', { exact: false }).count(), 1)
  await blocked.close()
  console.log('PASS real startup storage denial renders recovery and retry without deleting storage')
} finally { await browser.close() }
