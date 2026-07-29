import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  getTwitterConnectionStatus,
  getTwitterSurferRuns,
  getTwitterSurferTaskRuns,
  openTwitterSession,
  startTwitterSurferTaskRun,
  stopTwitterSurferTaskRun,
  type ResearchRun,
  type TwitterConnectionStatus,
  type TwitterSignalPost,
  type TwitterSurferTaskRun,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

type RunFormValues = {
  task: string
  durationMinutes: number
}

const defaultTask =
  'Find United States posts about body-worn camera RFPs, bids, solicitations, procurement, grants, funding, or agency purchase intent.'

function formatDateTime(value: string) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString()
}

function runStatusTag(status: TwitterSurferTaskRun['status']) {
  if (status === 'running') return <Tag color="processing">Running</Tag>
  if (status === 'completed') return <Tag color="green">Completed</Tag>
  return <Tag color="red">Failed</Tag>
}

function signalSource(post: TwitterSignalPost) {
  return post.url || post.sourcePage
}

function renderSignalList(title: string, posts: TwitterSignalPost[]) {
  if (!posts.length) return null

  return (
    <div>
      <Text strong>{title}</Text>
      <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
        {posts.map((post, index) => {
          const source = signalSource(post)
          const key = source || `${post.search}-${index}`

          return (
            <div className="twitter-signal" key={key}>
              <Space wrap size={6}>
                <Tag color={post.signal.score >= 5 ? 'green' : 'gold'}>Score {post.signal.score}</Tag>
                {post.signal.matchedTerms.slice(0, 4).map((term) => (
                  <Tag key={term}>{term}</Tag>
                ))}
                {post.postedAt ? <Tag>{formatDateTime(post.postedAt)}</Tag> : null}
              </Space>
              <Paragraph style={{ margin: '8px 0 4px' }}>{post.text}</Paragraph>
              <Space wrap size={8}>
                {post.author || post.handle ? <Text type="secondary">{post.author || post.handle}</Text> : null}
                {source ? (
                  <Typography.Link href={source} target="_blank" rel="noreferrer">
                    Open source
                  </Typography.Link>
                ) : null}
              </Space>
              <div>
                <Text type="secondary">Search: </Text>
                <Text code>{post.search}</Text>
              </div>
            </div>
          )
        })}
      </Space>
    </div>
  )
}

