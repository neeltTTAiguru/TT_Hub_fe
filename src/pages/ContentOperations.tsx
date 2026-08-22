import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Space, Spin, Switch, Tag, Tooltip, Typography, message } from 'antd'
import {
  applyContentOperationsRevision,
  createContentOperationsRun,
  deleteContentOperationsRun,
  downloadContentOperationsPdf,
  getContentOperationsIntegrations,
  getContentOperationsRuns,
  getWordPressDraftPreview,
  publishContentOperationsWordPress,
  revertContentOperationsRevision,
  reviseContentOperationsArticle,
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
  ['content_optimization', 'Surfer SEO optimization', 'Hermes scores the draft in SurferSEO and revises it toward the SEO guidelines.'],
  ['human_review', 'Draft safety review', 'The article passes a draft-only factual and brand gate.'],
  ['image_generation', 'Article images', 'The article topic drives a featured image and relevant section imagery using the approved T500 camera reference.'],
  ['wordpress_draft', 'WordPress draft', 'The final article is created as an unpublished WordPress draft.'],
] as const

// A revision re-runs the pipeline, but only the stages a rewrite actually touches. The
// ids match the original pipeline so both passes drive the same progress panel.
const revisionStages = [
  ['opportunity_research', 'Ahrefs re-research', 'Ahrefs is checked again for keywords that support your new angle, keeping the article’s primary keyword.'],
  ['seo_brief', 'Brief re-angled', 'The outline, intent and reader are updated. Title, slug and approved artwork are preserved.'],
  ['article_writing', 'Rewrite', 'Hermes rewrites the article to your direction, replaying every instruction given so far.'],
  ['content_optimization', 'SurferSEO score floor', 'The rewrite is re-scored and revised until it recovers the score it had before the edit.'],
  ['human_review', 'Score gate', 'The rewrite is revised until it recovers the score it had before the edit; a drop is reported, not a reason to abandon the edit.'],
  ['image_generation', 'Artwork', 'Existing images are reused unless you asked for them to be regenerated for the new angle.'],
  ['wordpress_draft', 'WordPress sync', 'Title, slug, meta description and body are written back to WordPress together.'],
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

// Stages recorded before the current pass are ignored, so a revision shows its own
// progress instead of inheriting every tick from the original generation.
function stagesForCycle(run: ContentOperationsRun | null) {
  if (!run) return []
  const cycle = run.currentCycle || 0
  return run.stages.filter((stage) => (stage.cycle || 0) === cycle)
}

function stageState(
  run: ContentOperationsRun | null,
  stages: ContentOperationsRun['stages'],
  list: ReadonlyArray<readonly [string, string, string]>,
  stageId: string,
  index: number,
) {
  if (!run) return index === 0 ? 'ready' : 'pending'
  if (stages.some((stage) => stage.stage === stageId)) return 'complete'
  if (run.status === 'error' && run.currentStage === stageId) return 'error'
  if (run.status === 'stopped') return 'stopped'
  const currentIndex = list.findIndex(([id]) => id === run.currentStage)
  const automaticStillRunning = run.workflowMode === 'draft_automation'
    && !stages.some((stage) => stage.stage === 'wordpress_draft')
    && !['error', 'stopped', 'completed'].includes(run.status)
  // A stage may only render as running while the run actually is. Without this a pass
  // that halts early — the score gate holding a rewrite back, for instance — leaves
  // currentStage pointing at a stage it never reached, and the panel spins forever.
  const live = run.status === 'running' || run.status === 'waiting_for_approval' || automaticStillRunning
  if (!live) return 'pending'
  if (currentIndex === index || (currentIndex < 0 && index === stages.length)) return 'running'
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
  const [editorOpen, setEditorOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [revising, setRevising] = useState(false)
  const [reoptimize, setReoptimize] = useState(true)
  const [research, setResearch] = useState(true)
  const [regenerateImages, setRegenerateImages] = useState(false)
  // Off by default: the revision always finishes and reports a score drop. Turn this on
  // only if you would rather an edit be abandoned than cost ranking.
  const [enforceScoreFloor, setEnforceScoreFloor] = useState(false)
  const [applyToLive, setApplyToLive] = useState(false)

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
  // Scoped to the current pass: during a revision the original run's wordpress_draft
  // stage is still on the record, and polling has to follow the new pass regardless.
  const activeRunFinished = Boolean(stagesForCycle(run ?? null).some((stage) => stage.stage === 'wordpress_draft'))
  const activeRunIsRevision = (run?.currentCycle || 0) > 0
  const shouldPollActiveRun = Boolean(activeRunId)
    && activeRunStatus !== 'error'
    && activeRunStatus !== 'stopped'
    // A revision always ends by setting the run back to completed, including when the
    // score gate holds the rewrite back and no wordpress_draft stage is ever written —
    // so follow the status, not the stage list, or the poller never stops.
    && (activeRunIsRevision ? activeRunStatus === 'running' : !activeRunFinished)
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
          setRevising(false)
          if ((refreshed.currentCycle || 0) > 0) {
            // A revision pass just finished — refresh the preview so the panel shows the
            // rewrite, and let the thread carry the detail (including a held-back rewrite).
            if (refreshed.wordpressPublication?.postId && preview) await loadPreview(refreshed.wordpressPublication.postId)
            const held = (refreshed.revisions || []).some((entry) => entry.status === 'rejected' && !entry.revertedAt)
            if (held) message.warning('Rewrite held back — it would have lowered the SurferSEO score')
            else message.success('Article updated')
          } else if (refreshed.wordpressPublication?.postId) {
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
  }, [activeRunId, shouldPollActiveRun, preview, loadPreview])

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

  // Post-generation editing. Two shapes: starting a revision kicks off a background
  // pipeline pass and lets the poller drive the UI, while reverting and promoting a
  // held-back rewrite are immediate and return the finished run.
  const refreshRun = async () => {
    try {
      const runData = await getContentOperationsRuns()
      setRuns(runData)
      const refreshed = runData.find((item) => item.runId === run?.runId)
      if (refreshed) setRun(refreshed)
    } catch { /* the banner already explains the failure */ }
  }

  const applyImmediate = async (work: () => Promise<ContentOperationsRun>) => {
    setRevising(true)
    setError('')
    try {
      const updated = await work()
      setRun(updated)
      setRuns((current) => current.map((item) => (item.runId === updated.runId ? updated : item)))
      if (updated.wordpressPublication?.postId) await loadPreview(updated.wordpressPublication.postId)
      message.success('Article updated')
    } catch (revisionError) {
      const messageText = revisionError instanceof Error ? revisionError.message : 'The edit could not be applied.'
      setError(messageText)
      message.error(messageText)
      await refreshRun()
    } finally {
      setRevising(false)
    }
  }

  const sendInstruction = async () => {
    const text = instruction.trim()
    if (!run || !text || revising) return
    const send = async () => {
      setRevising(true)
      setError('')
      try {
        // 202 — the pipeline runs in the background. The poller takes it from here and
        // clears `revising` when the pass lands.
        const started = await reviseContentOperationsArticle(run.runId, {
          instruction: text,
          research,
          regenerateImages,
          reoptimize,
          enforceScoreFloor,
          applyToLive: isLive && applyToLive,
        })
        setRun(started)
        setRuns((current) => current.map((item) => (item.runId === started.runId ? started : item)))
        setInstruction('')
      } catch (revisionError) {
        setRevising(false)
        const messageText = revisionError instanceof Error ? revisionError.message : 'The edit could not be started.'
        setError(messageText)
        message.error(messageText)
        await refreshRun()
      }
    }
    if (isLive && applyToLive) {
      Modal.confirm({
        title: 'Rewrite the live post?',
        content: `"${run.wordpressPublication?.title || 'This article'}" is already published. The rewritten version will replace what readers see on trustedtechnology.ai as soon as it is ready.`,
        okText: 'Rewrite and update live',
        cancelText: 'Cancel',
        onOk: send,
      })
      return
    }
    await send()
  }

  const revertTo = (revisionId: string) => {
    if (!run || revising) return
    void applyImmediate(() => revertContentOperationsRevision(run.runId, {
      revisionId,
      applyToLive: isLive && applyToLive,
    }))
  }

  const applyHeldBack = (revisionId: string, drop: string) => {
    if (!run || revising) return
    Modal.confirm({
      title: 'Apply the rewrite anyway?',
      content: `This rewrite lowers the SurferSEO score (${drop}). Applying it accepts that drop${isLive && applyToLive ? ' and updates the live post' : ''}.`,
      okText: 'Apply anyway',
      okButtonProps: { danger: true },
      cancelText: 'Keep the current article',
      onOk: () => applyImmediate(() => applyContentOperationsRevision(run.runId, {
        revisionId,
        applyToLive: isLive && applyToLive,
      })),
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
  const isLive = run?.wordpressPublication?.status === 'publish'
  const editorChat = run?.editorChat || []
  const revisions = run?.revisions || []
  const canEdit = Boolean(run?.article) && run?.status !== 'running'
  const inRevision = (run?.currentCycle || 0) > 0
  const activeStageList = inRevision ? revisionStages : pipelineStages
  const cycleStages = stagesForCycle(run ?? null)
  const latestRevisionId = revisions.filter((entry) => !entry.revertedAt && entry.status !== 'rejected').at(-1)?.id
  const heldBackRevisionId = revisions.filter((entry) => entry.status === 'rejected' && !entry.revertedAt).at(-1)?.id

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

        <Card
          className="section-card content-generator-progress"
          title={<Space wrap><span>Workflow progress</span>{inRevision ? <Tag color="purple">Revision {run?.currentCycle}</Tag> : null}</Space>}
        >
          <div className="content-stage-list">
            {activeStageList.map(([id, label, description], index) => {
              const state = stageState(run, cycleStages, activeStageList, id, index)
              const completed = cycleStages.find((stage) => stage.stage === id)
              const legacyImageStage = id === 'image_generation' && !completed && cycleStages.some((stage) => stage.stage === 'wordpress_draft')
              return (
                <div className={`content-stage content-stage-${legacyImageStage ? 'complete' : state}`} key={id}>
                  <div className="content-stage-index">{state === 'complete' || legacyImageStage ? '✓' : index + 1}</div>
                  <div><div className="content-stage-heading"><Text strong>{label}</Text><Tag color={stateColor(legacyImageStage ? 'complete' : state)}>{legacyImageStage ? 'Legacy complete' : displayStatus(state)}</Tag></div><Paragraph>{legacyImageStage ? 'This article was completed before automatic image generation was added.' : completed?.result ? String(completed.result) : description}</Paragraph></div>
                </div>
              )
            })}
          </div>
          {busy || revising ? <div className="content-generator-running"><Spin /><Text>Hermes is running the next step…</Text></div> : null}
        </Card>

        <Card
          className="section-card content-generator-preview"
          title="Final WordPress article"
          extra={preview ? (
            <Space>
              <Button
                type={editorOpen ? 'default' : 'dashed'}
                disabled={!canEdit}
                onClick={() => setEditorOpen((current) => !current)}
              >
                {editorOpen ? 'Hide editor' : 'Edit with Hermes'}
              </Button>
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

        {editorOpen && run ? (
          <Card
            className="section-card content-generator-editor"
            title={<Space wrap><span>Edit this article</span>{isLive ? <Tag color="red">Live post</Tag> : <Tag color="gold">Draft</Tag>}{run.surferOptimization?.seoScoreAfter != null ? <Tag color="blue">Surfer SEO {run.surferOptimization.seoScoreAfter}</Tag> : null}</Space>}
            extra={<Button size="small" onClick={() => setEditorOpen(false)}>Close</Button>}
          >
            <div className="content-editor-thread">
              {editorChat.length ? editorChat.map((entry) => (
                <div className={`chat-message chat-message-${entry.role}`} key={entry.id}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{entry.role === 'user' ? 'Your direction' : 'Hermes'}</Text>
                  <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{entry.content}</Paragraph>
                  {entry.revisionId && entry.revisionId === heldBackRevisionId ? (
                    <Space wrap style={{ marginTop: 8 }}>
                      <Button
                        size="small"
                        danger
                        disabled={revising}
                        onClick={() => {
                          const held = revisions.find((item) => item.id === entry.revisionId)
                          applyHeldBack(entry.revisionId!, `${held?.seoScoreBefore ?? '—'} → ${held?.seoScoreAfter ?? '—'}`)
                        }}
                      >
                        Apply anyway
                      </Button>
                      <Text type="secondary" style={{ fontSize: 12 }}>or re-word your direction and send it again</Text>
                    </Space>
                  ) : null}
                  {entry.revisionId && entry.revisionId === latestRevisionId ? (
                    <Button size="small" type="link" style={{ paddingLeft: 0 }} disabled={revising} onClick={() => revertTo(entry.revisionId!)}>
                      Undo this edit
                    </Button>
                  ) : null}
                </div>
              )) : (
                <Empty
                  image={null}
                  description="Tell Hermes what to change — for example: “The angle leans too hard on law enforcement for a commercial retail audience. Tone that down and focus on employee safety, then rewrite with the Ahrefs keyword intact.”"
                />
              )}
              {revising ? (
                <div className="content-generator-running">
                  <Spin />
                  <Text>Running the pipeline again — watch Workflow progress for the current step.</Text>
                </div>
              ) : null}
            </div>

            <div className="content-editor-composer">
              <TextArea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Describe the change: angle, tone, emphasis, what to cut, what to add…"
                autoSize={{ minRows: 3, maxRows: 8 }}
                disabled={revising || !canEdit}
                onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void sendInstruction() } }}
              />
              <div className="content-editor-options">
                <Space size="large" wrap>
                  <Tooltip title="Check Ahrefs again for curated keywords that support the new angle. The article's primary keyword is kept either way, so the SEO score stays comparable.">
                    <Space size="small"><Switch size="small" checked={research} disabled={revising} onChange={setResearch} /><Text>Re-run Ahrefs</Text></Space>
                  </Tooltip>
                  <Tooltip title="Re-plan and re-render the article's images for the new angle. Off by default because generating images costs money and time — turn it on when the re-angle changes who the article is for.">
                    <Space size="small"><Switch size="small" checked={regenerateImages} disabled={revising} onChange={setRegenerateImages} /><Text>Regenerate images</Text></Space>
                  </Tooltip>
                  <Tooltip title="Push the rewrite back through SurferSEO and keep revising until the score stops improving. Your direction always outranks the SEO target.">
                    <Space size="small"><Switch size="small" checked={reoptimize} disabled={revising} onChange={setReoptimize} /><Text>Re-run SurferSEO</Text></Space>
                  </Tooltip>
                  <Tooltip title="Abandon the edit if the rewrite scores lower than before and the recovery passes cannot close the gap. Off by default: the pipeline always tries to recover the score, but finishes the edit either way and tells you if it dropped — undo is in the thread.">
                    <Space size="small"><Switch size="small" checked={enforceScoreFloor} disabled={revising || !reoptimize} onChange={setEnforceScoreFloor} /><Text>Stop if the SEO score drops</Text></Space>
                  </Tooltip>
                  {isLive ? (
                    <Tooltip title="This article is already published. Without this, edits are saved to the run only and the live post is left untouched.">
                      <Space size="small"><Switch size="small" checked={applyToLive} disabled={revising} onChange={setApplyToLive} /><Text type={applyToLive ? 'danger' : undefined}>Apply to the live post</Text></Space>
                    </Tooltip>
                  ) : null}
                </Space>
                <Button type="primary" loading={revising} disabled={!instruction.trim() || !canEdit} onClick={() => void sendInstruction()}>
                  Rewrite article
                </Button>
              </div>
              <Text type="secondary">
                {'The title, slug and meta description are rewritten with the article. '}
                {reoptimize && enforceScoreFloor && run.surferOptimization?.seoScoreAfter != null
                  ? `A rewrite that scores below ${run.surferOptimization.seoScoreAfter} will be abandoned rather than applied. `
                  : 'The edit always runs to completion; a score drop is reported so you can undo it. '}
                {isLive && !applyToLive
                  ? 'Edits are applied to the stored article only — the published post stays as readers see it now.'
                  : isLive
                    ? 'Edits will replace the published post on trustedtechnology.ai. You will be asked to confirm.'
                    : 'Edits are written straight back to the WordPress draft. Nothing is published.'}
              </Text>
            </div>
          </Card>
        ) : null}
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
