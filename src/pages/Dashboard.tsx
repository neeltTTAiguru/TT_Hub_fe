import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { createResearchRun, getAgent, getCompetitors, getResearchRuns, type AgentDetail, type Competitor, type ResearchRun } from '../lib/api'

const { Paragraph, Text, Title } = Typography

export default function Dashboard() {
  const [form] = Form.useForm()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = async () => {
    setIsLoading(true)
    setError('')

    try {
      const [agentResponse, competitorsResponse, runsResponse] = await Promise.all([
        getAgent('market-researcher'),
        getCompetitors(),
        getResearchRuns(),
      ])

      setAgent(agentResponse)
      setCompetitors(competitorsResponse)
      setResearchRuns(runsResponse)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load market research data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const researchSignals = competitors
    .flatMap((competitor) =>
      competitor.watchSignals.map((signal) => `${competitor.name}: ${signal}`),
    )
    .slice(0, 6)

  const handleCreateRun = async () => {
    try {
      const values = await form.validateFields()
      setIsSubmitting(true)

      await createResearchRun({
        title: values.title,
        objective: values.objective,
        scope: values.scope,
        requestedBy: values.requestedBy,
      })

      setIsModalOpen(false)
      form.resetFields()
      await load()
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Market Researcher</h1>
        <p className="page-subtitle">
          Research and synthesis for competitor tracking, demand signals, and positioning.
        </p>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to load market researcher data" description={error} /> : null}

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <Card className="section-card">
              <Statistic title="Competitors monitored" value={competitors.length} />
            </Card>
            <Card className="section-card">
              <Statistic title="Research runs" value={researchRuns.length} />
            </Card>
            <Card className="section-card">
              <Statistic title="Plugin tools" value={agent?.plugin.tools.length ?? 0} />
            </Card>
            <Card className="section-card">
              <Statistic title="Priority watchlist" value={competitors.filter((item) => item.status === 'priority').length} />
            </Card>
          </div>

          <div className="hub-grid">
            <Card className="section-card" title="Latest Signals">
              <List
                locale={{ emptyText: 'Add competitor watch signals in the backend to see live intelligence here.' }}
                dataSource={researchSignals}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Card>

            <Card className="section-card" title="Current Mission">
              <Space direction="vertical" size="middle">
                <Tag color="processing">{agent?.status ?? 'active'}</Tag>
                <Paragraph style={{ margin: 0 }}>
                  {agent?.mission || 'Gather company context, investigate the market, and return a strategic brief.'}
                </Paragraph>
                <Button type="primary" onClick={() => setIsModalOpen(true)}>
                  Launch Research Run
                </Button>
              </Space>
            </Card>
          </div>

          <Card className="section-card" title="Research Workflow">
            <List
              dataSource={agent?.workflow ?? []}
              renderItem={(item, index) => (
                <List.Item>
                  <Text>{index + 1}. {item}</Text>
                </List.Item>
              )}
            />
          </Card>

          <Card className="section-card" title="Research Workspace">
            {researchRuns.length ? (
              <List
                dataSource={researchRuns}
                renderItem={(run) => (
                  <List.Item>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space>
                        <Title level={5} style={{ margin: 0 }}>
                          {run.title}
                        </Title>
                        <Tag color={run.status === 'completed' ? 'green' : run.status === 'in_progress' ? 'processing' : 'default'}>
                          {run.status}
                        </Tag>
                      </Space>
                      <Text>{run.objective}</Text>
                      <Text type="secondary">
                        Findings: {run.findings.length} | Updated {new Date(run.updatedAt).toLocaleString()}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <p className="panel-copy">
                Launch a research run to start building run history, saved reports, and source-backed findings.
              </p>
            )}
          </Card>
        </>
      )}

      <Modal
        title="Launch research run"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleCreateRun}
        okText="Create run"
        confirmLoading={isSubmitting}
      >
        <Form form={form} layout="vertical" initialValues={{ requestedBy: 'trusted-tech' }}>
          <Form.Item label="Title" name="title" rules={[{ required: true, message: 'Enter a run title.' }]}>
            <Input placeholder="Q2 competitor positioning scan" />
          </Form.Item>
          <Form.Item label="Objective" name="objective" rules={[{ required: true, message: 'Enter the research objective.' }]}>
            <Input.TextArea rows={3} placeholder="Compare how top competitors are positioning AI-assisted delivery support." />
          </Form.Item>
          <Form.Item label="Scope" name="scope">
            <Input.TextArea rows={2} placeholder="Focus on messaging, pricing, and proof points for 5-7 competitors." />
          </Form.Item>
          <Form.Item label="Requested by" name="requestedBy">
            <Input placeholder="trusted-tech" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
