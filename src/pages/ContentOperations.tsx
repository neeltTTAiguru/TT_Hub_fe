import { useMemo, useState } from 'react'
import { Button, Empty, Space, Typography } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import MarkdownArticle from '../components/MarkdownArticle'
import surferLogo from '../assets/agent-logos/surfer.svg'
import type { AgentChatResponse } from '../lib/api'

const { Text } = Typography

// An article reply is long-form Markdown with a heading; a conversational reply
// ("which audience is this for?") is neither. Only the former belongs in the
// draft pane, so a follow-up question never blanks the article you're reading.
function looksLikeArticle(value: string) {
  const body = value.trim()
  if (body.length < 400) return false
  return /^#{1,3}\s+\S/m.test(body)
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export default function ContentOperations() {
  const [draft, setDraft] = useState('')

  const handleChatResponse = (response: AgentChatResponse) => {
    const content = typeof response.message?.content === 'string' ? response.message.content : ''
    if (looksLikeArticle(content)) setDraft(content)
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
            <Button size="small" onClick={() => void navigator.clipboard.writeText(draft)}>
              Copy Markdown
            </Button>
            <Button size="small" onClick={() => setDraft('')}>
              Clear
            </Button>
          </Space>
        ) : null}
      </div>
      <div className="draft-panel-body">
        {draft ? (
          <MarkdownArticle markdown={draft} />
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
      onChatResponse={handleChatResponse}
      draftKey="content-operations"
    />
  )
}
