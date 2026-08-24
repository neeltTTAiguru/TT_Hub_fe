import { useMemo } from 'react'
import type { ReactNode } from 'react'
import MarkdownArticle from '../MarkdownArticle'
import type { ArticleFix, ArticleImage } from '../MarkdownArticle'

// The H1 names the panel and the uploaded media; without one the backend falls
// back to a generic filename slug.
export function draftTitle(value: string) {
  return value.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim() || 'Untitled draft'
}

// The published field-guide layout is assembled from the article's own content:
// the H1 becomes the hero title, the opening paragraph becomes both the hero lead
// and the Article Overview card, and the H2s become the In This Article list. The
// body then renders without its H1 and lead so nothing appears twice.
function parseFieldGuide(markdown: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim() || ''
  const afterTitle = markdown.replace(/^#\s+.+$/m, '').replace(/^\s+/, '')
  const lead = afterTitle.split(/\n{2,}/).find((block) => {
    const t = block.trim()
    return t && !t.startsWith('#') && !t.startsWith('-') && !t.startsWith('*')
  })?.trim() || ''
  const sections = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/[*_`]/g, '').trim())
  const body = lead ? afterTitle.replace(lead, '').replace(/^\s+/, '') : afterTitle
  return { title, lead, sections, body }
}

// The writer ends an article with a `---` rule, then publishing metadata for the
// editor. That tail is not part of the piece, so the panel reads the article and
// the metadata separately instead of rendering the seam as prose.
export function splitDraft(value: string) {
  const match = value.match(/\n-{3,}\s*\n(?=[\s\S]*?^(?:Meta title|Slug|Sources|Needs verification)\s*:)/m)
  if (!match || match.index === undefined) return { article: value, meta: '' }
  return {
    article: value.slice(0, match.index).trimEnd(),
    meta: value.slice(match.index + match[0].length).trim(),
  }
}

// The article exactly as trustedtechnology.ai will render it. Shared by the draft
// panel beside the chat and the publish page, so what the writer reviews on one is
// the same object they approve on the other.
export default function FieldGuideArticle({
  markdown,
  images,
  fixes = [],
  renderFix,
}: {
  markdown: string
  images: ArticleImage[]
  fixes?: ArticleFix[]
  renderFix?: (fix: ArticleFix) => ReactNode
}) {
  const { article, meta } = useMemo(() => splitDraft(markdown), [markdown])
  const guide = useMemo(() => parseFieldGuide(article), [article])

  return (
    <>
      <header className="tt-hero">
        <div className="tt-hero-main">
          <h1 className="tt-hero-title">{guide.title}</h1>
          {guide.lead ? <p className="tt-hero-lead">{guide.lead}</p> : null}
          <hr className="tt-hero-rule" />
          <p className="tt-eyebrow tt-eyebrow-quiet">Trusted Technology &nbsp;•&nbsp; Practical guidance for the field</p>
        </div>
        <aside className="tt-hero-side">
          <p>Clear guidance.<br />Built for the field.</p>
        </aside>
      </header>

      {guide.sections.length ? (
        <section className="tt-card">
          <p className="tt-card-label">In this article</p>
          <ul>
            {guide.sections.map((section) => <li key={section}>{section}</li>)}
          </ul>
        </section>
      ) : null}

      {guide.lead ? (
        <section className="tt-card">
          <p className="tt-card-label">Article overview</p>
          <p className="tt-card-body">{guide.lead}</p>
        </section>
      ) : null}

      <MarkdownArticle markdown={guide.body} images={images} fixes={fixes} renderFix={renderFix} />

      {meta ? (
        <details className="draft-panel-meta">
          <summary>Publishing details</summary>
          <pre>{meta}</pre>
        </details>
      ) : null}
    </>
  )
}

// Hermes answers the editor and writes the article in the same message — "Yes,
// I understand, I won't mention RFPs" arrives glued to the front of the draft.
// Everything before the H1 is conversation, not copy. Left in, the H1 still
// parses as the title but the chat line becomes the hero deck, the Article
// Overview card, and the lead that ships to WordPress. The article starts at
// its title; anything ahead of it is stripped.
export function stripChatPreamble(value: string) {
  const heading = value.match(/^#\s+\S/m)
  if (!heading || heading.index === undefined || heading.index === 0) return value
  if (!value.slice(0, heading.index).trim()) return value
  return value.slice(heading.index)
}
