import { useState } from 'react'
import type { ReactNode } from 'react'

type ChatMessageContentProps = {
  content: string
}

/* ------------------------------------------------------------------ *
 * Inline formatting
 * ------------------------------------------------------------------ */

// Split on the inline tokens we support, keeping the delimiters so each token
// can be mapped to an element. Order matters: `**` must be tried before `*`.
const INLINE_PATTERN =
  /(\[[^\]]+\]\(https?:\/\/[^)]+\)|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|(?<![*\w])\*[^*\n]+\*(?!\*)|(?<![_\w])_[^_\n]+_(?!\w)|https?:\/\/[^\s<>()]+)/g

function renderInline(text: string): ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter((part) => part !== undefined && part !== '')
    .map((part, index) => {
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
      if (link) {
        return (
          <a key={index} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        )
      }

      if (/^https?:\/\//.test(part)) {
        return (
          <a key={index} href={part} target="_blank" rel="noreferrer">
            {part.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        )
      }

      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <code key={index} className="chat-rich-code-inline">{part.slice(1, -1)}</code>
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{renderInline(part.slice(2, -2))}</strong>
      }

      if (part.startsWith('~~') && part.endsWith('~~')) {
        return <del key={index}>{part.slice(2, -2)}</del>
      }

      if (
        (part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))
      ) {
        return <em key={index}>{part.slice(1, -1)}</em>
      }

      return part
    })
}

/* ------------------------------------------------------------------ *
 * Line classifiers
 * ------------------------------------------------------------------ */

const BULLET = /^([-*•]|–)\s+/
const NUMBERED = /^\d+[.)]\s+/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/
const QUOTE = /^>\s?/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
const FENCE = /^```\s*([\w+-]*)\s*$/

function indentOf(line: string) {
  const match = line.match(/^\s*/)
  return match ? Math.floor(match[0].replace(/\t/g, '  ').length / 2) : 0
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableRow(line: string) {
  return line.includes('|') && tableCells(line).length > 1
}

function isTableSeparator(line: string) {
  return isTableRow(line) && tableCells(line).every((cell) => /^:?-{2,}:?$/.test(cell))
}

// A whole line wrapped in ** ** is how most models emit a section title.
function boldHeading(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('**') || !trimmed.endsWith('**') || trimmed.length <= 4) return null
  const inner = trimmed.slice(2, -2)
  return inner.includes('**') ? null : inner
}

/* ------------------------------------------------------------------ *
 * Code block (with copy affordance)
 * ------------------------------------------------------------------ */

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <figure className="chat-rich-code">
      <figcaption className="chat-rich-code-bar">
        <span className="chat-rich-code-lang">{language || 'text'}</span>
        <button type="button" className="chat-rich-code-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  )
}

/* ------------------------------------------------------------------ *
 * Block parser
 * ------------------------------------------------------------------ */

type ListItem = { text: string; depth: number }

function renderList(items: ListItem[], ordered: boolean, key: number): ReactNode {
  // Fold deeper-indented items into a nested list under the previous item.
  const nodes: ReactNode[] = []
  let cursor = 0

  while (cursor < items.length) {
    const item = items[cursor]
    const children: ListItem[] = []
    let next = cursor + 1
    while (next < items.length && items[next].depth > item.depth) {
      children.push({ ...items[next], depth: items[next].depth - 1 })
      next += 1
    }

    nodes.push(
      <li key={cursor}>
        <span className="chat-rich-list-text">{renderInline(item.text)}</span>
        {children.length ? renderList(children, ordered, cursor) : null}
      </li>,
    )
    cursor = next
  }

  return ordered ? (
    <ol key={key} className="chat-rich-list chat-rich-list-ordered">{nodes}</ol>
  ) : (
    <ul key={key} className="chat-rich-list chat-rich-list-bullet">{nodes}</ul>
  )
}

export default function ChatMessageContent({ content }: ChatMessageContentProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  const push = (node: ReactNode) => blocks.push(node)

  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trim()

    if (!line) {
      index += 1
      continue
    }

    // Fenced code
    const fence = line.match(FENCE)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      push(<CodeBlock key={blocks.length} code={code.join('\n')} language={fence[1]} />)
      continue
    }

    // Horizontal rule
    if (RULE.test(line)) {
      push(<hr key={blocks.length} className="chat-rich-rule" />)
      index += 1
      continue
    }

    // ATX heading
    const heading = line.match(HEADING)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const text = renderInline(heading[2])
      const className = `chat-rich-heading chat-rich-h${level}`
      push(
        level <= 2 ? (
          <h3 key={blocks.length} className={className}>{text}</h3>
        ) : (
          <h4 key={blocks.length} className={className}>{text}</h4>
        ),
      )
      index += 1
      continue
    }

    // Bold-only line acting as a section title
    const bold = boldHeading(line)
    if (bold) {
      push(
        <h4 key={blocks.length} className="chat-rich-heading chat-rich-h3">
          {renderInline(bold)}
        </h4>,
      )
      index += 1
      continue
    }

    // Blockquote / callout
    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && QUOTE.test(lines[index].trim())) {
        quoted.push(lines[index].trim().replace(QUOTE, ''))
        index += 1
      }
      push(
        <blockquote key={blocks.length} className="chat-rich-quote">
          {quoted.filter(Boolean).map((quote, i) => (
            <p key={i}>{renderInline(quote)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    // Table
    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(tableCells(lines[index]))
        index += 1
      }
      push(
        <div key={blocks.length} className="chat-rich-table-shell">
          <table className="chat-rich-table">
            <thead>
              <tr>{headers.map((header, i) => <th key={i}>{renderInline(header)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInline(row[cellIndex] || '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Lists — a run of bullets or numbers, keeping indent depth for nesting.
    const ordered = NUMBERED.test(line)
    if (ordered || BULLET.test(line)) {
      const items: ListItem[] = []
      while (index < lines.length) {
        const candidate = lines[index]
        const trimmed = candidate.trim()
        if (!trimmed) break
        const isOrdered = NUMBERED.test(trimmed)
        const isBullet = BULLET.test(trimmed)
        if (!isOrdered && !isBullet) {
          // A plain indented line continues the previous item.
          if (items.length && indentOf(candidate) > 0) {
            items[items.length - 1].text += ` ${trimmed}`
            index += 1
            continue
          }
          break
        }
        items.push({
          text: trimmed.replace(isOrdered ? NUMBERED : BULLET, ''),
          depth: indentOf(candidate),
        })
        index += 1
      }
      push(renderList(items, ordered, blocks.length))
      continue
    }

    // Paragraph — soft-wrapped lines join into one flowing block.
    const paragraph: string[] = []
    while (index < lines.length) {
      const candidate = lines[index].trim()
      if (
        !candidate ||
        candidate.match(HEADING) ||
        candidate.startsWith('```') ||
        RULE.test(candidate) ||
        QUOTE.test(candidate) ||
        BULLET.test(candidate) ||
        NUMBERED.test(candidate) ||
        boldHeading(candidate) ||
        isTableRow(candidate)
      ) {
        break
      }
      paragraph.push(candidate)
      index += 1
    }
    if (paragraph.length) {
      push(<p key={blocks.length}>{renderInline(paragraph.join(' '))}</p>)
    }
  }

  return <div className="chat-rich-content">{blocks}</div>
}
