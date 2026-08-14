import { useEffect, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, Form, Input, message, Modal, Space, Spin, Tag, Typography } from 'antd'
import ChatMessageContent from '../components/ChatMessageContent'
import {
  createChatThread,
  createResearchRun,
  captureBrowserResearchPage,
  getAgent,
  getChatThread,
  getChatThreads,
  sendAgentChat,
  updateChatThread,
  type AgentChatMessage,
  type AgentDetail,
  type ChatThreadSummary,
} from '../lib/api'

const { Text } = Typography
const { TextArea } = Input

const initialChatMessage: AgentChatMessage = {
  role: 'assistant',
  content:
    'OpenClaw is ready. Ask for competitor tracking, message analysis, or a source-grounded research brief and I will work from the Trusted Tech context loaded into the hub.',
}

export default function Dashboard() {
  const { isAuthenticated } = useAuth0()
  const [form] = Form.useForm()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>([initialChatMessage])
  const [savedThreads, setSavedThreads] = useState<ChatThreadSummary[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const [isSavingThread, setIsSavingThread] = useState(false)
  const [isThreadSidebarOpen, setIsThreadSidebarOpen] = useState(false)
  const [researchUrl, setResearchUrl] = useState('')
  const [researchObjective, setResearchObjective] = useState('')
  const [isCapturingResearch, setIsCapturingResearch] = useState(false)
  const [browserResearchError, setBrowserResearchError] = useState('')
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const load = async () => {
    setIsLoading(true)
    setError('')

      try {
        const [agentResponse, threadsResponse] = await Promise.all([
          getAgent('market-researcher'),
          isAuthenticated ? getChatThreads('market-researcher') : Promise.resolve([]),
        ])

      setAgent(agentResponse)
      setSavedThreads(threadsResponse)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load market research data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [isAuthenticated])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatting])

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

  const buildThreadTitle = () => {
    const firstUserMessage = chatMessages.find((entry) => entry.role === 'user')?.content.trim()

    if (!firstUserMessage) {
      return 'Market Research Thread'
    }

    return firstUserMessage.slice(0, 80)
  }

  const handleSaveThread = async () => {
    if (!isAuthenticated || !chatMessages.length || isSavingThread) {
      return
    }

    setIsSavingThread(true)
    setChatError('')

    try {
      const payload = {
        agentId: 'market-researcher',
        title: buildThreadTitle(),
        messages: chatMessages,
        thread: {
          messages: chatMessages,
        },
      }
      const savedThread = activeThreadId
        ? await updateChatThread(activeThreadId, payload)
        : await createChatThread(payload)

      setSavedThreads((current) => {
        const next = current.filter((thread) => thread._id !== savedThread._id)
        return [savedThread, ...next]
      })
      setActiveThreadId(savedThread._id)
      message.success('Thread saved to Trusted Tech Hub')
    } catch (saveError) {
      setChatError(saveError instanceof Error ? saveError.message : 'Failed to save thread.')
    } finally {
      setIsSavingThread(false)
    }
  }

  const handleImportThread = async (threadId: string) => {
    // The list is metadata-only; fetch the full thread (with messages) on open.
    try {
      const full = await getChatThread(threadId)
      const importedMessages =
        Array.isArray(full.thread?.messages) && full.thread.messages.length
          ? full.thread.messages
          : full.messages

      setChatMessages(importedMessages)
      setActiveThreadId(full._id)
      setChatError('')
      setIsThreadSidebarOpen(false)
    } catch {
      setChatError('Could not open that saved thread.')
    }
  }

  const handleNewThread = () => {
    setChatMessages([initialChatMessage])
    setActiveThreadId(null)
    setChatError('')
    setIsThreadSidebarOpen(false)
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

              <div className="chat-shell">
                <aside className={`chat-sidebar ${isThreadSidebarOpen ? 'chat-sidebar-open' : ''}`}>
                  <div className="chat-sidebar-header">
                    <Text strong>Threads</Text>
                    <Button type="text" onClick={() => setIsThreadSidebarOpen(false)}>
                      Close
                    </Button>
                  </div>
                  <Button onClick={handleNewThread} disabled={isChatting}>
                    New thread
                  </Button>
                  <Button onClick={handleSaveThread} loading={isSavingThread} disabled={isChatting || !isAuthenticated}>
                    Save thread
                  </Button>
                  <div className="chat-thread-list">
                    {savedThreads.length ? (
                      savedThreads.map((thread) => (
                        <button
                          key={thread._id}
                          type="button"
                          className={`chat-thread-item ${activeThreadId === thread._id ? 'chat-thread-item-active' : ''}`}
                          onClick={() => void handleImportThread(thread._id)}
                          disabled={isChatting}
                        >
                          <strong>{thread.title}</strong>
                          <span>{new Date(thread.updatedAt).toLocaleString()}</span>
                        </button>
                      ))
                    ) : (
                      <Text type="secondary">No saved threads yet.</Text>
                    )}
                  </div>
                </aside>

                <div className="chat-main">
                  <div className="chat-toolbar">
                    <Button onClick={() => setIsThreadSidebarOpen((current) => !current)}>
                      Threads
                    </Button>
                    {activeThreadId ? <Text type="secondary">Saved thread loaded</Text> : null}
                  </div>

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
                          <ChatMessageContent content={message.content} />
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
                      <Button type="primary" onClick={() => void handleSendChat()} loading={isChatting}>
                        Send
                      </Button>
                    </div>
                  </div>
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
