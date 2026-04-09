import { useEffect, useRef, useState } from 'react'
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
import {
  createResearchRun,
  captureBrowserResearchPage,
  getAgent,
  getCompetitors,
  getResearchRuns,
  sendAgentChat,
  type AgentChatMessage,
  type AgentDetail,
  type Competitor,
  type ResearchRun,
} from '../lib/api'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

const initialChatMessage: AgentChatMessage = {
  role: 'assistant',
  content:
    'OpenClaw is ready. Ask for competitor tracking, message analysis, or a source-grounded research brief and I will work from the Trusted Tech context loaded into the hub.',
}

export default function Dashboard() {
  const [form] = Form.useForm()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>([initialChatMessage])
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const [researchUrl, setResearchUrl] = useState('')
  const [researchObjective, setResearchObjective] = useState('')
  const [isCapturingResearch, setIsCapturingResearch] = useState(false)
  const [browserResearchError, setBrowserResearchError] = useState('')
  const chatEndRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatting])

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

  const handleSendChat = async () => {
    const trimmedInput = chatInput.trim()

    if (!trimmedInput || isChatting) {
      return
    }

    const nextUserMessage: AgentChatMessage = {
      role: 'user',
      content: trimmedInput,
    }
    const nextMessages = [...chatMessages, nextUserMessage]

    setChatInput('')
    setChatError('')
    setIsChatting(true)
    setChatMessages(nextMessages)

    try {
      const response = await sendAgentChat('market-researcher', nextMessages)
      setChatMessages((current) => [...current, response.message])
    } catch (submitError) {
      setChatError(
        submitError instanceof Error
          ? submitError.message
          : 'OpenClaw could not respond right now.',
      )
    } finally {
      setIsChatting(false)
    }
  }

  const handleCaptureResearch = async () => {
    if (!researchUrl.trim() || isCapturingResearch) {
      return
    }

    setIsCapturingResearch(true)
    setBrowserResearchError('')

    try {
      await captureBrowserResearchPage({
        url: researchUrl.trim(),
        objective: researchObjective.trim() || undefined,
      })

      setResearchUrl('')
      setResearchObjective('')
      await load()
    } catch (captureError) {
      setBrowserResearchError(
        captureError instanceof Error
          ? captureError.message
          : 'OpenClaw could not capture that page.',
      )
    } finally {
      setIsCapturingResearch(false)
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

          <Card className="section-card" title="Browser Research Capture">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Text type="secondary">
                Use your local OpenClaw browser profile to open a public page, extract its text, and save it into the hub.
              </Text>
              {browserResearchError ? (
                <Alert
                  type="error"
                  showIcon
                  message="Browser research capture failed"
                  description={browserResearchError}
                />
              ) : null}
              <Input
                value={researchUrl}
                onChange={(event) => setResearchUrl(event.target.value)}
                placeholder="https://example.com/competitor-page"
              />
              <TextArea
                value={researchObjective}
                onChange={(event) => setResearchObjective(event.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="Optional objective, for example: capture competitor pricing and product claims."
              />
              <div className="chat-composer-actions">
                <Button
                  type="primary"
                  onClick={() => void handleCaptureResearch()}
                  loading={isCapturingResearch}
                >
                  Capture With OpenClaw Browser
                </Button>
              </div>
            </Space>
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

          <Card
            className="section-card"
            title="OpenClaw Chat"
            extra={agent ? <Tag color="gold">OpenAI via backend</Tag> : null}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Text type="secondary">
                This chat uses the Market Researcher agent context and keeps your OpenAI API key on the backend.
              </Text>

              {chatError ? (
                <Alert
                  type="error"
                  showIcon
                  message="OpenClaw chat is unavailable"
                  description={chatError}
                />
              ) : null}

              <div className="chat-thread">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`chat-message ${message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
                  >
                    <div className="chat-message-label">
                      {message.role === 'user' ? 'You' : 'OpenClaw'}
                    </div>
                    <div className="chat-message-body">
                      {message.content.split('\n').map((line, lineIndex) => (
                        <p key={lineIndex}>{line || '\u00A0'}</p>
                      ))}
                    </div>
                  </div>
                ))}

                {isChatting ? (
                  <div className="chat-message chat-message-assistant">
                    <div className="chat-message-label">OpenClaw</div>
                    <div className="chat-message-body">
                      <p>Thinking through the request...</p>
                    </div>
                  </div>
                ) : null}

                <div ref={chatEndRef} />
              </div>

              <div className="chat-composer">
                <TextArea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask OpenClaw to research a competitor, summarize a signal, or draft a strategic brief."
                  autoSize={{ minRows: 3, maxRows: 7 }}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault()
                      void handleSendChat()
                    }
                  }}
                />
                <div className="chat-composer-actions">
                  <Button onClick={() => setChatMessages([initialChatMessage])} disabled={isChatting}>
                    Reset thread
                  </Button>
                  <Button type="primary" onClick={() => void handleSendChat()} loading={isChatting}>
                    Send
                  </Button>
                </div>
              </div>
            </Space>
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
