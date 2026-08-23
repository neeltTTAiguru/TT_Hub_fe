import { useMemo, useState } from 'react'
import { Alert, Button, Space, Tooltip, Typography, message } from 'antd'
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

  const handleAssistantMessage = (content: string) => {
    if (!looksLikeArticle(content)) return
    setDraft((current) => {
      // Streaming calls this on every token. Artwork is planned from a draft's
      // headings, so it only resets when a genuinely new article starts — not on
      // each token of the one being written.
      if (!content.startsWith(current.slice(0, 120))) {
        setImages([])
        setImageError('')
      }
      return content
    })
    setPanelOpen(true)
  }

  const handleGenerateImages = async () => {
    setImagesLoading(true)
    setImageError('')
    try {
      const result = await generateContentOperationsDraftImages({
        article: draft,
        title: draftTitle(draft),
      })
      setImages(result.images)
      message.success(`${result.images.length} image(s) generated and uploaded to WordPress media.`)
    } catch (error) {
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
          <Button size="small" type="primary" loading={imagesLoading} onClick={() => void handleGenerateImages()}>
            {images.length ? 'Regenerate images' : 'Generate images'}
          </Button>
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
      // The panel is already showing this exact text, so don't print it twice.
      // Tied to the open panel: close it and the article returns to the thread
      // rather than vanishing from the page altogether.
      hideAssistantMessage={(content) => panelOpen && content === draft}
      onAssistantMessage={handleAssistantMessage}
      onAssistantDelta={handleAssistantMessage}
      draftKey="content-operations"
    />
  )
}
