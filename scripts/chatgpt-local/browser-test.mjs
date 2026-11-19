import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createBridge } from './bridge.mjs'

const state = { status: 'disconnected', sharing: false }
let answer
const client = {
  async getSession() { return state },
  async signIn() { Object.assign(state, { status: 'connected', sharing: true, profileId: 'test-profile', identity: { email: 'student@example.test' }, credentials: { accessToken: 'never-expose-test-token' } }) },
  cancelSignIn() {},
  async disconnect() { state.status = 'disconnected'; state.sharing = false },
  async listModels() { return [{ slug: 'first', displayName: 'First account model' }, { slug: 'second', displayName: 'Second account model' }] },
  async streamResponse(options) {
    answer = options
    if (options.instructions.includes('ONLY the supplied source excerpts')) return { text: JSON.stringify({ title: 'Matrices from sources', body_md: 'Matrices have rows and columns. [S1]', citations: [{ source_id: 'S1', quote: 'A matrix is a rectangular array of numbers arranged in rows and columns.' }] }) }
    return { text: 'A checked answer from the selected ChatGPT model.' }
  },
}
const server = createBridge({ client, dist: fileURLToPath(new URL('../../dist', import.meta.url)) })
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4768, '127.0.0.1', resolve) })
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4768/#/settings')
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click()
  await page.getByRole('dialog', { name: "You're using your ChatGPT plan" }).waitFor()
  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  await page.getByLabel('ChatGPT model').selectOption('second')
  assert.equal(await page.getByText('Connected as student@example.test · Using ChatGPT plan', { exact: true }).count(), 1)
  await page.getByRole('link', { name: 'Open Tutor and choose ChatGPT', exact: true }).click()
  await page.getByLabel('AI provider').selectOption('chatgpt')
  await page.getByLabel("What's the problem?").fill('Show a hint for x²−5x+6.')
  await page.getByRole('button', { name: 'Ask Tutor', exact: true }).click()
  await page.getByText('A checked answer from the selected ChatGPT model.', { exact: true }).waitFor()
  assert.equal(answer.model, 'second')
  assert.equal(answer.input.at(-1).content, 'Show a hint for x²−5x+6.')
  const localState = await page.evaluate(() => JSON.stringify(localStorage))
  assert.ok(!localState.includes('never-expose-test-token'))
  await page.goto('http://127.0.0.1:4768/#/notes')
  await page.getByRole('button', { name: 'AI notes', exact: true }).click()
  const courseOption = page.getByLabel('Notes course').locator('option').nth(1)
  await courseOption.waitFor({ state: 'attached' })
  await page.getByLabel('Notes course').selectOption(await courseOption.getAttribute('value'))
  const topicOption = page.getByLabel('Notes topic').locator('option').nth(1)
  await topicOption.waitFor({ state: 'attached' })
  await page.getByLabel('Notes topic').selectOption(await topicOption.getAttribute('value'))
  await page.getByRole('button', { name: 'Add reference material', exact: true }).click()
  await page.getByLabel('Reference title').fill('Connector test lecture')
  await page.getByLabel('Reference text').fill('A matrix is a rectangular array of numbers arranged in rows and columns.')
  await page.getByRole('button', { name: 'Save reference locally', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add reference material' }).waitFor({ state: 'hidden' })
  await page.getByLabel('Find source excerpts').fill('Connector test lecture')
  await page.getByRole('button', { name: 'Select excerpt', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click()
  await page.getByRole('dialog', { name: 'AI notes from your sources' }).waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Note body"]')?.value === 'Matrices have rows and columns. [S1]')
  assert.equal(await page.getByLabel('Note body').inputValue(), 'Matrices have rows and columns. [S1]')
  assert.equal(answer.model, 'second')
  assert.equal(answer.input.length, 1)
  assert.equal(JSON.parse(answer.input[0].content).sources.length, 1)
  assert.match(await page.getByRole('region', { name: 'Generation sources' }).innerText(), /ChatGPT · second/)
  await page.goto('http://127.0.0.1:4768/#/settings')
  assert.equal(await page.getByRole('dialog', { name: "You're using your ChatGPT plan" }).count(), 0, 'First-use notice is not repeated')
  await page.getByRole('button', { name: 'Disconnect ChatGPT', exact: true }).click()
  await page.getByText('No active ChatGPT plan connection.', { exact: true }).waitFor()
  assert.equal(state.sharing, false)
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS local UI sign-in, account model choice, Tutor and source-linked notes routing, nested reference import, credential isolation and disconnect (mocked SDK)')
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
