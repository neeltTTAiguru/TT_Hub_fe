import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Space, Typography } from 'antd'
import AgentChatWorkspace from '../AgentChatWorkspace'
import MarkdownArticle from '../MarkdownArticle'
import surferLogo from '../../assets/agent-logos/surfer.svg'
import { generateContentOperationsDraftImages } from '../../lib/api'

const { Text } = Typography

// An article is long and multi-paragraph; a conversational reply ("which
// audience is this for?") is short. Headings are the strongest signal but not
// required — the writer does not always return them, and an article stranded in
// the chat with no panel beside it is the worse failure.
function looksLikeArticle(value: string) {
  const body = value.trim()
  if (/^#{1,3}\s+\S/m.test(body) && body.length > 240) return true
  const paragraphs = body.split(/\n{2,}|\n(?=[A-Z])/).filter((part) => part.trim().length > 80)
  return body.length > 700 && paragraphs.length >= 3
}

// The H1 names the panel and the uploaded media; without one the backend falls
// back to a generic filename slug.
function draftTitle(value: string) {
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
function splitDraft(value: string) {
  const match = value.match(/\n-{3,}\s*\n(?=[\s\S]*?^(?:Meta title|Slug|Sources|Needs verification)\s*:)/m)
  if (!match || match.index === undefined) return { article: value, meta: '' }
  return {
    article: value.slice(0, match.index).trimEnd(),
    meta: value.slice(match.index + match[0].length).trim(),
  }
}

import { useContentPipeline } from '../../lib/contentPipeline'
import PhaseNav from './PhaseNav'

export type ChatApi = { appendAssistantMessage: (content: string) => void }

type Props = {
  // Phase-specific wiring. The layout, the field-guide rendering and the
  // draft-promotion logic are identical everywhere; only these differ.
  intro: string
  emptyPrompt: string
  queryingLabel: string
  // Extra controls for the draft toolbar — the SEO score, the publish action.
  // Given the chat api so a background job can report into the conversation.
  panelActions?: (api: ChatApi) => ReactNode
  // Whether this phase generates artwork. Only Write does; the later phases
  // inherit whatever the article already has.
  generatesImages?: boolean
  draftKey: string
}

export default function ArticleWorkspace({
  intro,
  emptyPrompt,
  queryingLabel,
  panelActions,
  generatesImages = false,
  draftKey,
}: Props) {
  const pipeline = useContentPipeline()
  const [panelOpen, setPanelOpen] = useState(false)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const imagesStartedRef = useRef(false)
  // Set only when tokens actually stream in. Restoring a saved thread replays
  // past articles through the same handler, and that must never spend image
  // credits or upload to WordPress on a page load.
  const liveTurnRef = useRef(false)
  const chatApiRef = useRef<ChatApi>({ appendAssistantMessage: () => {} })
  // Handed to the panel instead of the ref's current value. Reading the ref
  // during render captures whatever is there at mount — the placeholder, since
  // registration happens in an effect afterwards — and a panel that never
  // re-renders keeps calling it. This indirection always reaches the live api.
  const chatApi = useRef<ChatApi>({
    appendAssistantMessage: (content: string) => chatApiRef.current.appendAssistantMessage(content),
  })

  const draft = pipeline.draft
  const images = pipeline.images

  // Arriving on a later phase with an article already in hand should show it,
  // not an empty panel waiting for a message that will never come.
  useEffect(() => {
    if (draft) setPanelOpen(true)
  }, [draft])

  const handleThreadReset = () => {
    setPanelOpen(false)
    setImageError('')
    imagesStartedRef.current = false
    liveTurnRef.current = false
  }

  const generateImagesFor = async (article: string) => {
    setImagesLoading(true)
    setImageError('')
    try {
      const result = await generateContentOperationsDraftImages({
        article,
        title: draftTitle(article),
      })
      pipeline.update({ images: result.images })
    } catch (error) {
      // A failed generation must not lock the article out of artwork forever.
      imagesStartedRef.current = false
      setImageError(error instanceof Error ? error.message : 'The article images could not be generated.')
    } finally {
      setImagesLoading(false)
    }
  }

  const handleAssistantDelta = (content: string) => {
    liveTurnRef.current = true
    if (!looksLikeArticle(content)) return
    pipeline.update({ draft: content })
    setPanelOpen(true)
  }

  const handleAssistantMessage = (content: string) => {
    if (!looksLikeArticle(content)) return
    pipeline.update({ draft: content })
    setPanelOpen(true)
    if (generatesImages && liveTurnRef.current && !imagesStartedRef.current) {
      imagesStartedRef.current = true
      void generateImagesFor(content)
    }
  }

  const title = useMemo(() => (draft ? draftTitle(draft) : ''), [draft])
  const { article, meta } = useMemo(() => splitDraft(draft), [draft])
  const guide = useMemo(() => parseFieldGuide(article), [article])

  const draftPanel = (
    <aside className="draft-panel" aria-label="Article draft">
      <div className="draft-panel-toolbar">
        <span className="draft-panel-title">
          <Text strong ellipsis>{title}</Text>
          <Text type="secondary" className="draft-panel-kind">MD</Text>
        </span>
        <Space size={8}>
          {imagesLoading ? <Text type="secondary" style={{ fontSize: 12 }}>Generating images…</Text> : null}
          {panelActions?.(chatApi.current)}
        </Space>
      </div>
      <div className="draft-panel-body">
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

        {imageError ? (
          <Alert type="error" showIcon message="Images unavailable" description={imageError} style={{ margin: '0 40px 16px' }} />
        ) : null}
        <MarkdownArticle markdown={guide.body} images={images} />
        {meta ? (
          <details className="draft-panel-meta">
            <summary>Publishing details</summary>
            <pre>{meta}</pre>
          </details>
        ) : null}
      </div>
    </aside>
  )

  return (
    <AgentChatWorkspace
      agentId="content-operations-assistant"
      title="Content Generator"
      subtitle="Talk with Hermes about Trusted Tech articles."
      intro={intro}
      emptyPrompt={emptyPrompt}
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showPageHeader={false}
      chatTitle=""
      assistantLabel="Content Generator"
      agentLogo={surferLogo}
      backendLabel="Hermes + Content Operations"
      queryingLabel={queryingLabel}
      streaming
      fullHeight
      threadRail
      threadRailTitle="Articles"
      threadRailNewLabel="New article"
      threadRailEmptyText="No articles yet — start writing and they'll appear here."
      showHeaderControls={false}
      renderBeforeChat={<PhaseNav />}
      registerChatApi={(api) => { chatApiRef.current = api }}
      chatSidePanel={draft && panelOpen ? draftPanel : undefined}
      chatSidePanelPosition="left"
      hideAssistantMessage={(content) => panelOpen && looksLikeArticle(content)}
      onAssistantMessage={handleAssistantMessage}
      onAssistantDelta={handleAssistantDelta}
      onThreadReset={handleThreadReset}
      draftKey={draftKey}
    />
  )
}
