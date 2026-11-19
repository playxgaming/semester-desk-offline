import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = new URL('../node_modules/.render-recovery-test.cjs', import.meta.url)
const bundle = await build({
  stdin: { contents: `
    export { renderMarkdown } from './src/lib/markdown';
    export { Startup } from './src/components/Startup';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  `, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
})
await writeFile(output, bundle.outputFiles[0].contents)
const { renderMarkdown, Startup, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(fileURLToPath(output))

for (const literal of ['@@M999@@', '@@C999@@', '@@M0@@', '@@SD0M0@@']) {
  assert.ok(renderMarkdown(literal).includes(literal), `Literal marker survives: ${literal}`)
}
const mixed = renderMarkdown('@@M0@@ and $x_1$')
assert.ok(mixed.includes('@@M0@@'))
assert.ok(mixed.includes('katex'))
const fenced = renderMarkdown('```js\nconst price = "$x_1$"; // **bold**\n```')
assert.ok(fenced.includes('$x_1$'))
assert.ok(!fenced.includes('katex'), 'Math inside fenced code stays literal')
assert.ok(!fenced.includes('<strong>'), 'Formatting inside fenced code stays literal')
const inline = renderMarkdown('Use `$x_1$ **literal**` then $y_2$.')
assert.ok(inline.includes('<code>$x_1$ **literal**</code>'))
assert.ok(inline.includes('katex'))
const html = renderMarkdown('<img src=x onerror=alert(1)>')
assert.ok(!html.includes('<img'))
assert.ok(html.includes('&lt;img'))
const matrix = renderMarkdown(String.raw`For example, \[ A=\begin{pmatrix}2&5&-1\\4&0&3\end{pmatrix}. \]`)
assert.ok(matrix.includes('katex-display'), 'ChatGPT bracket-delimited matrix renders as display math')
assert.ok(matrix.includes('mtable'), 'Matrix renders as a KaTeX matrix')
assert.ok(!matrix.includes('katex-error'), 'Valid matrix does not become a TeX error')
assert.ok(!matrix.includes(String.raw`\begin{pmatrix}`), 'Matrix source is not shown literally')
const parens = renderMarkdown(String.raw`Our matrix \(A\) has \(2\) rows and \(3\) columns. Check: \(2\cdot3=6\).`)
assert.equal((parens.match(/class="katex"/g) || []).length, 4, 'Parenthesis delimiters render inline math')
assert.ok(!parens.includes(String.raw`\(`))
const multiline = renderMarkdown(String.raw`\[
\boxed{\text{number of rows}\times\text{number of columns}}
\]`)
assert.ok(multiline.includes('katex-display'))
assert.ok(!multiline.includes('katex-error'))
const mathCode = renderMarkdown('`\\(x\\)` and\n\n```tex\n\\[ A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix} \\]\n```')
assert.ok(mathCode.includes(String.raw`\(x\)`), 'Parenthesis delimiters inside inline code stay literal')
assert.ok(mathCode.includes(String.raw`\begin{pmatrix}`), 'Bracket delimiters inside fenced code stay literal')
assert.ok(!mathCode.includes('katex'))
const mixedDelimiters = renderMarkdown(String.raw`$a_1$ and \(b_2\), then $$c_3$$ and \[d_4\].`)
assert.equal((mixedDelimiters.match(/class="katex"/g) || []).length, 4, 'All four supported delimiter forms coexist')
assert.ok(renderMarkdown(String.raw`Unclosed \[ a_1`).includes(String.raw`\[`), 'Unclosed delimiter stays literal')
console.log('PASS literal marker collisions, math/code isolation and HTML escaping')
console.log('PASS ChatGPT inline/display delimiters, matrix layout, multiline math and code protection')

const loading = renderToStaticMarkup(createElement(Startup, {}))
assert.ok(loading.includes('role="status"'))
const storageError = Object.assign(new Error('<script>private diagnostic</script>'), { name: 'QuotaExceededError' })
const recovery = renderToStaticMarkup(createElement(Startup, { error: storageError, onRetry: () => {} }))
assert.ok(recovery.includes('role="alert"'))
assert.ok(recovery.includes('out of storage'))
assert.ok(recovery.includes('Try again'))
assert.ok(recovery.includes('Retrying does not clear your saved data'))
assert.ok(!recovery.includes('<script>'), 'Diagnostic is escaped as ordinary text')
const blocked = renderToStaticMarkup(createElement(Startup, { error: Object.assign(new Error('blocked'), { name: 'SecurityError' }) }))
assert.ok(blocked.includes('blocking local storage'))
console.log('PASS loading, quota/security recovery guidance and diagnostic escaping')
