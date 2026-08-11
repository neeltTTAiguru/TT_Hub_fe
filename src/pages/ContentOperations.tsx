import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Space, Spin, Tag, Typography, message } from 'antd'
import {
  createContentOperationsRun,
  deleteContentOperationsRun,
  downloadContentOperationsPdf,
  getContentOperationsIntegrations,
  getContentOperationsRuns,
  getWordPressDraftPreview,
  publishContentOperationsWordPress,
  stopContentOperationsRun,
  type ContentIntegrationMap,
  type ContentOperationsRun,
  type WordPressDraftPreview,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

const pipelineStages = [
  ['opportunity_research', 'Ahrefs research', 'Hermes researches current keyword and competitor signals through Ahrefs MCP.'],
  ['opportunity_scoring', 'Opportunity selection', 'The strongest relevant opportunity is selected from the evidence.'],
  ['seo_brief', 'SEO brief', 'Hermes turns the selected opportunity into a structured article plan.'],
  ['article_writing', 'Article writing', 'Hermes writes the complete Trusted Tech article from the approved context.'],
  ['human_review', 'Draft safety review', 'The article passes a draft-only factual and brand gate.'],
  ['image_generation', 'Article images', 'The article topic drives a featured image and relevant section imagery using the approved T500 camera reference.'],
  ['wordpress_draft', 'WordPress draft', 'The final article is created as an unpublished WordPress draft.'],
] as const

function displayStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function previewDocument(preview: WordPressDraftPreview) {
  const links = (preview.stylesheets || []).map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n')
  const inlineStyles = (preview.inlineStyles || []).map((css) => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n')
  const base = escapeHtml(preview.siteUrl || 'https://trustedtechnology.ai/')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}/">${links}${inlineStyles}<style>html,body{margin:0;min-height:100%;background:#fff}body{font-family:Ubuntu,Roboto,Arial,sans-serif;color:#000}img{max-width:100%;height:auto}.tt-field-guide,.tt-field-guide *{font-family:Ubuntu,Roboto,Arial,sans-serif!important}.tt-field-guide p,.tt-field-guide li{font-size:16px!important;line-height:1.7!important}</style></head><body class="single single-post"><div class="wp-site-blocks"><main class="wp-block-group is-layout-constrained"><article class="wp-block-post"><div class="entry-content wp-block-post-content is-layout-constrained">${preview.content}</div></article></main></div></body></html>`
}

function wordpressEditorUrl(preview: WordPressDraftPreview) {
  return `${preview.siteUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${encodeURIComponent(preview.id)}&action=edit`
}

function stageState(run: ContentOperationsRun | null, stageId: string, index: number) {
  if (!run) return index === 0 ? 'ready' : 'pending'
  if (run.stages.some((stage) => stage.stage === stageId)) return 'complete'
  if (run.status === 'error' && run.currentStage === stageId) return 'error'
  if (run.status === 'stopped') return 'stopped'
  const currentIndex = pipelineStages.findIndex(([id]) => id === run.currentStage)
  const automaticStillRunning = run.workflowMode === 'draft_automation'
    && !run.stages.some((stage) => stage.stage === 'wordpress_draft')
    && !['error', 'stopped'].includes(run.status)
  if (currentIndex === index || ((run.status === 'running' || automaticStillRunning) && currentIndex < 0 && index === run.stages.length)) return 'running'
  return 'pending'
}

function stateColor(state: string) {
  if (state === 'complete') return 'green'
  if (state === 'running') return 'processing'
  if (state === 'error') return 'red'
  return 'default'
}

export default function ContentOperations() {
  const [request, setRequest] = useState('')
  const [keywordListId, setKeywordListId] = useState('')
  const [run, setRun] = useState<ContentOperationsRun | null>(null)
  const [runs, setRuns] = useState<ContentOperationsRun[]>([])
  const [integrations, setIntegrations] = useState<ContentIntegrationMap>({})
  const [preview, setPreview] = useState<WordPressDraftPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadPreview = useCallback(async (postId: number) => {
    setPreviewLoading(true)
    try {
      setPreview(await getWordPressDraftPreview(postId))
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'The WordPress preview could not be loaded.')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [integrationData, runData] = await Promise.all([
          getContentOperationsIntegrations(),
          getContentOperationsRuns(),
        ])
        setIntegrations(integrationData)
        setRuns(runData)
        const latest = runData[0] || null
        setRun(latest)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Content Generator could not load.')
      }
    }
    void load()
  }, [loadPreview])

  const activeRunId = run?.runId
  const activeRunStatus = run?.status
  const activeRunFinished = Boolean(run?.stages.some((stage) => stage.stage === 'wordpress_draft'))
  const shouldPollActiveRun = Boolean(activeRunId)
    && activeRunStatus !== 'error'
    && activeRunStatus !== 'stopped'
    && !activeRunFinished
  useEffect(() => {
    if (!activeRunId || !shouldPollActiveRun) return
    const timer = window.setInterval(async () => {
      try {
        const runData = await getContentOperationsRuns()
        const refreshed = runData.find((item) => item.runId === activeRunId)
        setRuns(runData)
        if (!refreshed) return
        setRun(refreshed)
        if (refreshed.status !== 'running') {
          setBusy(false)
          if (refreshed.wordpressPublication?.postId) {
            message.success('WordPress article is ready — select Show final WordPress article to review it')
          } else if (refreshed.status === 'error') {
            setError(refreshed.errors.at(-1) || 'The content pipeline failed.')
          }
        }
      } catch (pollError) {
        setBusy(false)
        setError(pollError instanceof Error ? pollError.message : 'The active pipeline could not be refreshed.')
      }
    }, 750)
    return () => window.clearInterval(timer)
  }, [activeRunId, shouldPollActiveRun])

  const generate = async () => {
    if (!request.trim() || busy) return
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const created = await createContentOperationsRun({
        targetDomain: 'trustedtechnology.ai',
        requestType: 'generate_article',
        userInstructions: request.trim(),
        workflowMode: 'draft_automation',
        researchOnly: false,
        keywordListId: keywordListId.trim() || undefined,
      })
      setRun(created)
      setRuns((current) => [created, ...current.filter((item) => item.runId !== created.runId)])
    } catch (generateError) {
      setBusy(false)
      setError(generateError instanceof Error ? generateError.message : 'The content pipeline could not start.')
    }
  }

  const stop = async () => {
    if (!run || run.status !== 'running') return
    const stopped = await stopContentOperationsRun(run.runId)
    setRun(stopped)
    setBusy(false)
  }

  const publish = () => {
    if (!run?.wordpressPublication?.postId || publishing) return
    const title = run.wordpressPublication.title || 'this article'
    Modal.confirm({
      title: 'Publish to the live blog?',
      content: `"${title}" will go live at trustedtechnology.ai and appear on the blog immediately. Review the preview first — publishing is public.`,
      okText: 'Publish live',
      cancelText: 'Not yet',
      onOk: async () => {
        // Resolve the modal regardless of outcome, then surface success/failure as a
        // toast. Re-throwing here would keep the confirm modal open and hide the error
        // banner behind it — which looks like "nothing happened".
        setPublishing(true)
        setError('')
        try {
          const published = await publishContentOperationsWordPress(run.runId)
          setRun(published)
          setRuns((current) => current.map((item) => (item.runId === published.runId ? published : item)))
          message.success('Published live — the post is on the blog now')
        } catch (publishError) {
          const messageText = publishError instanceof Error ? publishError.message : 'The article could not be published.'
          setError(messageText)
          message.error(`Publish failed: ${messageText}`)
        } finally {
          setPublishing(false)
        }
      },
    })
  }

  const deleteSelectedDrafts = async () => {
    const targets = runs.filter((item) => selectedRunIds.includes(item.runId))
    if (!targets.length) return
    setDeleting(true)
    setError('')
    try {
      const results = await Promise.allSettled(targets.map((item) => deleteContentOperationsRun(item.runId)))
      const deletedRunIds = results
        .filter((result): result is PromiseFulfilledResult<{ runId: string; wordpressAction: 'none' | 'trashed_draft' | 'left_published' }> => result.status === 'fulfilled')
        .map((result) => result.value.runId)
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Draft could not be deleted.')
      setRuns((current) => current.filter((item) => !deletedRunIds.includes(item.runId)))
      if (run && deletedRunIds.includes(run.runId)) {
        const remaining = runs.filter((item) => !deletedRunIds.includes(item.runId))
        setRun(remaining[0] || null)
        setPreview(null)
      }
      setSelectedRunIds((current) => current.filter((runId) => !deletedRunIds.includes(runId)))
      setDeleteConfirmOpen(false)
      if (deletedRunIds.length) message.success(`${deletedRunIds.length} generated article${deletedRunIds.length === 1 ? '' : 's'} removed`)
      if (failures.length) setError(`Some selected entries were not removed: ${failures.join(' | ')}`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The selected WordPress drafts could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  const srcDoc = useMemo(() => preview ? previewDocument(preview) : '', [preview])
  const wordpressReady = integrations.wordpress?.status === 'connected'
  const ahrefsReady = integrations.ahrefs?.status === 'connected'

  return (
    <div className="page content-generator-workspace">
      <div className="page-header">
        <div>
          <Space align="center" wrap><h1 className="page-title">Content Generator</h1><Tag color="gold">Hermes → WordPress</Tag></Space>
          <p className="page-subtitle">Request one article, watch each real workflow step complete, then review the final WordPress draft.</p>
        </div>
        <Space wrap>
          <Tag color={ahrefsReady ? 'green' : 'red'}>Ahrefs {ahrefsReady ? 'connected' : 'not configured'}</Tag>
          <Tag color={wordpressReady ? 'green' : 'red'}>WordPress {wordpressReady ? 'connected' : 'not configured'}</Tag>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon closable onClose={() => setError('')} message="Content pipeline issue" description={error} /> : null}

      <div className="content-generator-grid">
        <Card className="section-card content-generator-request" title="Request an article or blog">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <TextArea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Example: Create an article explaining how the T500 can support repossession operations."
              autoSize={{ minRows: 8, maxRows: 16 }}
              onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void generate() } }}
            />
            <Input
              value={keywordListId}
              onChange={(event) => setKeywordListId(event.target.value)}
              placeholder="Ahrefs keyword list ID or URL (optional — defaults to the Trusted list)"
              allowClear
            />
            <Button type="primary" block size="large" loading={busy} disabled={!request.trim() || !ahrefsReady || !wordpressReady} onClick={() => void generate()}>
              Generate WordPress draft
            </Button>
            {run?.status === 'running' ? <Button danger block onClick={() => void stop()}>Stop workflow</Button> : null}
            <Text type="secondary">The final action creates an unpublished WordPress draft. Nothing is published automatically.</Text>
            {runs.length ? (
              <div className="content-run-list-header">
                <Text strong>Generated articles</Text>
                <Button danger size="small" disabled={!selectedRunIds.length} onClick={() => setDeleteConfirmOpen(true)}>
                  Delete selected{selectedRunIds.length ? ` (${selectedRunIds.length})` : ''}
                </Button>
              </div>
            ) : null}
            {runs.length ? (
              <div className="content-run-list">
                {runs.map((item) => {
                  const isTrashed = item.wordpressPublication?.status === 'trash'
                  return (
                    <div className={`content-run-item${run?.runId === item.runId ? ' content-run-item-active' : ''}`} key={item.runId}>
                      <Checkbox
                        aria-label={`Select ${item.wordpressPublication?.title || item.userInstructions.slice(0, 72)}`}
                        checked={selectedRunIds.includes(item.runId)}
                        onChange={(event) => setSelectedRunIds((current) => event.target.checked
                          ? [...current, item.runId]
                          : current.filter((runId) => runId !== item.runId))}
                      />
                      <button
                        type="button"
        onClick={() => {
                          setRun(item)
                          setPreview(null)
                        }}
                      >
                        <strong>{item.wordpressPublication?.title || item.userInstructions.slice(0, 72)}</strong>
                        <span>{isTrashed ? 'In WordPress Trash' : displayStatus(item.status)}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </Space>
        </Card>

        <Card className="section-card content-generator-progress" title="Workflow progress">
          <div className="content-stage-list">
            {pipelineStages.map(([id, label, description], index) => {
              const state = stageState(run, id, index)
              const completed = run?.stages.find((stage) => stage.stage === id)
              const legacyImageStage = id === 'image_generation' && !completed && run?.stages.some((stage) => stage.stage === 'wordpress_draft')
              return (
                <div className={`content-stage content-stage-${legacyImageStage ? 'complete' : state}`} key={id}>
                  <div className="content-stage-index">{state === 'complete' || legacyImageStage ? '✓' : index + 1}</div>
                  <div><div className="content-stage-heading"><Text strong>{label}</Text><Tag color={stateColor(legacyImageStage ? 'complete' : state)}>{legacyImageStage ? 'Legacy complete' : displayStatus(state)}</Tag></div><Paragraph>{legacyImageStage ? 'This article was completed before automatic image generation was added.' : completed?.result ? String(completed.result) : description}</Paragraph></div>
                </div>
              )
            })}
          </div>
          {busy ? <div className="content-generator-running"><Spin /><Text>Hermes is running the next step…</Text></div> : null}
        </Card>

        <Card
          className="section-card content-generator-preview"
          title="Final WordPress article"
          extra={preview ? (
            <Space>
              <Button onClick={() => void loadPreview(preview.id)} loading={previewLoading}>Reload preview</Button>
              <Button loading={pdfLoading} onClick={async () => {
                if (!run) return
                setPdfLoading(true)
                try {
                  await downloadContentOperationsPdf(run.runId)
                } catch (pdfError) {
                  setError(pdfError instanceof Error ? pdfError.message : 'The PDF could not be downloaded.')
                } finally {
                  setPdfLoading(false)
                }
              }}>Download PDF</Button>
              <Button href={wordpressEditorUrl(preview)} target="_blank" rel="noreferrer">Open in WordPress</Button>
              {run?.wordpressPublication?.status === 'publish' ? (
                <Button type="primary" ghost href={run.wordpressPublication.url || undefined} target="_blank" rel="noreferrer">View live post ✓</Button>
              ) : (
                <Button type="primary" loading={publishing} disabled={!run?.wordpressPublication?.postId} onClick={publish}>Publish to blog</Button>
              )}
            </Space>
          ) : null}
        >
          {previewLoading ? <div className="wordpress-preview-empty"><Spin size="large" /></div> : null}
          {!previewLoading && !preview && run?.status === 'completed' && run.wordpressPublication?.postId && run.wordpressPublication.status !== 'trash' ? (
            <div className="wordpress-preview-empty">
              <Empty description="Your WordPress article is ready.">
                <Button type="primary" size="large" onClick={() => void loadPreview(run.wordpressPublication!.postId!)}>
                  Show final WordPress article
                </Button>
              </Empty>
            </div>
          ) : null}
          {!previewLoading && !preview && !(run?.status === 'completed' && run.wordpressPublication?.postId && run.wordpressPublication.status !== 'trash') ? <div className="wordpress-preview-empty"><Empty description={run?.status === 'running' ? 'The final article will unlock when every step is complete.' : 'Generate an article to see the final WordPress version.'} /></div> : null}
          {preview ? <iframe title={`WordPress draft ${preview.id} preview`} className="wordpress-preview-frame" sandbox="" srcDoc={srcDoc} /> : null}
        </Card>
      </div>
      <Modal
        title="Delete selected generated articles?"
        open={deleteConfirmOpen}
        okText={`Delete ${selectedRunIds.length} selected`}
        okButtonProps={{ danger: true }}
        confirmLoading={deleting}
        onCancel={() => { if (!deleting) setDeleteConfirmOpen(false) }}
        onOk={() => void deleteSelectedDrafts()}
      >
        <Paragraph>
          The selected entries will be removed from this list. Attached WordPress drafts will be moved to Trash; already-published WordPress posts will remain live.
        </Paragraph>
      </Modal>
    </div>
  )
}
