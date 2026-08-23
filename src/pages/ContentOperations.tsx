import { useMemo, useState } from 'react'
import { Alert, Button, Empty, Space, Typography, message } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import MarkdownArticle, { type ArticleImage } from '../components/MarkdownArticle'
import surferLogo from '../assets/agent-logos/surfer.svg'
import { generateContentOperationsDraftImages } from '../lib/api'

const { Text } = Typography

// An article is long and multi-paragraph; a conversational reply ("which
// audience is this for?") is short. Headings are the strongest signal but not
// required — the writer does not always return them, and an article stranded in
// the chat with an empty draft pane beside it is the worse failure.
function looksLikeArticle(value: string) {
  const body = value.trim()
  if (/^#{1,3}\s+\S/m.test(body) && body.length > 240) return true
  const paragraphs = body.split(/\n{2,}|\n(?=[A-Z])/).filter((part) => part.trim().length > 80)
  return body.length > 700 && paragraphs.length >= 3
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

// The H1 is the article's title; without one the backend falls back to a generic
// filename slug for the uploaded media.
function draftTitle(value: string) {
  return value.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim() || ''
}

export default function ContentOperations() {
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<ArticleImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageError, setImageError] = useState('')

  const handleAssistantMessage = (content: string) => {
    if (!looksLikeArticle(content)) return
    setDraft(content)
    // A new draft invalidates artwork generated for the previous one — those
    // scenes were planned from headings this rewrite may no longer have.
    setImages([])
    setImageError('')
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

  const words = useMemo(() => (draft ? wordCount(draft) : 0), [draft])

  const draftPanel = (
    <aside className="draft-panel" aria-label="Article draft">
      <div className="draft-panel-toolbar">
        <Space size={10} align="baseline">
          <Text strong>Draft</Text>
          {draft ? <Text type="secondary">{words.toLocaleString()} words</Text> : null}
        </Space>
        {draft ? (
          <Space size="small">
            <Button size="small" type="primary" loading={imagesLoading} onClick={() => void handleGenerateImages()}>
              {images.length ? 'Regenerate images' : 'Generate images'}
            </Button>
            <Button size="small" onClick={() => void navigator.clipboard.writeText(draft)}>
              Copy Markdown
            </Button>
            <Button size="small" onClick={() => { setDraft(''); setImages([]) }}>
              Clear
            </Button>
          </Space>
        ) : null}
      </div>
      <div className="draft-panel-body">
        {imageError ? (
          <Alert type="error" showIcon message="Images unavailable" description={imageError} style={{ marginBottom: 16 }} />
        ) : null}
        {draft ? (
          <MarkdownArticle markdown={draft} images={images} />
        ) : (
          <div className="draft-panel-empty">
            <Empty description="Ask for an article and the draft appears here." />
          </div>
        )}
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
      chatSidePanel={draftPanel}
      chatSidePanelPosition="left"
      onAssistantMessage={handleAssistantMessage}
      draftKey="content-operations"
    />
  )
}
