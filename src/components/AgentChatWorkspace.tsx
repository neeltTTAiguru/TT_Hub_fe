import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, List, Space, Spin, Tag, Typography, Input, message, Modal, Select } from 'antd'
import ChatMessageContent from './ChatMessageContent'
import {
  createChatThread,
  getAgent,
  getAgents,
  getChatThreads,
  sendAgentChat,
  saveBrainMemory,
  updateChatThread,
  type AgentChatMessage,
  type AgentDetail,
  type AgentChatResponse,
  type BrainMemoryProposal,
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
  enableBrainMemorySave?: boolean
  chatSidePanel?: ReactNode
  onChatResponse?: (response: AgentChatResponse) => void
}

const COMPANY_SECTION = 'company'
const COMPANY_SECTION_LABEL = 'Trusted Tech Company'

// Only agents actually offered in the product get a brain section. The agent
// catalog returns planned/internal agents too (WordPress test, Market Researcher,
// grant/RFP/social surfers), which must not appear as save targets.
const OFFERED_AGENT_IDS = new Set([
  'trusted-tech-assistant',
  'competitor-analyst',
  'trusted-tech-hubspot-assistant',
  'trusted-tech-youtrack-assistant',
  'content-operations-assistant',
])

const EMPTY_MEMORY_PROPOSAL: BrainMemoryProposal = {
  title: '',
  content: '',
  section: COMPANY_SECTION,
  sensitivity: 'internal',
  source: '',
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
  chatTitle = 'Hermes Chat',
  assistantLabel = 'Hermes',
  backendLabel = 'OpenAI via backend',
  showRefreshButton = false,
  renderBeforeChat,
  children,
  renderChatTools,
  buildMessageContext,
  queryingLabel = 'Thinking through the request...',
  suppressChatErrors = false,
  enableBrainMemorySave = false,
  chatSidePanel,
  onChatResponse,
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
  const [memoryModalOpen, setMemoryModalOpen] = useState(false)
  const [memoryReviewing, setMemoryReviewing] = useState(false)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [memoryProposal, setMemoryProposal] = useState<BrainMemoryProposal>(EMPTY_MEMORY_PROPOSAL)
  const [sectionOptions, setSectionOptions] = useState<Array<{ value: string; label: string }>>([
    { value: COMPANY_SECTION, label: COMPANY_SECTION_LABEL },
  ])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [agentResponse, threadsResponse, agentsResponse] = await Promise.all([
          getAgent(agentId),
          isAuthenticated ? getChatThreads(agentId) : Promise.resolve([]),
          enableBrainMemorySave ? getAgents() : Promise.resolve([]),
        ])

        setAgent(agentResponse)
        setSavedThreads(threadsResponse)
        if (enableBrainMemorySave) {
          // Section picker: "Trusted Tech Company" (all agents) plus one entry per
          // agent, so a memory can be scoped to exactly the agent that will use it.
          setSectionOptions([
            { value: COMPANY_SECTION, label: COMPANY_SECTION_LABEL },
            ...agentsResponse
              .filter((entry) => OFFERED_AGENT_IDS.has(entry.id))
              .map((entry) => ({ value: entry.id, label: entry.name })),
          ])
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agent workspace.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [agentId, isAuthenticated, enableBrainMemorySave])

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
      onChatResponse?.(response)
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

  const openMemoryProposal = () => {
    const latestUserMessage = [...chatMessages].reverse().find((entry) => entry.role === 'user')?.content || ''
    setMemoryProposal({ ...EMPTY_MEMORY_PROPOSAL, content: latestUserMessage })
    setMemoryReviewing(false)
    setMemoryModalOpen(true)
  }

  const closeMemoryProposal = () => {
    if (isSavingMemory) return
    setMemoryModalOpen(false)
    setMemoryReviewing(false)
  }

  const reviewMemoryProposal = () => {
    if (memoryProposal.title.trim().length < 3) {
      message.error('Add a short, descriptive memory title.')
      return
    }
    if (memoryProposal.content.trim().length < 10) {
      message.error('Memory content must contain at least 10 characters.')
      return
    }
    setMemoryReviewing(true)
  }

  const confirmMemorySave = async () => {
    setIsSavingMemory(true)
    try {
      const saved = await saveBrainMemory({
        ...memoryProposal,
        title: memoryProposal.title.trim(),
        content: memoryProposal.content.trim(),
        source: memoryProposal.source?.trim(),
      })
      setMemoryModalOpen(false)
      setMemoryReviewing(false)
      message.success(`Saved and verified in GBrain: ${saved.title}`)
      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `Saved to GBrain and verified.\n\n- Memory: ${saved.title}\n- ID: \`${saved.slug}\`\n- Section: ${sectionOptions.find((option) => option.value === saved.section)?.label ?? saved.section}\n- Sensitivity: ${saved.sensitivity}`,
        },
      ])
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : 'GBrain could not save this memory.')
    } finally {
      setIsSavingMemory(false)
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
              extra={(showBackendTag && agent) || showRefreshButton || enableBrainMemorySave ? (
                <Space size="small" wrap>
                  {showBackendTag && agent ? <Tag color="gold">{backendLabel}</Tag> : null}
                  {enableBrainMemorySave ? (
                    <Button onClick={openMemoryProposal} disabled={isChatting || !isAuthenticated}>
                      Save to Brain
                    </Button>
                  ) : null}
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

                  <div className={chatSidePanel ? 'chat-workspace-grid' : undefined}>
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
                    {chatSidePanel}
                  </div>
                </div>
              </Space>
            </Card>
          ) : null}

          {children}

          {enableBrainMemorySave ? (
            <Modal
              title={memoryReviewing ? 'Confirm memory' : 'Propose a memory'}
              open={memoryModalOpen}
              onCancel={closeMemoryProposal}
              closable={!isSavingMemory}
              maskClosable={!isSavingMemory}
              footer={memoryReviewing ? [
                <Button key="back" onClick={() => setMemoryReviewing(false)} disabled={isSavingMemory}>Back</Button>,
                <Button key="confirm" type="primary" danger loading={isSavingMemory} onClick={() => void confirmMemorySave()}>
                  Confirm and save to GBrain
                </Button>,
              ] : [
                <Button key="cancel" onClick={closeMemoryProposal}>Cancel</Button>,
                <Button key="review" type="primary" onClick={reviewMemoryProposal}>Review memory</Button>,
              ]}
            >
              {memoryReviewing ? (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    type="warning"
                    showIcon
                    message="This is a separate action from saving a chat thread."
                    description="Confirming will write this approved knowledge to GBrain. Conversations are never stored there automatically."
                  />
                  <div><Text type="secondary">Title</Text><Paragraph strong>{memoryProposal.title}</Paragraph></div>
                  <div><Text type="secondary">Memory</Text><Paragraph>{memoryProposal.content}</Paragraph></div>
                  <Space wrap>
                    <Tag color="gold">{sectionOptions.find((option) => option.value === memoryProposal.section)?.label ?? memoryProposal.section}</Tag>
                    <Tag color={memoryProposal.sensitivity === 'public' ? 'green' : 'blue'}>{memoryProposal.sensitivity}</Tag>
                  </Space>
                  {memoryProposal.source ? <div><Text type="secondary">Source</Text><Paragraph>{memoryProposal.source}</Paragraph></div> : null}
                </Space>
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Nothing is saved until you review and confirm."
                    description="Do not include passwords, API keys, tokens, or unnecessary personal information."
                  />
                  <div style={{ width: '100%' }}>
                    <Text strong>Title</Text>
                    <Input
                      value={memoryProposal.title}
                      maxLength={160}
                      placeholder="Example: Preferred content audience"
                      onChange={(event) => setMemoryProposal((current) => ({ ...current, title: event.target.value }))}
                    />
                  </div>
                  <div style={{ width: '100%' }}>
                    <Text strong>What should Brain remember?</Text>
                    <TextArea
                      value={memoryProposal.content}
                      maxLength={8000}
                      autoSize={{ minRows: 5, maxRows: 10 }}
                      onChange={(event) => setMemoryProposal((current) => ({ ...current, content: event.target.value }))}
                    />
                  </div>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text strong>Save to which part of the brain?</Text>
                    <Space wrap>
                      <Select
                        value={memoryProposal.section}
                        style={{ width: 260 }}
                        // "Trusted Tech Company" = readable by every agent. Any other choice
                        // scopes the memory to just that agent (the section that will use it).
                        options={sectionOptions}
                        onChange={(section) => setMemoryProposal((current) => ({ ...current, section }))}
                      />
                      <Select
                        value={memoryProposal.sensitivity}
                        style={{ width: 170 }}
                        options={[
                          { value: 'internal', label: 'Internal' },
                          { value: 'public', label: 'Public' },
                        ]}
                        onChange={(sensitivity) => setMemoryProposal((current) => ({ ...current, sensitivity }))}
                      />
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {memoryProposal.section === COMPANY_SECTION
                        ? 'Every agent can read this.'
                        : `Only ${sectionOptions.find((option) => option.value === memoryProposal.section)?.label ?? 'the selected agent'} will read this.`}
                    </Text>
                  </Space>
                  <div style={{ width: '100%' }}>
                    <Text strong>Source or reference (optional)</Text>
                    <Input
                      value={memoryProposal.source}
                      maxLength={500}
                      placeholder="Document, URL, meeting, or decision reference"
                      onChange={(event) => setMemoryProposal((current) => ({ ...current, source: event.target.value }))}
                    />
                  </div>
                </Space>
              )}
            </Modal>
          ) : null}
        </>
      )}
    </div>
  )
}
