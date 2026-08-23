import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Space, Spin, Steps, Switch, Tag, Tooltip, Typography, message } from 'antd'
import MarkdownArticle from '../components/MarkdownArticle'
import { clearFixHighlight, highlightFixInDraft } from '../lib/locateFix'
import {
  applyContentOperationsQuickFix,
  applyContentOperationsRevision,
  createContentOperationsRun,
  deleteContentOperationsRun,
  downloadContentOperationsPdf,
  getContentOperationsIntegrations,
  getContentOperationsRuns,
  getWordPressDraftPreview,
  publishContentOperationsWordPress,
  revertContentOperationsQuickFix,
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
  ['surfer_setup', 'Surfer guidelines', 'SurferSEO analyses the SERP and returns the word-count and term targets the draft is written to. This can take several minutes.'],
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

// The five pages of the generator, in the order an article moves through them. Every page
// is reachable at any time it makes sense — the wizard sequences the work, it does not
// lock the editor into it.
const wizardSteps = [
  ['request', 'Request', 'Ask for an article or blog'],
  ['progress', 'Workflow progress', 'Watch every real step complete'],
  ['little', 'Little fixes', 'Chat line edits into the draft'],
  ['heavy', 'Heavy fixes', 'Rewrite the whole article'],
  ['wordpress', 'Send to WordPress', 'Preview, then publish'],
] as const

type StepKey = typeof wizardSteps[number][0]

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
  const [step, setStep] = useState<StepKey>('request')
  const [request, setRequest] = useState('')
  const [keywordListId, setKeywordListId] = useState('')
  const [run, setRun] = useState<ContentOperationsRun | null>(null)
  const [runs, setRuns] = useState<ContentOperationsRun[]>([])
  const [integrations, setIntegrations] = useState<ContentIntegrationMap>({})
  const [preview, setPreview] = useState<WordPressDraftPreview | null>(null)
  const [previewStale, setPreviewStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [revising, setRevising] = useState(false)
  const [fixInstruction, setFixInstruction] = useState('')
  const [fixing, setFixing] = useState(false)
  const [reoptimize, setReoptimize] = useState(true)
  const [research, setResearch] = useState(true)
  const [regenerateImages, setRegenerateImages] = useState(false)
  // Off by default: the revision always finishes and reports a score drop. Turn this on
  // only if you would rather an edit be abandoned than cost ranking.
  const [enforceScoreFloor, setEnforceScoreFloor] = useState(false)
  const [applyToLive, setApplyToLive] = useState(false)

  // Which preview the panel is currently meant to show. Selecting a second article while
  // the first is still loading would otherwise let the slower response win and render the
  // wrong article under the right heading.
  const previewRequestRef = useRef(0)
  const fixThreadRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLDivElement | null>(null)
  const [activeEdit, setActiveEdit] = useState('')

  const loadPreview = useCallback(async (postId: number) => {
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewLoading(true)
    try {
      const loaded = await getWordPressDraftPreview(postId)
      if (previewRequestRef.current !== requestId) return
      setPreview(loaded)
      setPreviewStale(false)
    } catch (previewError) {
      if (previewRequestRef.current !== requestId) return
      setError(previewError instanceof Error ? previewError.message : 'The WordPress preview could not be loaded.')
    } finally {
      if (previewRequestRef.current === requestId) setPreviewLoading(false)
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
          setPreviewStale(true)
          if ((refreshed.currentCycle || 0) > 0) {
            // A revision pass just finished — refresh the preview so the panel shows the
            // rewrite, and let the thread carry the detail (including a held-back rewrite).
            if (refreshed.wordpressPublication?.postId && preview) await loadPreview(refreshed.wordpressPublication.postId)
            const held = (refreshed.revisions || []).some((entry) => entry.status === 'rejected' && !entry.revertedAt)
            if (held) message.warning('Rewrite held back — it would have lowered the SurferSEO score')
            else message.success('Article updated')
          } else if (refreshed.wordpressPublication?.postId) {
            message.success('Your article is ready — move on to Little fixes')
          } else if (refreshed.status === 'error') {
            setError(refreshed.errors.at(-1) || 'The content pipeline failed.')
          }
          // The wizard follows the work: a pass that finishes while you are watching it
          // hands you straight to the editing desk instead of leaving you on a done list.
          setStep((current) => (current === 'progress' && refreshed.article ? 'little' : current))
        }
      } catch (pollError) {
        setBusy(false)
        setError(pollError instanceof Error ? pollError.message : 'The active pipeline could not be refreshed.')
      }
    }, 750)
    return () => window.clearInterval(timer)
  }, [activeRunId, shouldPollActiveRun, preview, loadPreview])

  // The WordPress page always shows the current post, including after little fixes were
  // patched straight into the draft while you were on another page.
  useEffect(() => {
    if (step !== 'wordpress') return
    const postId = run?.wordpressPublication?.postId
    if (!postId || run?.wordpressPublication?.status === 'trash') return
    if (previewLoading) return
    if (preview && preview.id === postId && !previewStale) return
    void loadPreview(postId)
  }, [step, run, preview, previewStale, previewLoading, loadPreview])

  const quickFixChat = useMemo(() => run?.quickFixChat || [], [run])
  useEffect(() => {
    if (step !== 'little') return
    const node = fixThreadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [step, quickFixChat, fixing])

  const showEditInDraft = (key: string, replacement: string) => {
    setActiveEdit(key)
    const located = highlightFixInDraft(draftRef.current, replacement)
    if (!located) {
      clearFixHighlight()
      setActiveEdit('')
      message.info('That wording is no longer in the draft — a later fix or rewrite has replaced it.')
      return
    }
    // Landing on a passage that has since been edited again is still the right place
    // to look, but pretending it is the original wording would be a lie.
    if (located === 'partial') message.info('This passage has been edited again since — showing where the fix landed.')
  }

  // The highlight belongs to one draft on one page. Leaving either has to clear it,
  // or a stale range paints over unrelated text the next time you come back.
  useEffect(() => {
    if (step === 'little') return
    clearFixHighlight()
    setActiveEdit('')
  }, [step])

  useEffect(() => {
    clearFixHighlight()
    setActiveEdit('')
  }, [run?.runId, run?.article])

  useEffect(() => () => clearFixHighlight(), [])

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
      setStep('progress')
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
      setPreviewStale(true)
      if (updated.wordpressPublication?.postId && preview) await loadPreview(updated.wordpressPublication.postId)
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

  // ---- Little fixes: one Hermes call that patches the draft in place ----
  const sendQuickFix = async () => {
    const text = fixInstruction.trim()
    if (!run || !text || fixing) return
    const send = async () => {
      setFixing(true)
      setError('')
      setFixInstruction('')
      try {
        const updated = await applyContentOperationsQuickFix(run.runId, {
          instruction: text,
          applyToLive: isLive && applyToLive,
        })
        setRun(updated)
        setRuns((current) => current.map((item) => (item.runId === updated.runId ? updated : item)))
        setPreviewStale(true)
      } catch (fixError) {
        const messageText = fixError instanceof Error ? fixError.message : 'The fix could not be applied.'
        setError(messageText)
        message.error(messageText)
        // Put the instruction back so a failed send is not also a lost one.
        setFixInstruction(text)
        await refreshRun()
      } finally {
        setFixing(false)
      }
    }
    if (isLive && applyToLive) {
      Modal.confirm({
        title: 'Edit the live post?',
        content: `"${run.wordpressPublication?.title || 'This article'}" is already published. This fix will change what readers see on trustedtechnology.ai straight away.`,
        okText: 'Fix and update live',
        cancelText: 'Cancel',
        onOk: send,
      })
      return
    }
    await send()
  }

  const undoQuickFix = (fixId: string) => {
    if (!run || fixing) return
    setFixing(true)
    setError('')
    void (async () => {
      try {
        const updated = await revertContentOperationsQuickFix(run.runId, { fixId, applyToLive: isLive && applyToLive })
        setRun(updated)
        setRuns((current) => current.map((item) => (item.runId === updated.runId ? updated : item)))
        setPreviewStale(true)
      } catch (undoError) {
        const messageText = undoError instanceof Error ? undoError.message : 'That fix could not be undone.'
        setError(messageText)
        message.error(messageText)
        await refreshRun()
      } finally {
        setFixing(false)
      }
    })()
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
        // A heavy rewrite is a full pipeline pass, so the progress page is where it can
        // actually be watched.
        setStep('progress')
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
  const liveQuickFixes = (run?.quickFixes || []).filter((entry) => !entry.revertedAt)
  const undoableFixId = liveQuickFixes.at(-1)?.id
  const postId = run?.wordpressPublication?.postId
  const wordpressUsable = Boolean(postId) && run?.wordpressPublication?.status !== 'trash'

  const stepDisabledReason = (key: StepKey) => {
    if (key === 'request') return ''
    if (!run) return 'Generate or select an article first.'
    if (key === 'progress') return ''
    if (!run.article) return 'This article has not been written yet.'
    if ((key === 'little' || key === 'heavy') && run.status === 'running') return 'The pipeline is still running.'
    if (key === 'wordpress' && !wordpressUsable) return 'No WordPress post is attached to this article.'
    return ''
  }

  const goTo = (key: StepKey) => {
    const blocked = stepDisabledReason(key)
    if (blocked) { message.info(blocked); return }
    setStep(key)
  }

  const stepIndex = wizardSteps.findIndex(([key]) => key === step)
  const previousStep = wizardSteps[stepIndex - 1]
  const nextStep = wizardSteps[stepIndex + 1]

  const liveOrDraftTag = isLive ? <Tag color="red">Live post</Tag> : <Tag color="gold">Draft</Tag>
  const applyToLiveSwitch = isLive ? (
    <Tooltip title="This article is already published. Without this, edits are saved to the run only and the live post is left untouched.">
      <Space size="small">
        <Switch size="small" checked={applyToLive} disabled={revising || fixing} onChange={setApplyToLive} />
        <Text type={applyToLive ? 'danger' : undefined}>Apply to the live post</Text>
      </Space>
    </Tooltip>
  ) : null

  return (
    <div className="page content-generator-workspace">
      <div className="page-header">
        <div>
          <Space align="center" wrap><h1 className="page-title">Content Generator</h1><Tag color="gold">Hermes → WordPress</Tag></Space>
          <p className="page-subtitle">Request → build → little fixes → heavy fixes → WordPress. Move back and forward at any time.</p>
        </div>
        <Space wrap>
          <Tag color={ahrefsReady ? 'green' : 'red'}>Ahrefs {ahrefsReady ? 'connected' : 'not configured'}</Tag>
          <Tag color={wordpressReady ? 'green' : 'red'}>WordPress {wordpressReady ? 'connected' : 'not configured'}</Tag>
        </Space>
      </div>

      <Card className="section-card content-generator-steps">
        <Steps
          size="small"
          current={stepIndex}
          onChange={(index) => goTo(wizardSteps[index][0])}
          items={wizardSteps.map(([key, title]) => ({
            title,
            disabled: Boolean(stepDisabledReason(key)),
            status: key === step
              ? (run?.status === 'error' && key === 'progress' ? 'error' : 'process')
              : undefined,
          }))}
        />
        {run ? (
          <div className="content-generator-context">
            <Text type="secondary">Working on</Text>
            <Text strong>{run.wordpressPublication?.title || run.userInstructions.slice(0, 90)}</Text>
            <Tag color={run.status === 'error' ? 'red' : run.status === 'running' ? 'processing' : 'default'}>{displayStatus(run.status)}</Tag>
            {liveQuickFixes.length ? <Tag color="cyan">{liveQuickFixes.length} little fix{liveQuickFixes.length === 1 ? '' : 'es'}</Tag> : null}
            {run.surferOptimization?.seoScoreAfter != null ? <Tag color="blue">Surfer SEO {run.surferOptimization.seoScoreAfter}</Tag> : null}
          </div>
        ) : null}
      </Card>

      {error ? <Alert type="error" showIcon closable onClose={() => setError('')} message="Content pipeline issue" description={error} /> : null}

      {/* ---------- 1. Request ---------- */}
      {step === 'request' ? (
        <div className="content-generator-page content-generator-page-request">
          <Card className="section-card" title="Request an article or blog">
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
              <Text type="secondary">Generating creates an unpublished WordPress draft. Nothing is published until you say so on the last page.</Text>
            </Space>
          </Card>

          <Card
            className="section-card"
            title="Generated articles"
            extra={runs.length ? (
              <Button danger size="small" disabled={!selectedRunIds.length} onClick={() => setDeleteConfirmOpen(true)}>
                Delete selected{selectedRunIds.length ? ` (${selectedRunIds.length})` : ''}
              </Button>
            ) : null}
          >
            {runs.length ? (
              <div className="content-run-list content-run-list-tall">
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
                          // Invalidates any preview still loading for the previous
                          // selection, so it cannot land after this one.
                          previewRequestRef.current += 1
                          setRun(item)
                          setPreview(null)
                          setPreviewStale(true)
                          // Pick up a finished article where you left it; a running one
                          // goes to the page that shows what it is doing.
                          setStep(item.status === 'running' ? 'progress' : item.article ? 'little' : 'progress')
                        }}
                      >
                        <strong>{item.wordpressPublication?.title || item.userInstructions.slice(0, 72)}</strong>
                        <span>{isTrashed ? 'In WordPress Trash' : displayStatus(item.status)}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : <Empty description="No articles generated yet." />}
          </Card>
        </div>
      ) : null}

      {/* ---------- 2. Workflow progress ---------- */}
      {step === 'progress' ? (
        <Card
          className="section-card content-generator-page"
          title={<Space wrap><span>Workflow progress</span>{inRevision ? <Tag color="purple">Heavy fix pass {run?.currentCycle}</Tag> : null}</Space>}
          extra={run?.status === 'running' ? <Button danger onClick={() => void stop()}>Stop workflow</Button> : null}
        >
          {run ? (
            <>
              <div className="content-stage-list">
                {activeStageList.map(([id, label, description], index) => {
                  const state = stageState(run, cycleStages, activeStageList, id, index)
                  const completed = cycleStages.find((stage) => stage.stage === id)
                  // Stages added after a run finished have no record on it. Treat them as done
                  // rather than perpetually pending once the pass reached WordPress.
                  const legacyImageStage = (id === 'image_generation' || id === 'surfer_setup')
                    && !completed
                    && cycleStages.some((stage) => stage.stage === 'wordpress_draft')
                  return (
                    <div className={`content-stage content-stage-${legacyImageStage ? 'complete' : state}`} key={id}>
                      <div className="content-stage-index">{state === 'complete' || legacyImageStage ? '✓' : index + 1}</div>
                      <div><div className="content-stage-heading"><Text strong>{label}</Text><Tag color={stateColor(legacyImageStage ? 'complete' : state)}>{legacyImageStage ? 'Legacy complete' : displayStatus(state)}</Tag></div><Paragraph>{legacyImageStage ? 'This article was completed before this step existed in the workflow.' : completed?.result ? String(completed.result) : description}</Paragraph></div>
                    </div>
                  )
                })}
              </div>
              {busy || revising || run.status === 'running' ? <div className="content-generator-running"><Spin /><Text>Hermes is running the next step…</Text></div> : null}
            </>
          ) : <Empty description="Request an article to see the workflow run." />}
        </Card>
      ) : null}

      {/* ---------- 3. Little fixes ---------- */}
      {step === 'little' ? (
        <div className="content-generator-book">
          <Card
            className="section-card content-generator-draft"
            title={(
              <Space wrap>
                <span>The draft</span>
                {liveOrDraftTag}
                {liveQuickFixes.length ? <Tag color="cyan">{liveQuickFixes.length} fix{liveQuickFixes.length === 1 ? '' : 'es'} applied</Tag> : null}
                {(run?.generatedImages || []).some((image) => image?.url) ? (
                  <Tooltip title="The artwork is stored outside the article text and is spliced into the WordPress post on save. It is shown here in position so you can read the piece as it will look, but little fixes only change prose — to redo the images, turn on Regenerate images in Heavy fixes.">
                    <Tag>Images shown, not editable</Tag>
                  </Tooltip>
                ) : null}
              </Space>
            )}
          >
            <div ref={draftRef}>
              {run?.article
                ? <MarkdownArticle markdown={run.article} images={run.generatedImages || []} />
                : <Empty description="No draft yet." />}
            </div>
          </Card>

          <Card
            className="section-card content-generator-fixchat"
            title="Little fixes with Hermes"
          >
            <div className="content-fix-thread" ref={fixThreadRef}>
              {quickFixChat.length ? quickFixChat.map((entry) => (
                <div className={`chat-message chat-message-${entry.role}`} key={entry.id}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{entry.role === 'user' ? 'You' : 'Hermes'}</Text>
                  <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{entry.content}</Paragraph>
                  {entry.edits?.length ? (
                    <div className="content-fix-diffs">
                      {entry.edits.map((edit, index) => {
                        const key = `${entry.id}:${index}`
                        // A deletion left nothing behind to scroll to, so it stays a
                        // plain record rather than a button that could not work.
                        if (!edit.replace.trim()) {
                          return (
                            <div className="content-fix-diff" key={key}>
                              <del>{edit.find}</del>
                              <ins><em>(removed)</em></ins>
                            </div>
                          )
                        }
                        return (
                          <button
                            type="button"
                            className={`content-fix-diff content-fix-diff-clickable${activeEdit === key ? ' content-fix-diff-active' : ''}`}
                            key={key}
                            title="Show this change in the draft"
                            onClick={() => showEditInDraft(key, edit.replace)}
                          >
                            <del>{edit.find}</del>
                            <ins>{edit.replace}</ins>
                            <span className="content-fix-diff-hint">Show in draft →</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {entry.skipped?.length ? (
                    <div className="content-fix-skipped">
                      {entry.skipped.map((item, index) => (
                        <Text type="secondary" key={index} style={{ fontSize: 12 }}>Not applied — {item.reason}: “{item.find.slice(0, 90)}”</Text>
                      ))}
                    </div>
                  ) : null}
                  {entry.fixId && entry.fixId === undoableFixId ? (
                    <Button size="small" type="link" style={{ paddingLeft: 0 }} disabled={fixing} onClick={() => undoQuickFix(entry.fixId!)}>
                      Undo this fix
                    </Button>
                  ) : null}
                </div>
              )) : (
                <Empty
                  image={null}
                  description="Ask for the small stuff — “tighten the intro”, “say drivers, not operators”, “cut the pricing sentence”, “add a line about battery life to the FAQ”."
                />
              )}
              {fixing ? <div className="content-generator-running"><Spin /><Text>Hermes is editing the draft…</Text></div> : null}
            </div>

            <div className="content-editor-composer">
              <TextArea
                value={fixInstruction}
                onChange={(event) => setFixInstruction(event.target.value)}
                placeholder="What should change? Keep it small — wording, a sentence, a heading, a line to cut or add."
                autoSize={{ minRows: 3, maxRows: 8 }}
                disabled={fixing || !canEdit}
                onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void sendQuickFix() } }}
              />
              <div className="content-editor-options">
                {applyToLiveSwitch || <Text type="secondary" style={{ fontSize: 12 }}>Fixes are written straight into the WordPress draft.</Text>}
                <Button type="primary" loading={fixing} disabled={!fixInstruction.trim() || !canEdit} onClick={() => void sendQuickFix()}>
                  Send fix
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Surgical only — Hermes changes the text it names and leaves the rest byte for byte. For a new angle or a real rewrite, use Heavy fixes.
              </Text>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ---------- 4. Heavy fixes ---------- */}
      {step === 'heavy' ? (
        <Card
          className="section-card content-generator-page content-generator-heavy"
          title={<Space wrap><span>Heavy fixes — rewrite the article</span>{liveOrDraftTag}{run?.surferOptimization?.seoScoreAfter != null ? <Tag color="blue">Surfer SEO {run.surferOptimization.seoScoreAfter}</Tag> : null}</Space>}
        >
          {liveQuickFixes.length ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14 }}
              message={`Your ${liveQuickFixes.length} little fix${liveQuickFixes.length === 1 ? '' : 'es'} ${liveQuickFixes.length === 1 ? 'is' : 'are'} included`}
              description="The rewrite starts from the draft as it stands, and every line edit you made is replayed as standing direction — the rewrite is not allowed to undo them."
            />
          ) : null}
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
                    Undo this rewrite
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
                <Text>Running the pipeline again — Workflow progress shows the current step.</Text>
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
                {applyToLiveSwitch}
              </Space>
              <Button type="primary" loading={revising} disabled={!instruction.trim() || !canEdit} onClick={() => void sendInstruction()}>
                Rewrite article
              </Button>
            </div>
            <Text type="secondary">
              {'A rewrite re-runs research, the draft, SurferSEO and the WordPress sync — it takes minutes, not seconds. The title, slug and meta description are rewritten with the article. '}
              {reoptimize && enforceScoreFloor && run?.surferOptimization?.seoScoreAfter != null
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

      {/* ---------- 5. Send to WordPress ---------- */}
      {step === 'wordpress' ? (
        <Card
          className="section-card content-generator-page content-generator-preview"
          title={<Space wrap><span>Send to WordPress</span>{liveOrDraftTag}</Space>}
          extra={preview ? (
            <Space wrap>
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
              {isLive ? (
                <Button type="primary" ghost href={run?.wordpressPublication?.url || undefined} target="_blank" rel="noreferrer">View live post ✓</Button>
              ) : (
                <Button type="primary" loading={publishing} disabled={!postId} onClick={publish}>Publish to blog</Button>
              )}
            </Space>
          ) : null}
        >
          {previewLoading ? <div className="wordpress-preview-empty"><Spin size="large" /></div> : null}
          {!previewLoading && !preview && wordpressUsable ? (
            <div className="wordpress-preview-empty">
              <Empty description="Your WordPress article is ready.">
                <Button type="primary" size="large" onClick={() => void loadPreview(postId!)}>Show the WordPress article</Button>
              </Empty>
            </div>
          ) : null}
          {!previewLoading && !preview && !wordpressUsable ? (
            <div className="wordpress-preview-empty">
              <Empty description={run?.status === 'running' ? 'The WordPress post is created at the end of the workflow.' : 'This article has no WordPress post attached.'} />
            </div>
          ) : null}
          {preview ? <iframe title={`WordPress draft ${preview.id} preview`} className="wordpress-preview-frame" sandbox="" srcDoc={srcDoc} /> : null}
        </Card>
      ) : null}

      <div className="content-generator-nav">
        <Button
          disabled={!previousStep || Boolean(stepDisabledReason(previousStep[0]))}
          onClick={() => previousStep && goTo(previousStep[0])}
        >
          {previousStep ? `← ${previousStep[1]}` : '←'}
        </Button>
        <Text type="secondary">{`Page ${stepIndex + 1} of ${wizardSteps.length} — ${wizardSteps[stepIndex][2]}`}</Text>
        <Tooltip title={nextStep ? stepDisabledReason(nextStep[0]) : ''}>
          <Button
            type="primary"
            disabled={!nextStep || Boolean(stepDisabledReason(nextStep[0]))}
            onClick={() => nextStep && goTo(nextStep[0])}
          >
            {nextStep ? `${nextStep[1]} →` : '→'}
          </Button>
        </Tooltip>
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