export default function TwitterSurfer() {
  const [form] = Form.useForm<RunFormValues>()
  const [taskRuns, setTaskRuns] = useState<TwitterSurferTaskRun[]>([])
  const [savedRuns, setSavedRuns] = useState<ResearchRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<TwitterConnectionStatus | null>(null)
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStartingRun, setIsStartingRun] = useState(false)
  const [stoppingRunId, setStoppingRunId] = useState('')
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [error, setError] = useState('')

  const selectedRun = useMemo(
    () => taskRuns.find((run) => run.id === selectedRunId) ?? taskRuns[0] ?? null,
    [selectedRunId, taskRuns],
  )
  const isTwitterConnected = connectionStatus?.connected === true
  const activeRuns = taskRuns.filter((run) => run.status === 'running')
  const completedRuns = taskRuns.filter((run) => run.status === 'completed')

  const loadRuns = async () => {
    setIsLoadingRuns(true)

    try {
      const [nextTaskRuns, nextSavedRuns] = await Promise.all([
        getTwitterSurferTaskRuns(),
        getTwitterSurferRuns(),
      ])
      setTaskRuns(nextTaskRuns)
      setSavedRuns(nextSavedRuns)
      setSelectedRunId((current) => current || nextTaskRuns[0]?.id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Twitter Surfer runs.')
    } finally {
      setIsLoadingRuns(false)
    }
  }

  const checkConnection = async () => {
    setIsCheckingConnection(true)

    try {
      setConnectionStatus(await getTwitterConnectionStatus())
    } catch (connectionError) {
      const text =
        connectionError instanceof Error ? connectionError.message : 'Failed to check X/Twitter connection.'
      setConnectionStatus({
        connected: false,
        browserReady: false,
        currentUrl: '',
        title: '',
        readyState: '',
        needsLogin: false,
        source: 'openclaw-browser',
        message: text,
      })
    } finally {
      setIsCheckingConnection(false)
    }
  }

  useEffect(() => {
    void checkConnection()
    void loadRuns()
  }, [])

  useEffect(() => {
    if (!activeRuns.length) return

    const timer = window.setInterval(() => {
      void loadRuns()
    }, 15000)

    return () => window.clearInterval(timer)
  }, [activeRuns.length])

  const openLogin = async () => {
    setError('')

    try {
      await openTwitterSession({ url: 'https://x.com/i/flow/login' })
      setConnectionStatus((current) => ({
        connected: false,
        browserReady: true,
        currentUrl: current?.currentUrl || 'https://x.com/i/flow/login',
        title: current?.title || 'X/Twitter Login',
        readyState: current?.readyState || '',
        needsLogin: true,
        source: 'openclaw-browser',
        message: 'Finish login in the OpenClaw browser, then click Check Connection.',
      }))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Failed to open X/Twitter login.')
    }
  }

  const startRun = async (values: RunFormValues) => {
    if (!isTwitterConnected) {
      setError('Login to X/Twitter before starting a run.')
      await openLogin()
      return
    }

    setIsStartingRun(true)
    setError('')

    try {
      const run = await startTwitterSurferTaskRun({
        task: values.task,
        durationMinutes: values.durationMinutes || 30,
      })

      setTaskRuns((current) => [run, ...current])
      setSelectedRunId(run.id)
      setIsModalOpen(false)
      form.resetFields()
      message.success('Twitter Surfer run started')
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start Twitter Surfer run.')
    } finally {
      setIsStartingRun(false)
    }
  }

  const stopRun = async (runId: string) => {
    setStoppingRunId(runId)
    setError('')

    try {
      const stoppedRun = await stopTwitterSurferTaskRun(runId)
      setTaskRuns((current) => current.map((run) => (run.id === runId ? stoppedRun : run)))
      setSelectedRunId(runId)
      message.success('Twitter Surfer run stopped')
      await loadRuns()
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'Failed to stop Twitter Surfer run.')
    } finally {
      setStoppingRunId('')
    }
  }

  const runColumns: ColumnsType<TwitterSurferTaskRun> = [
    {
      title: 'Run',
      dataIndex: 'task',
      key: 'task',
      render: (task: string, run) => (
        <Space direction="vertical" size={2}>
          <Button type="link" style={{ padding: 0 }} onClick={() => setSelectedRunId(run.id)}>
            <Text strong>{run.title}</Text>
          </Button>
          <Paragraph ellipsis={{ rows: 2, expandable: false }}>{task}</Paragraph>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: runStatusTag,
    },
    {
      title: 'Signals',
      key: 'signals',
      width: 100,
      render: (_, run) => run.posts.length,
    },
    {
      title: 'Rounds',
      key: 'rounds',
      width: 100,
      render: (_, run) => run.progress.roundsAttempted,
    },
    {
      title: 'Ends',
      dataIndex: 'endsAt',
      key: 'endsAt',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, run) =>
        run.status === 'running' ? (
          <Button danger loading={stoppingRunId === run.id} onClick={() => void stopRun(run.id)}>
            Stop
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Twitter Surfer</h1>
          <p className="page-subtitle">Start a time-boxed Twitter run and get a report from OpenClaw.</p>
        </div>
        <Space wrap>
          <Button onClick={() => void checkConnection()} loading={isCheckingConnection}>
            Check Connection
          </Button>
          {!isTwitterConnected ? <Button onClick={() => void openLogin()}>Login To X/Twitter</Button> : null}
          <Button type="primary" onClick={() => setIsModalOpen(true)} disabled={!isTwitterConnected}>
            New Run
          </Button>
        </Space>
      </div>

      {!isTwitterConnected ? (
        <Alert
          type="warning"
          showIcon
          message="X/Twitter login required"
          description={connectionStatus?.message || 'Login to X/Twitter before starting a run.'}
          action={<Button onClick={() => void openLogin()}>Login</Button>}
        />
      ) : (
        <Alert type="success" showIcon message="X/Twitter connected" description="Twitter Surfer can start runs from this hub screen." />
      )}

      {error ? <Alert type="error" showIcon message="Twitter Surfer needs attention" description={error} /> : null}

      <div className="grant-application-stats">
        <Card className="section-card">
          <Text type="secondary">Active Runs</Text>
          <Typography.Title level={3}>{activeRuns.length}</Typography.Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Completed Runs</Text>
          <Typography.Title level={3}>{completedRuns.length}</Typography.Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Saved Reports</Text>
          <Typography.Title level={3}>{savedRuns.length}</Typography.Title>
        </Card>
      </div>

      <Card className="section-card" title="Runs">
        <Table<TwitterSurferTaskRun>
          rowKey="id"
          loading={isLoadingRuns}
          dataSource={taskRuns}
          columns={runColumns}
          pagination={{ pageSize: 6, showSizeChanger: false }}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No Twitter Surfer runs yet. Start a new run and describe what posts you want.' }}
        />
      </Card>

      <Card
        className="section-card"
        title={selectedRun ? 'Run Report' : 'Run Report'}
        extra={
          selectedRun ? (
            <Space>
              {runStatusTag(selectedRun.status)}
              {selectedRun.status === 'running' ? (
                <Button danger loading={stoppingRunId === selectedRun.id} onClick={() => void stopRun(selectedRun.id)}>
                  Stop Run
                </Button>
              ) : null}
            </Space>
          ) : null
        }
      >
        {selectedRun ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
              <Tag>{selectedRun.durationMinutes} min</Tag>
              <Tag>{selectedRun.posts.length} signals</Tag>
              <Tag>{selectedRun.progress.roundsAttempted} rounds</Tag>
              {selectedRun.stoppedByUser ? <Tag color="orange">Stopped manually</Tag> : null}
              <Tag>Started {formatDateTime(selectedRun.startedAt)}</Tag>
            </Space>
            <Paragraph>{selectedRun.report.summary}</Paragraph>
            {renderSignalList('Opportunity signals', selectedRun.report.opportunitySignals)}
            {renderSignalList('Weak signals / needs verification', selectedRun.report.weakSignals)}
            {!selectedRun.report.opportunitySignals.length && !selectedRun.report.weakSignals.length ? (
              <Alert
                type="info"
                showIcon
                message="No report signals captured yet"
                description="The run summary is available, but OpenClaw did not capture any signal details for this run."
              />
            ) : null}
            <div>
              <Text strong>Searches OpenClaw is running</Text>
              <ul>
                {selectedRun.searches.map((search) => (
                  <li key={search}>
                    <Text code>{search}</Text>
                  </li>
                ))}
              </ul>
            </div>
            {selectedRun.report.recommendedNextSteps.length ? (
              <div>
                <Text strong>Recommended next steps</Text>
                <ul>
                  {selectedRun.report.recommendedNextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Space>
        ) : (
          <Text type="secondary">Select or start a run to see the report.</Text>
        )}
      </Card>

      <Modal
        title="New Twitter Surfer Run"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false)
          form.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ task: defaultTask, durationMinutes: 30 }}
          onFinish={startRun}
        >
          <Form.Item
            label="What posts should OpenClaw look for?"
            name="task"
            rules={[{ required: true, message: 'Describe what OpenClaw should search for.' }]}
          >
            <TextArea
              rows={6}
              placeholder="Example: Find recent posts from police departments, city procurement offices, grant writers, and public safety vendors that mention body camera RFPs, grants, bids, or digital evidence purchasing."
            />
          </Form.Item>
          <Form.Item label="Run duration" name="durationMinutes" rules={[{ required: true }]}>
            <InputNumber min={1} max={30} addonAfter="minutes" style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Button
              onClick={() => {
                setIsModalOpen(false)
                form.resetFields()
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={isStartingRun}>
              Start Run
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
