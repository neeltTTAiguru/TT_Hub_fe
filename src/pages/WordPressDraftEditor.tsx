import { useMemo, useState } from 'react'
import { Alert, Button, Empty, Input, Space, Spin, Typography } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import { getWordPressDraftPreview, type AgentChatResponse, type WordPressDraftPreview } from '../lib/api'

const { Text } = Typography

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function previewDocument(preview: WordPressDraftPreview) {
  const links = (preview.stylesheets || []).map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n')
  const inlineStyles = (preview.inlineStyles || []).map((css) => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n')
  const base = escapeHtml(preview.siteUrl || 'https://trustedtechnology.ai/')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}/">${links}${inlineStyles}<style>html,body{margin:0;min-height:100%;background:#fff}img{max-width:100%;height:auto}</style></head><body class="single single-post"><div class="wp-site-blocks"><main class="wp-block-group is-layout-constrained"><article class="wp-block-post"><div class="entry-content wp-block-post-content is-layout-constrained">${preview.content}</div></article></main></div></body></html>`
}

export default function WordPressDraftEditor() {
  const [preview, setPreview] = useState<WordPressDraftPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [draftIdInput, setDraftIdInput] = useState('')

  const loadPreview = async (postId: number) => {
    setPreviewLoading(true)
    setPreviewError('')
    try {
      setPreview(await getWordPressDraftPreview(postId))
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'The WordPress draft preview could not be loaded.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleChatResponse = (response: AgentChatResponse) => {
    if (response.wordpressDraft?.id) void loadPreview(response.wordpressDraft.id)
  }

  const srcDoc = useMemo(() => preview ? previewDocument(preview) : '', [preview])
  const previewPanel = (
    <aside className="wordpress-preview-panel" aria-label="WordPress draft preview">
      <div className="wordpress-preview-toolbar">
        <div><Text strong>WordPress preview</Text>{preview ? <Text type="secondary">Draft #{preview.id}</Text> : null}</div>
        <Space size="small">
          {preview ? <Button size="small" onClick={() => void loadPreview(preview.id)} loading={previewLoading}>Refresh</Button> : null}
          {preview ? <Button size="small" href={`${preview.siteUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${encodeURIComponent(preview.id)}&action=edit`} target="_blank" rel="noreferrer">Open in WordPress</Button> : null}
        </Space>
      </div>
      {previewError ? <Alert type="error" showIcon message="Preview unavailable" description={previewError} /> : null}
      {previewLoading && !preview ? <div className="wordpress-preview-empty"><Spin size="large" /></div> : null}
      {!previewLoading && !preview ? (
        <div className="wordpress-preview-empty">
          <Space direction="vertical" size="middle" align="center">
            <Empty description="Generate, update, or load a WordPress draft to see it here." />
            <Space.Compact>
              <Input
                aria-label="WordPress draft ID"
                value={draftIdInput}
                onChange={(event) => setDraftIdInput(event.target.value.replace(/\D/g, ''))}
                placeholder="Draft ID"
                onPressEnter={() => { if (draftIdInput) void loadPreview(Number(draftIdInput)) }}
              />
              <Button type="primary" disabled={!draftIdInput} onClick={() => void loadPreview(Number(draftIdInput))}>Load draft</Button>
            </Space.Compact>
          </Space>
        </div>
      ) : null}
      {preview ? <iframe title={`WordPress draft ${preview.id} preview`} className="wordpress-preview-frame" sandbox="" srcDoc={srcDoc} /> : null}
    </aside>
  )

  return (
    <AgentChatWorkspace
      agentId="wordpress-draft-editor"
      title="Hermes WordPress Content Assistant"
      subtitle="Create, find, and revise WordPress draft posts and pages without changing the live site."
      intro="Ask me to create a draft blog post or page, list existing drafts, or revise one by ID, title, slug, or editor URL. Everything remains unpublished for human review."
      emptyPrompt="Example: Create a draft blog post about secure body-camera evidence storage, or edit draft #1113 and make the CTA less promotional."
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="WordPress content workspace"
      assistantLabel="Hermes WordPress Assistant"
      backendLabel="Hermes + WordPress REST API"
      showRefreshButton
      chatSidePanel={previewPanel}
      onChatResponse={handleChatResponse}
    />
  )
}
