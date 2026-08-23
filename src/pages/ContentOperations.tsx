import { useMemo, useRef, useState } from 'react'
import { Alert, Button, Space, Tooltip, Typography } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import MarkdownArticle, { type ArticleImage } from '../components/MarkdownArticle'
import surferLogo from '../assets/agent-logos/surfer.svg'
import { generateContentOperationsDraftImages } from '../lib/api'

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

export default function ContentOperations() {
  const [draft, setDraft] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [images, setImages] = useState<ArticleImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  // Artwork is generated once, for the first article of a conversation, and then
  // left alone. Every later revision keeps the images it already has.
  const imagesStartedRef = useRef(false)
  // Set only when tokens actually stream in. Restoring a saved thread replays
  // past articles through the same handler, and that must never spend image
  // credits or upload to WordPress on a page load.
  const liveTurnRef = useRef(false)

  const handleAssistantDelta = (content: string) => {
    liveTurnRef.current = true
    if (!looksLikeArticle(content)) return
    setDraft(content)
    setPanelOpen(true)
  }

  const handleAssistantMessage = (content: string) => {
    if (!looksLikeArticle(content)) return
    setDraft(content)
    setPanelOpen(true)
    // Only the first article of a live conversation gets artwork. Edits inherit
    // it untouched, and a restored thread never generates at all.
    if (liveTurnRef.current && !imagesStartedRef.current) {
      imagesStartedRef.current = true
      void generateImagesFor(content)
    }
  }

  const generateImagesFor = async (article: string) => {
    setImagesLoading(true)
    setImageError('')
    try {
      const result = await generateContentOperationsDraftImages({
        article,
        title: draftTitle(article),
      })
      setImages(result.images)
    } catch (error) {
      // A failed generation must not lock the article out of artwork forever.
      imagesStartedRef.current = false
      setImageError(error instanceof Error ? error.message : 'The article images could not be generated.')
    } finally {
      setImagesLoading(false)
    }
  }

  const title = useMemo(() => (draft ? draftTitle(draft) : ''), [draft])

  const draftPanel = (
    <aside
      className={`draft-panel${expanded ? ' draft-panel-expanded' : ''}`}
      aria-label="Article draft"
    >
      <div className="draft-panel-toolbar">
        <span className="draft-panel-title">
          <Text strong ellipsis>{title}</Text>
          <Text type="secondary" className="draft-panel-kind">MD</Text>
        </span>
        <Space size={4}>
          {imagesLoading ? <Text type="secondary" style={{ fontSize: 12 }}>Generating images…</Text> : null}
          <Button size="small" onClick={() => void navigator.clipboard.writeText(draft)}>
            Copy
          </Button>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <Button
              size="small"
              type="text"
              aria-label={expanded ? 'Collapse draft' : 'Expand draft'}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? '⤡' : '⤢'}
            </Button>
          </Tooltip>
          <Tooltip title="Close">
            <Button
              size="small"
              type="text"
              aria-label="Close draft"
              onClick={() => { setPanelOpen(false); setExpanded(false) }}
            >
              ✕
            </Button>
          </Tooltip>
        </Space>
      </div>
      <div className="draft-panel-body">
        {imageError ? (
          <Alert type="error" showIcon message="Images unavailable" description={imageError} style={{ marginBottom: 16 }} />
        ) : null}
        <MarkdownArticle markdown={draft} images={images} />
      </div>
    </aside>
  )

  return (
    <AgentChatWorkspace
      agentId="content-operations-assistant"
      title="Content Generator"
      subtitle="Talk with Hermes about Trusted Tech articles — research an angle, plan it, draft it, and revise it in conversation."
      intro="Ask for an article or blog, or bring a draft you want reworked. Tell me the topic, the reader, and the angle; I'll research it, plan it, and write it with you."
      emptyPrompt='Try: "Write a Trusted Tech article on how small police departments budget for body-camera storage."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showPageHeader={false}
      chatTitle=""
      assistantLabel="Content Generator"
      agentLogo={surferLogo}
      backendLabel="Hermes + Content Operations"
      queryingLabel="Writing…"
      streaming
      fullHeight
      threadRail
      threadRailTitle="Articles"
      threadRailNewLabel="New article"
      threadRailEmptyText="No articles yet — start writing and they'll appear here."
      showHeaderControls={false}
      chatSidePanel={draft && panelOpen ? draftPanel : undefined}
      chatSidePanelPosition="left"
      // Articles live in the panel, never in the thread. Matching on shape rather
      // than on string equality matters: the streamed text and the final message
      // the server sends can differ by whitespace, and earlier revisions stay in
      // the thread — an exact comparison lets both leak back into the chat.
      // Still gated on the panel being open, so closing it returns the article
      // to the conversation instead of erasing it from the page.
      hideAssistantMessage={(content) => panelOpen && looksLikeArticle(content)}
      onAssistantMessage={handleAssistantMessage}
      onAssistantDelta={handleAssistantDelta}
      draftKey="content-operations"
    />
  )
}
