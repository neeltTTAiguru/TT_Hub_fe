import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  approveContentOperationsGate,
  createContentOperationsWordPressDraft,
  createContentOperationsRun,
  getContentOperationsIntegrations,
  getContentOperationsRuns,
  publishContentOperationsTestPost,
  restartContentOperationsRun,
  stopContentOperationsRun,
  type ContentIntegrationMap,
  type ContentOperationsRun,
  type ContentOpportunity,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

const stages = [
  ['opportunity_research', 'Opportunity Research Agent', 'Discovers SEO opportunities.', 'Ahrefs MCP'],
  ['opportunity_scoring', 'Opportunity Scoring Agent', 'Prioritizes business and search value.', 'Hermes + Ahrefs'],
  ['content_decision', 'Content Decision Agent', 'Chooses the right content action.', 'Limited available data'],
  ['seo_brief', 'SEO Brief Agent', 'Builds the approved content strategy.', 'Hermes'],
  ['article_writing', 'Article Writing Agent', 'Writes the article from the approved brief.', 'Hermes'],
  ['surfer', 'Surfer Optimization Agent', 'Optimizes an approved draft.', 'SurferSEO'],
  ['wordpress', 'WordPress Draft Agent', 'Creates a draft post without publishing.', 'WordPress'],
  ['human_review', 'Human Review', 'Requires a factual and brand approval.', 'Trusted Tech reviewer'],
  ['publishing', 'Publishing Agent', 'Publishes only after confirmation.', 'WordPress'],
  ['tracking', 'Performance Tracking Agent', 'Tracks results at scheduled checkpoints.', 'GSC + GA4 + Ahrefs'],
] as const

const requestOptions = [
  ['find_content_opportunities', 'Find content opportunities'],
  ['create_content_roadmap', 'Create a content roadmap'],
  ['create_seo_brief', 'Create an SEO brief'],
  ['generate_article', 'Generate an article'],
  ['refresh_content', 'Refresh existing content'],
  ['analyze_competitor', 'Analyze a competitor'],
  ['find_content_gaps', 'Find content gaps'],
  ['technical_seo', 'Review technical SEO issues'],
].map(([value, label]) => ({ value, label }))

function displayStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function stageStatus(
  run: ContentOperationsRun | null,
  stage: string,
  integrations: ContentIntegrationMap,
) {
  const stageEntry = run?.stages.find((entry) => entry.stage === stage)
  const failedToolResult = /\b(?:unreachable|unavailable|failed|failure|error|could not|unable to|no usable data|rate limit|quota)\b/i
    .test(String(stageEntry?.result || ''))
  if (stageEntry && failedToolResult) return 'Error'
  if (run?.status === 'error' && run.currentStage === stage) return 'Error'
  if (run?.status === 'stopped' && run.currentStage === stage) return 'Stopped'
  const completed = Boolean(stageEntry)
  if (completed) return 'Complete'
  if (stage === 'wordpress') {
    return integrations.wordpress?.status === 'connected' ? 'Ready' : 'Not configured'
  }
  if (stage === 'publishing') return 'Intentionally disabled'
  if (['surfer', 'tracking'].includes(stage)) return 'Not configured'
  if (!run) return 'Ready'
  if (run.currentStage === stage) return run.status === 'running' ? 'Running' : 'Waiting'
  if (stage === 'content_decision' && run.opportunities.length) return 'Needs review'
  if (stage === 'human_review' && run.article) return run.approval.article ? 'Complete' : 'Needs review'
  return 'Ready'
}

function statusColor(status: string) {
  if (status === 'Complete' || status === 'Connected') return 'green'
  if (status === 'Running') return 'processing'
  if (status === 'Needs review' || status === 'Waiting') return 'gold'
  if (status === 'Error') return 'red'
  if (status === 'Stopped') return 'default'
  return 'default'
}

