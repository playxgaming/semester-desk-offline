import katex from 'katex'

/**
 * A small, dependency-light markdown renderer with real LaTeX.
 *
 * Code is protected first, then math is pulled out before Markdown emphasis,
 * so `$a_1$` stays literal inside code and keeps its subscript elsewhere.
 */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: 'html',
    })
  } catch {
    return `<code>${escapeHtml(tex)}</code>`
  }
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
}

export function renderMarkdown(src: string): string {
  if (!src) return ''

  // Tokens must not collide with text a student pasted (or a model returned).
  // Pick a namespace absent from the entire source rather than recognizing
  // public strings such as @@M0@@ as our own internal instructions.
  let namespace = 0
  while (src.includes(`@@SD${namespace}`)) namespace++
  const prefix = `@@SD${namespace}`
  const token = (kind: string, index: number) => `${prefix}${kind}${index}@@`

  // Protect code before math: a dollar sign in a snippet is literal, not TeX.
  const code: string[] = []
  let text = src.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, body: string) => {
    code.push(body)
    return token('C', code.length - 1)
  })
  const codeInline: string[] = []
  text = text.replace(/`([^`\n]+)`/g, (_m, body: string) => {
    codeInline.push(body)
    return token('I', codeInline.length - 1)
  })

  // Lift math out before Markdown emphasis can change subscripts.
  const math: { tex: string; display: boolean }[] = []
  const mathToken = (tex: string, display: boolean) => {
    math.push({ tex: tex.trim(), display })
    return token('M', math.length - 1)
  }
  // Tutor providers commonly emit \[...\] and \(...\), even when a prompt
  // asks for dollar delimiters. Render saved answers as-is; never rewrite code.
  text = text
    .replace(/(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g, (_m, tex: string) => mathToken(tex, true))
    .replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (_m, tex: string) => mathToken(tex, false))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => mathToken(tex, true))
    .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_m, tex: string) => mathToken(tex, false))

  // 3. escape, then build blocks
  text = escapeHtml(text)
  const lines = text.split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]
    const line = raw.trimEnd()

    // pipe tables: a header row, a |---|---| rule, then body rows
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[li + 1] ?? '')) {
      flushPara()
      closeList()
      const cells = (r: string) =>
        r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))
      const head = cells(line)
      const body: string[][] = []
      li += 2
      while (li < lines.length && /^\s*\|.*\|\s*$/.test(lines[li])) {
        body.push(cells(lines[li]))
        li++
      }
      li--
      out.push(
        `<div class="md-scroll"><table class="md-table"><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }

    if (!line.trim()) {
      flushPara()
      closeList()
      continue
    }
    const codeToken = line.match(new RegExp(`^${prefix}C(\\d+)@@$`))
    const codeBody = codeToken ? code[Number(codeToken[1])] : undefined
    if (codeBody !== undefined) {
      flushPara()
      closeList()
      out.push(`<pre><code>${escapeHtml(codeBody)}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      continue
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara()
      closeList()
      out.push('<hr />')
      continue
    }
    const quote = line.match(/^&gt;\s?(.*)$/)
    if (quote) {
      flushPara()
      closeList()
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`)
      continue
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      if (list !== want) {
        closeList()
        out.push(`<${want}>`)
        list = want
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`)
      continue
    }
    closeList()
    para.push(line.trim())
  }
  flushPara()
  closeList()

  // Only restore tokens issued by this invocation. Preserve unknown tokens
  // defensively; malformed content must never take the whole route down.
  return out
    .join('\n')
    .replace(new RegExp(`${prefix}M(\\d+)@@`, 'g'), (literal, i: string) => {
      const value = math[Number(i)]
      return value ? renderMath(value.tex, value.display) : literal
    })
    .replace(new RegExp(`${prefix}I(\\d+)@@`, 'g'), (literal, i: string) => {
      const value = codeInline[Number(i)]
      return value === undefined ? literal : `<code>${escapeHtml(value)}</code>`
    })
}

/** First ~n characters of the prose, for list previews. */
export function plainPreview(md: string, n = 140): string {
  const s = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > n ? `${s.slice(0, n)}…` : s
}
