import type { ReactNode } from 'react'

function inlineMarkdown(value: string): ReactNode[] {
  const tokens = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g)

  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index}>{token.slice(1, -1)}</code>
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    }
    return token
  })
}

function headingId(value: string) {
  return value
    .replace(/\*\*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function MarkdownArticle({
  markdown,
  hideFirstHeading = false,
}: {
  markdown: string
  hideFirstHeading?: boolean
}) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let firstHeadingHidden = false

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(<pre className="article-code" key={blocks.length}><code>{code.join('\n')}</code></pre>)
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const content = inlineMarkdown(heading[2])
      const id = headingId(heading[2])
      if (level === 1 && hideFirstHeading && !firstHeadingHidden) {
        firstHeadingHidden = true
        index += 1
        continue
      }
      if (level === 1) blocks.push(<h1 id={id} key={blocks.length}>{content}</h1>)
      if (level === 2) blocks.push(<h2 id={id} key={blocks.length}>{content}</h2>)
      if (level === 3) blocks.push(<h3 id={id} key={blocks.length}>{content}</h3>)
      if (level === 4) blocks.push(<h4 id={id} key={blocks.length}>{content}</h4>)
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''))
        index += 1
      }
      blocks.push(<ul key={blocks.length}>{items.map((item, itemIndex) => (
        <li key={itemIndex}>{inlineMarkdown(item)}</li>
      ))}</ul>)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      blocks.push(<ol key={blocks.length}>{items.map((item, itemIndex) => (
        <li key={itemIndex}>{inlineMarkdown(item)}</li>
      ))}</ol>)
      continue
    }

    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2))
        index += 1
      }
      blocks.push(<blockquote key={blocks.length}>{inlineMarkdown(quote.join(' '))}</blockquote>)
      continue
    }

    const paragraph = [line]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+|^[-*]\s+|^\d+\.\s+|^>\s+|^```/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(<p key={blocks.length}>{inlineMarkdown(paragraph.join(' '))}</p>)
  }

  return <article className="rendered-article">{blocks}</article>
}