export default function ContentOperations() {
  const [form] = Form.useForm()
  const [run, setRun] = useState<ContentOperationsRun | null>(null)
  const [runs, setRuns] = useState<ContentOperationsRun[]>([])
  const [integrations, setIntegrations] = useState<ContentIntegrationMap>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detailStage, setDetailStage] = useState<string | null>(null)
  const [articleLength, setArticleLength] = useState('standard')
  const [activeStage, setActiveStage] = useState('')
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [integrationData, runData] = await Promise.all([
          getContentOperationsIntegrations(),
          getContentOperationsRuns(),
        ])
        setIntegrations(integrationData)
        setRuns(runData)
        if (runData[0]) setRun(runData[0])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load Content Operations.')
      }
    }

    void load()
  }, [])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = window.setInterval(async () => {
      try {
        const latestRuns = await getContentOperationsRuns()
        const refreshed = latestRuns.find((item) => item.runId === run.runId)
        setRuns(latestRuns)
        if (refreshed) {
          setRun(refreshed)
          if (refreshed.status !== 'running') {
            setBusy(false)
            setActiveStage('')
            if (refreshed.status === 'error') setError(refreshed.errors.at(-1) || 'The content pipeline failed.')
          }
        }
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh the active run.')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run?.runId, run?.status])

  const execute = async (researchOnly: boolean) => {
    const values = await form.validateFields()
    setRun(null)
    setDetailStage(null)
    setBusy(true)
    setActiveStage('opportunity_research')
    setError('')
    try {
      setIntegrations(await getContentOperationsIntegrations())
      const created = await createContentOperationsRun({ ...values, researchOnly })
      setRun(created)
      setRuns((current) => [created, ...current])
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The content pipeline failed.')
      setBusy(false)
      setActiveStage('')
      try {
        const latestRuns = await getContentOperationsRuns()
        setRuns(latestRuns)
        if (latestRuns[0]) setRun(latestRuns[0])
      } catch {
        // Preserve the original pipeline error when refreshing the failed run also fails.
      }
    } finally {
      // The polling loop owns the busy state while the asynchronous run is active.
    }
  }

  const stopRun = async () => {
    if (!run || run.status !== 'running') return
    setError('')
    try {
      const stopped = await stopContentOperationsRun(run.runId)
      setRun(stopped)
      setRuns((current) => current.map((item) => item.runId === stopped.runId ? stopped : item))
      setBusy(false)
      setActiveStage('')
      message.info('Content run stopped')
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'Unable to stop the run.')
    }
  }

  const restartRun = async () => {
    if (!run) return
    setRun(null)
    setDetailStage(null)
    setError('')
    setBusy(true)
    setActiveStage('opportunity_research')
    try {
      setIntegrations(await getContentOperationsIntegrations())
      const restarted = await restartContentOperationsRun(run.runId)
      setRun(restarted)
      setRuns((current) => [restarted, ...current])
    } catch (restartError) {
      setBusy(false)
      setActiveStage('')
      setError(restartError instanceof Error ? restartError.message : 'Unable to restart the run.')
    }
  }

  const approveOpportunity = async (opportunity: ContentOpportunity) => {
    if (!run) return
    setBusy(true)
    setActiveStage('seo_brief')
    setError('')
    try {
      setRun(await approveContentOperationsGate(run.runId, {
        gate: 'opportunity',
        opportunityId: opportunity.id,
      }))
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Opportunity approval failed.')
    } finally {
      setBusy(false)
      setActiveStage('')
    }
  }

  const approveBrief = async () => {
    if (!run?.brief) return
    setBusy(true)
    setActiveStage('article_writing')
    setError('')
    try {
      setRun(await approveContentOperationsGate(run.runId, {
        gate: 'brief',
        brief: { ...run.brief, articleLength },
      }))
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Brief approval failed.')
    } finally {
      setBusy(false)
      setActiveStage('')
    }
  }

  const approveArticle = async () => {
    if (!run) return
    setBusy(true)
    setActiveStage('human_review')
    try {
      setRun(await approveContentOperationsGate(run.runId, { gate: 'article' }))
      message.success('Article approved for export')
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Article approval failed.')
    } finally {
      setBusy(false)
      setActiveStage('')
    }
  }

  const publishToTestBlog = async () => {
    if (!run) return false
    setBusy(true)
    setActiveStage('publishing')
    setError('')
    try {
      const published = await publishContentOperationsTestPost(run.runId)
      setRun(published)
      message.success('Published to the local Content Operations test blog')
      return true
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Test publishing failed.')
      return false
    } finally {
      setBusy(false)
      setActiveStage('')
    }
  }

  const createWordPressDraft = async () => {
    if (!run) return
    setBusy(true)
    setActiveStage('wordpress_draft')
    setError('')
    try {
      const drafted = await createContentOperationsWordPressDraft(run.runId)
      setRun(drafted)
      message.success('WordPress draft created; nothing was published live')
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'WordPress draft creation failed.')
    } finally {
      setBusy(false)
      setActiveStage('')
    }
  }

  const downloadArticle = () => {
    if (!run?.article) return
    const url = URL.createObjectURL(new Blob([run.article], { type: 'text/markdown' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${run.brief?.slug || 'trusted-tech-article'}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedDetail = useMemo(
    () => run?.stages.find((entry) => entry.stage === detailStage),
    [detailStage, run],
  )

  return (
    <div className="page content-operations">
      <div className="page-header">
        <div>
          <Space align="center" wrap>
            <h1 className="page-title">TT- Content Generator</h1>
            <Tag color="gold">Hermes Content Pipeline</Tag>
          </Space>
          <p className="page-subtitle">
            Research, plan, write, optimize, review, publish, and track Trusted Tech content from one workspace.
          </p>
        </div>
        <Tag color={run?.status === 'completed' ? 'green' : run?.status === 'error' ? 'red' : 'processing'}>
          {displayStatus(run?.status || 'ready')}
        </Tag>
      </div>

      {error ? <Alert type="error" showIcon message="Content pipeline issue" description={error} /> : null}

      <Card className="section-card" title="Start a content request">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            targetDomain: 'trustedtechnology.ai',
            requestType: 'find_content_opportunities',
            workflowMode: 'balanced',
          }}
        >
          <div className="content-request-grid">
            <Form.Item label="Target website" name="targetDomain" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Request type" name="requestType" rules={[{ required: true }]}>
              <Select options={requestOptions} />
            </Form.Item>
            <Form.Item label="Workflow mode" name="workflowMode" rules={[{ required: true }]}>
              <Select options={[
                { value: 'manual', label: 'Manual' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'draft_automation', label: 'Draft automation' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item label="User instructions" name="userInstructions" rules={[{ required: true }]}>
            <TextArea
              rows={5}
              placeholder="Find the strongest content opportunity for Trusted Technology and create an SEO brief."
            />
          </Form.Item>
          <Space wrap>
            <Button type="primary" loading={busy} onClick={() => void execute(false)}>
              Run Content Pipeline
            </Button>
            <Button loading={busy} onClick={() => void execute(true)}>Research Only</Button>
            <Button danger disabled={run?.status !== 'running'} onClick={() => void stopRun()}>
              Stop run
            </Button>
            <Button disabled={!run || run.status === 'running'} onClick={() => void restartRun()}>
              Restart run
            </Button>
          </Space>
        </Form>
      </Card>

      <Card className="section-card" title="Connection status">
        <div className="integration-grid">
          {Object.values(integrations).map((integration) => {
            const connected = integration.status === 'connected'
            return (
              <div className="integration-item" key={integration.label}>
                <Text>{integration.label}</Text>
                <Tag color={connected ? 'green' : 'default'}>
                  {connected ? 'Connected' : displayStatus(integration.status)}
                </Tag>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="pipeline-train-shell" aria-label="Content pipeline">
      <div className="pipeline-train">
        {stages.map(([id, name, description, tool], index) => {
          const status = stageStatus(run, id, integrations)
          const completed = run?.stages.find((entry) => entry.stage === id)
          const stageError = run?.currentStage === id && ['error', 'stopped'].includes(run.status)
            ? run.errors.at(-1)
            : ''
          const active = activeStage === id || (
            !activeStage &&
            (run?.currentStage === id ||
              (run?.currentStage === 'opportunity_approval' && id === 'content_decision') ||
              (run?.currentStage === 'brief_approval' && id === 'seo_brief') ||
              (run?.currentStage === 'article_approval' && id === 'human_review'))
          )
          return (
            <div className="pipeline-train-segment" key={id}>
            <Card className={`pipeline-card${active ? ' pipeline-card-active' : ''}`}>
              <div className="pipeline-step-number">{index + 1}</div>
              <div className="hub-panel-header">
                <Text strong>{name}</Text>
                <Tag color={statusColor(status)}>{status}</Tag>
              </div>
              <Paragraph className="panel-copy">{description}</Paragraph>
              <Text type="secondary">Tool: {tool}</Text>
              <Paragraph className="pipeline-last-action">
                Last action: {stageError || (completed?.result ? String(completed.result).slice(0, 140) : 'None yet')}
              </Paragraph>
              <Button size="small" onClick={() => setDetailStage(id)}>Open details</Button>
            </Card>
            {index < stages.length - 1 ? <span className="pipeline-train-arrow" aria-hidden="true">→</span> : null}
            </div>
          )
        })}
      </div>
      </div>

      {run ? (
        <Card className="section-card" title="Current pipeline run">
          <div className="run-summary">
            <Text><strong>Run ID:</strong> {run.runId}</Text>
            <Text><strong>Target:</strong> {run.targetDomain}</Text>
            <Text><strong>Current stage:</strong> {displayStatus(run.currentStage)}</Text>
            <Text><strong>Started:</strong> {new Date(run.createdAt).toLocaleString()}</Text>
            <Text><strong>Tool calls:</strong> {run.toolCallsUsed.join(', ') || 'None recorded'}</Text>
          </div>
        </Card>
      ) : null}

      {run?.opportunities.length ? (
        <Card className="section-card" title="Content opportunities">
          <div className="opportunity-grid">
            {run.opportunities.map((opportunity) => (
              <Card key={opportunity.id} type="inner" title={opportunity.title || opportunity.primaryKeyword}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Tag color="gold">Score: {opportunity.score ?? 'N/A'}</Tag>
                  <Text><strong>Keyword:</strong> {opportunity.primaryKeyword}</Text>
                  <Text>Volume: {opportunity.searchVolume ?? 'Unavailable'}</Text>
                  <Text>Difficulty: {opportunity.keywordDifficulty ?? 'Unavailable'}</Text>
                  <Text>Traffic potential: {opportunity.trafficPotential ?? 'Unavailable'}</Text>
                  <Paragraph>{opportunity.rationale}</Paragraph>
                  {!run.researchOnly && !run.approval.opportunity ? (
                    <Button type="primary" disabled={busy} onClick={() => void approveOpportunity(opportunity)}>
                      Select and approve
                    </Button>
                  ) : null}
                </Space>
              </Card>
            ))}
          </div>
        </Card>
      ) : null}

      {run?.brief ? (
        <Card className="section-card" title="SEO brief">
          <Collapse items={Object.entries(run.brief).map(([key, value]) => ({
            key,
            label: displayStatus(key),
            children: <pre className="content-json">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>,
          }))} />
          {!run.approval.brief ? (
            <Space style={{ marginTop: 16 }} wrap>
              <Radio.Group value={articleLength} onChange={(event) => setArticleLength(event.target.value)}>
                <Radio.Button value="short">Short</Radio.Button>
                <Radio.Button value="standard">Standard</Radio.Button>
                <Radio.Button value="long-form">Long-form</Radio.Button>
              </Radio.Group>
              <Button type="primary" loading={busy} onClick={() => void approveBrief()}>
                Approve brief and draft article
              </Button>
            </Space>
          ) : null}
        </Card>
      ) : null}

      {run?.article ? (
        <Card className="section-card" title="Article draft">
          <pre className="article-preview">{run.article}</pre>
          <Space wrap>
            <Button onClick={() => void navigator.clipboard.writeText(run.article)}>Copy article</Button>
            <Button onClick={downloadArticle}>Download Markdown</Button>
            {!run.approval.article ? (
              <Button type="primary" loading={busy} onClick={() => void approveArticle()}>Approve article</Button>
            ) : null}
            {run.approval.article && !run.testPublication?.published ? (
              <Button
                type="primary"
                loading={busy}
                onClick={() => setPublishConfirmOpen(true)}
              >
                Publish to test blog
              </Button>
            ) : null}
            {run.testPublication?.published ? (
              <Button href="/assistants/content-operations/blog">View test blog</Button>
            ) : null}
            <Button disabled>Send to Surfer</Button>
            {run.wordpressPublication?.postId ? (
              <Button href={run.wordpressPublication.url || undefined} target="_blank">
                View WordPress draft
              </Button>
            ) : (
              <Button
                disabled={!run.approval.article || integrations.wordpress?.status !== 'connected'}
                loading={busy && activeStage === 'wordpress_draft'}
                onClick={() => void createWordPressDraft()}
              >
                Create WordPress draft
              </Button>
            )}
          </Space>
        </Card>
      ) : null}

      {runs.length > 1 ? (
        <Card className="section-card" title="Recent runs">
          <Select
            style={{ width: '100%' }}
            value={run?.runId}
            onChange={(runId) => setRun(runs.find((item) => item.runId === runId) || null)}
            options={runs.map((item) => ({
              value: item.runId,
              label: `${item.targetDomain} — ${displayStatus(item.status)} — ${new Date(item.createdAt).toLocaleString()}`,
            }))}
          />
        </Card>
      ) : null}

      <Modal
        title="Publish to the local test blog?"
        open={publishConfirmOpen}
        okText="Publish test post"
        confirmLoading={busy}
        onCancel={() => setPublishConfirmOpen(false)}
        onOk={async () => {
          if (await publishToTestBlog()) setPublishConfirmOpen(false)
        }}
      >
        <Paragraph>
          This publishes only inside the Smart Hub test blog. It does not contact WordPress or change the public website.
        </Paragraph>
      </Modal>

      <Modal
        title={detailStage ? displayStatus(detailStage) : 'Stage details'}
        open={Boolean(detailStage)}
        footer={null}
        onCancel={() => setDetailStage(null)}
      >
        {selectedDetail ? (
          <Space direction="vertical">
            <Text><strong>Tool:</strong> {selectedDetail.tool}</Text>
            <Text><strong>Result:</strong> {String(selectedDetail.result)}</Text>
            <Text><strong>Why:</strong> {selectedDetail.explanation}</Text>
            <pre className="content-json">{JSON.stringify(selectedDetail.output, null, 2)}</pre>
          </Space>
        ) : run && detailStage === run.currentStage && run.errors.length ? (
          <Alert
            type={run.status === 'stopped' ? 'warning' : 'error'}
            message={run.status === 'stopped' ? 'Run stopped' : 'Stage failed'}
            description={run.errors.at(-1)}
            showIcon
          />
        ) : (
          <Alert
            type="info"
            message="No completed action"
            description="This stage has not run yet or its integration is not configured."
          />
        )}
      </Modal>

      {busy ? <div className="pipeline-busy"><Spin size="large" /><Text>Hermes is running the content pipeline…</Text></div> : null}
    </div>
  )
}
