import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, List, Space, Spin, Tag, Typography, Input, message } from 'antd'
import ChatMessageContent from './ChatMessageContent'
import {
  createChatThread,
  getAgent,
  getChatThreads,
  sendAgentChat,
  updateChatThread,
  type AgentChatMessage,
  type AgentDetail,
  type ChatThread,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

const RAW_PROVIDER_ERROR = /api call failed|rate\s*limit|tokens per min|\bTPM\b|platform\.openai\.com\/account\/rate-limits/i

type AgentChatWorkspaceProps = {
  agentId: string
  title: string
  subtitle: string
  intro: string
  emptyPrompt: string
  showAgentOverview?: boolean
  showThreadControls?: boolean
  showChatIntro?: boolean
  showBackendTag?: boolean
  showInitialAssistantMessage?: boolean
  showChatWorkspace?: boolean
  chatTitle?: string
  assistantLabel?: string
  backendLabel?: string
  showRefreshButton?: boolean
  renderBeforeChat?: ReactNode
  children?: ReactNode
  renderChatTools?: (helpers: {
    setChatInput: (value: string) => void
    currentChatInput: string
  }) => ReactNode
  buildMessageContext?: () => string
  queryingLabel?: string
  suppressChatErrors?: boolean
}

export default function AgentChatWorkspace({
  agentId,
  title,
  subtitle,
  intro,
  emptyPrompt,
  showAgentOverview = true,
  showThreadControls = true,
  showChatIntro = true,
  showBackendTag = true,
  showInitialAssistantMessage = true,
  showChatWorkspace = true,
  chatTitle = 'OpenClaw Chat',
  assistantLabel = 'OpenClaw',
  backendLabel = 'OpenAI via backend',
  showRefreshButton = false,
  renderBeforeChat,
  children,
  renderChatTools,
  buildMessageContext,
  queryingLabel = 'Thinking through the request...',
  suppressChatErrors = false,
}: AgentChatWorkspaceProps) {
  const { isAuthenticated } = useAuth0()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>(
    showInitialAssistantMessage
      ? [
          {
            role: 'assistant',
            content: intro,
          },
        ]
      : [],
  )
  const [savedThreads, setSavedThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const [isSavingThread, setIsSavingThread] = useState(false)
  const [isThreadSidebarOpen, setIsThreadSidebarOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [agentResponse, threadsResponse] = await Promise.all([
          getAgent(agentId),
          isAuthenticated ? getChatThreads(agentId) : Promise.resolve([]),
        ])

        setAgent(agentResponse)
        setSavedThreads(threadsResponse)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agent workspace.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [agentId, isAuthenticated])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatting])

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
    const context = buildMessageContext?.().trim() || ''
    const messagesForBackend = context
      ? [
          ...chatMessages,
          {
            role: 'user' as const,
            content: `${context}\n\nUser request:\n${trimmedInput}`,
          },
        ]
      : nextMessages

    setChatInput('')
    setChatError('')
    setIsChatting(true)
    setChatMessages(nextMessages)

    try {
      const response = await sendAgentChat(agentId, messagesForBackend)
      setChatMessages((current) => [...current, response.message])
    } catch (submitError) {
      if (suppressChatErrors) {
        setChatMessages((current) => [...current, { role: 'assistant', content: queryingLabel }])
      } else {
        setChatError(submitError instanceof Error ? submitError.message : `${assistantLabel} could not respond right now.`)
      }
    } finally {
      setIsChatting(false)
    }
  }

  const handleRefreshAgent = async () => {
    if (isRefreshing || isChatting) return
    setIsRefreshing(true)
    setError('')
    setChatError('')
    try {
      const [agentResponse, threadsResponse] = await Promise.all([
        getAgent(agentId),
        isAuthenticated ? getChatThreads(agentId) : Promise.resolve([]),
      ])
      setAgent(agentResponse)
      setSavedThreads(threadsResponse)
      message.success(`${assistantLabel} refreshed`)
    } catch (refreshError) {
      setChatError(refreshError instanceof Error ? refreshError.message : `Failed to refresh ${assistantLabel}.`)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleNewThread = () => {
    setChatMessages(
      showInitialAssistantMessage
        ? [
            {
              role: 'assistant',
              content: intro,
            },
          ]
        : [],
    )
    setActiveThreadId(null)
    setChatError('')
    setIsThreadSidebarOpen(false)
  }

  const handleImportThread = (threadId: string) => {
    const selectedThread = savedThreads.find((thread) => thread._id === threadId)

    if (!selectedThread) {
      return
    }

    const importedMessages =
      Array.isArray(selectedThread.thread?.messages) && selectedThread.thread.messages.length
        ? selectedThread.thread.messages
        : selectedThread.messages

    setChatMessages(importedMessages)
    setActiveThreadId(selectedThread._id)
    setChatError('')
    setIsThreadSidebarOpen(false)
  }

  const buildThreadTitle = () => {
    const firstUserMessage = chatMessages.find((entry) => entry.role === 'user')?.content.trim()
    return firstUserMessage ? firstUserMessage.slice(0, 80) : `${title} Thread`
  }

  const handleSaveThread = async () => {
    if (!isAuthenticated || !chatMessages.length || isSavingThread) {
      return
    }

    setIsSavingThread(true)
    setChatError('')

    try {
      const payload = {
        agentId,
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

  return (
    <div className="page">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {error ? <Alert type="error" showIcon message={`Unable to load ${title}`} description={error} /> : null}

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {showAgentOverview ? (
            <div className="hub-grid">
              <Card className="section-card" title="Mission">
                <Space direction="vertical" size="middle">
                  <Tag color={agent?.status === 'active' ? 'green' : 'processing'}>{agent?.status ?? 'planned'}</Tag>
                  <Paragraph style={{ margin: 0 }}>
                    {agent?.mission || 'This agent is getting its workflow and chat surface ready.'}
                  </Paragraph>
                </Space>
              </Card>

              <Card className="section-card" title="Workflow">
                <List
                  locale={{ emptyText: 'Workflow steps will appear here as this agent is built out.' }}
                  dataSource={agent?.workflow ?? []}
                  renderItem={(item, index) => (
                    <List.Item>
                      <Text>{index + 1}. {item}</Text>
                    </List.Item>
                  )}
                />
              </Card>
            </div>
          ) : null}

          {renderBeforeChat}

          {showChatWorkspace ? (
            <Card
              className="section-card"
              title={chatTitle || undefined}
              extra={(showBackendTag && agent) || showRefreshButton ? (
                <Space size="small" wrap>
                  {showBackendTag && agent ? <Tag color="gold">{backendLabel}</Tag> : null}
                  {showRefreshButton ? (
                    <Button onClick={() => void handleRefreshAgent()} loading={isRefreshing} disabled={isChatting}>
                      Refresh
                    </Button>
                  ) : null}
                </Space>
              ) : null}
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {showChatIntro ? <Text type="secondary">{intro}</Text> : null}

                {chatError && !suppressChatErrors ? (
                  <Alert type="error" showIcon message={`${assistantLabel} chat is unavailable`} description={chatError} />
                ) : null}

                <div className="chat-shell">
                  {showThreadControls ? (
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
                              onClick={() => handleImportThread(thread._id)}
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
                  ) : null}

                  <div className="chat-main">
                    {showThreadControls ? (
                      <div className="chat-toolbar">
                        <Button onClick={() => setIsThreadSidebarOpen((current) => !current)}>
                          Threads
                        </Button>
                        {activeThreadId ? <Text type="secondary">Saved thread loaded</Text> : null}
                      </div>
                    ) : null}

                    {renderChatTools
                      ? renderChatTools({
                          setChatInput,
                          currentChatInput: chatInput,
                        })
                      : null}

                    <div className="chat-thread">
                      {chatMessages.map((entry, index) => (
                        <div
                          key={`${entry.role}-${index}`}
                          className={`chat-message ${entry.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
                        >
                          <div className="chat-message-label">{entry.role === 'user' ? 'You' : assistantLabel}</div>
                          <div className="chat-message-body">
                            <ChatMessageContent
                              content={
                                suppressChatErrors && entry.role === 'assistant' && RAW_PROVIDER_ERROR.test(entry.content)
                                  ? queryingLabel
                                  : entry.content
                              }
                            />
                          </div>
                        </div>
                      ))}

                      {isChatting ? (
                        <div className="chat-message chat-message-assistant">
                          <div className="chat-message-label">{assistantLabel}</div>
                          <div className="chat-message-body">
                            <p>{queryingLabel}</p>
                          </div>
                        </div>
                      ) : null}

                      <div ref={chatEndRef} />
                    </div>

                    <div className="chat-composer">
                      <TextArea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder={emptyPrompt}
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
          ) : null}

          {children}
        </>
      )}
    </div>
  )
}
