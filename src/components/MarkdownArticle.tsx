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

export type ArticleImage = {
  role?: string
  url?: string
  altText?: string
  caption?: string
  placementAfterHeading?: string
}

// Mirrors slugify() in beCRM articleImages.js, which is what anchors an image to a
// heading on the WordPress side. Both ends must agree or an image silently falls to
// the end of the article instead of landing in its section.
function anchorSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function figure(image: ArticleImage, key: number) {
  return (
    <figure className="article-figure" key={`figure-${key}`}>
      <img src={image.url} alt={image.altText || ''} loading="lazy" />
      {image.caption ? <figcaption>{image.caption}</figcaption> : null}
    </figure>
  )
}

export default function MarkdownArticle({
  markdown,
  hideFirstHeading = false,
  images = [],
}: {
  markdown: string
  hideFirstHeading?: boolean
  // The generated artwork, which lives outside the markdown. Placed here exactly as
  // insertGeneratedImages() places it on the WordPress post: the featured image at the
  // top, each inline image after the heading its anchor names, anything unmatched at
  // the end. Display only — the images are not part of the text being edited.
  images?: ArticleImage[]
}) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let firstHeadingHidden = false
  const usable = images.filter((image) => image?.url)
  const featured = usable.find((image) => image.role === 'featured')
  const inlineImages = usable.filter((image) => image.role !== 'featured')
  const placedImages = new Set<ArticleImage>()

  const imageForHeading = (id: string) => {
    if (!id) return null
    const match = inlineImages.find((image) => (
      !placedImages.has(image) && anchorSlug(image.placementAfterHeading || '') === id
    ))
    if (!match) return null
    placedImages.add(match)
    return match
  }

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
        if (featured) blocks.push(figure(featured, blocks.length))
        index += 1
        continue
      }
      if (level === 1) blocks.push(<h1 id={id} key={blocks.length}>{content}</h1>)
      if (level === 2) blocks.push(<h2 id={id} key={blocks.length}>{content}</h2>)
      if (level === 3) blocks.push(<h3 id={id} key={blocks.length}>{content}</h3>)
      if (level === 4) blocks.push(<h4 id={id} key={blocks.length}>{content}</h4>)
      if (level === 1 && featured) blocks.push(figure(featured, blocks.length))
      if (level === 2 || level === 3) {
        const anchored = imageForHeading(id)
        if (anchored) blocks.push(figure(anchored, blocks.length))
      }
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

  // Same fallback as the WordPress renderer: an image whose anchor matches no heading
  // is shown rather than dropped.
  for (const image of inlineImages) {
    if (!placedImages.has(image)) blocks.push(figure(image, blocks.length))
  }

  return <article className="rendered-article">{blocks}</article>
}
