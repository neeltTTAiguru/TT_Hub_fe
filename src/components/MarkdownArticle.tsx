import type { ReactNode } from 'react'

// A proposed edit, anchored to the passage it rewrites. The renderer walks the
// article in blocks anyway, so a fix is shown against the block its `find`
// actually falls in rather than collected into a list somewhere else — the point
// of an inline fix is that you can see what it is talking about.
export type ArticleFix = {
  id: string
  keyword: string
  find: string
  replace: string
  why: string
}

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

// Splits a block's text around the fix anchor so the passage being changed is
// visibly marked, instead of the card pointing at prose the reader has to find.
function markFind(value: string, find: string): ReactNode[] {
  const at = value.indexOf(find)
  if (at < 0) return inlineMarkdown(value)
  return [
    ...inlineMarkdown(value.slice(0, at)),
    <mark className="article-fix-target" key="fix-target">{inlineMarkdown(find)}</mark>,
    ...inlineMarkdown(value.slice(at + find.length)),
  ]
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

// Mirrors NON_CONTENT_HEADING and imageSlots() in beCRM articleImages.js. Both ends
// place the same images in the same sections, so the draft pane shows the article
// exactly as WordPress will render it.
const NON_CONTENT_HEADING = /^(?:in this article|on this page|contents|summary|frequently asked questions|faqs?|next steps?)\b/i

function imageSlots(count: number, sectionCount: number) {
  const slots: number[] = []
  if (!sectionCount) return slots
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0 : index / (count - 1)
    let slot = Math.round(ratio * (sectionCount - 1))
    while (slots.includes(slot) && slot < sectionCount - 1) slot += 1
    while (slots.includes(slot) && slot > 0) slot -= 1
    if (slots.includes(slot)) break
    slots.push(slot)
  }
  return slots
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
  fixes = [],
  renderFix,
}: {
  markdown: string
  hideFirstHeading?: boolean
  // The generated artwork, which lives outside the markdown. Placed here exactly as
  // insertGeneratedImages() places it on the WordPress post: the featured image at the
  // top, each inline image after the heading its anchor names, anything unmatched at
  // the end. Display only — the images are not part of the text being edited.
  images?: ArticleImage[]
  // Proposed edits and how to draw one. The renderer owns placement — it is the
  // only thing that knows which block a `find` landed in — and the caller owns
  // what the card looks like and what accept/decline do.
  fixes?: ArticleFix[]
  renderFix?: (fix: ArticleFix) => ReactNode
}) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let firstHeadingHidden = false

  const usable = images.filter((image) => image?.url)
  // Hero first, so the top photo is the hero shot. It is the post's featured image
  // too, but the blog theme does not render that on the article itself.
  const ordered = [
    ...usable.filter((image) => image.role === 'featured'),
    ...usable.filter((image) => image.role !== 'featured'),
  ]
  const sectionTitles = [...markdown.matchAll(/^##\s+(.+)$/gm)]
    .map((match) => match[1].replace(/[*_`]/g, '').trim())
    .filter((title) => title && !NON_CONTENT_HEADING.test(title))
  const slots = imageSlots(ordered.length, sectionTitles.length)
  const imageBySection = new Map<number, ArticleImage>()
  slots.forEach((slot, position) => imageBySection.set(slot, ordered[position]))
  const leftovers = ordered.slice(slots.length)
  let sectionsSeen = 0

  // Only fixes whose anchor is still present; one whose passage has been edited
  // away is silently gone rather than shown against the wrong paragraph.
  const pending = fixes.filter((fix) => fix.find && markdown.includes(fix.find))
  const shown = new Set<string>()
  // Runs after each block with the block's own source text. A fix whose anchor
  // starts inside this block belongs here.
  const fixesFor = (source: string) => {
    if (!renderFix) return
    for (const fix of pending) {
      if (shown.has(fix.id) || !source.includes(fix.find)) continue
      shown.add(fix.id)
      blocks.push(<div className="article-fix-slot" key={`fix-${fix.id}`}>{renderFix(fix)}</div>)
    }
  }
  const anchorIn = (source: string) => pending.find((fix) => !shown.has(fix.id) && source.includes(fix.find))

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
      const headingAnchor = anchorIn(line)
      const content = headingAnchor
        ? markFind(heading[2], headingAnchor.find.replace(/^#{1,4}\s+/, ''))
        : inlineMarkdown(heading[2])
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
      fixesFor(line)
      // No photo under the title: the first one waits for the opening section, so the
      // intro is read before the article shows a picture.
      if (level === 2) {
        const headingText = heading[2].replace(/[*_`]/g, '').trim()
        if (!NON_CONTENT_HEADING.test(headingText)) {
          const slotted = imageBySection.get(sectionsSeen)
          sectionsSeen += 1
          if (slotted) blocks.push(figure(slotted, blocks.length))
        }
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
    const text = paragraph.join(' ')
    const anchor = anchorIn(text)
    blocks.push(<p key={blocks.length}>{anchor ? markFind(text, anchor.find) : inlineMarkdown(text)}</p>)
    fixesFor(text)
  }

  // Same fallback as the WordPress renderer: an article with fewer sections than
  // images still shows them all, at the end.
  for (const image of leftovers) blocks.push(figure(image, blocks.length))
  // A fix whose anchor spans blocks — a `find` covering a heading and the line
  // under it — matches no single block. It goes at the end rather than being
  // dropped, because a proposal the editor never sees is worse than one shown
  // slightly out of place.
  if (renderFix) {
    for (const fix of pending) {
      if (shown.has(fix.id)) continue
      shown.add(fix.id)
      blocks.push(<div className="article-fix-slot" key={`fix-${fix.id}`}>{renderFix(fix)}</div>)
    }
  }

  return <article className="rendered-article">{blocks}</article>
}
