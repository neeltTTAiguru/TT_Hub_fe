import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, Dropdown, List, Radio, Space, Spin, Tag, Typography, Input, message, Modal, Select } from 'antd'
import ChatMessageContent from './ChatMessageContent'
import trustedTechAgentLogo from '../assets/agent-logos/trusted-tech-agent.svg'
import {
  createChatThread,
  deleteChatThread,
  getAgent,
  getAgents,
  getChatThread,
  getChatThreads,
  sendAgentChat,
  streamAgentChat,
  saveBrainMemory,
  updateChatThread,
  type AgentChatMessage,
  type AgentDetail,
  type AgentChatResponse,
  type BrainMemoryProposal,
  type BrainSectionMemory,
  type ChatAttachment,
  type ChatThreadSummary,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

// A file dragged in from Finder or another app often arrives with an empty or
// generic MIME type. The backend routes images to vision by MIME, so a photo
// that lands as `application/octet-stream` is silently treated as an unreadable
// document — recover the type from the extension instead.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
}

function resolveMimeType(file: File) {
  const declared = String(file.type || '')
  if (declared && declared !== 'application/octet-stream') return declared
  const extension = (file.name.split('.').pop() || '').toLowerCase()
  return EXTENSION_MIME_TYPES[extension] || declared || 'application/octet-stream'
}

// Camera photos run 5-25MB, which trips the size guard here and bloats the
// request past the API body limit on the way out. A vision model reads a
// 1600px JPEG just as well, so shrink the big ones and leave small ones alone.
const IMAGE_MAX_EDGE = 1600
const IMAGE_COMPRESS_OVER_BYTES = 1.5 * 1024 * 1024

async function downscaleImage(file: File, mimeType: string): Promise<string | null> {
  if (!/^image\//i.test(mimeType)) return null
  // GIFs would lose their animation and SVGs are already tiny text.
  if (/^image\/(gif|svg)/i.test(mimeType)) return null
  // HEIC always goes through re-encoding: no vision model accepts it, so a
  // browser that can decode it (Safari) is our only chance to send it as JPEG.
  const isHeic = /^image\/(heic|heif)/i.test(mimeType)
  if (!isHeic && file.size <= IMAGE_COMPRESS_OVER_BYTES) return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    // Formats this browser cannot decode (often HEIC) — send the original and
    // let the backend report it rather than dropping it here.
    return null
  }
}

// The user bubble used to read "You You" (avatar chip + label). Use the signed-in
// person's name, falling back to a readable form of their email.
function displayNameForUser(user?: { given_name?: string; name?: string; nickname?: string; email?: string }) {
  const named = [user?.given_name, user?.name, user?.nickname].find(
    (value) => typeof value === 'string' && value.trim() && !value.includes('@'),
  )
  if (named) return named.trim()
  const email = String(user?.email || (user?.name?.includes('@') ? user.name : '') || '')
  const local = email.split('@')[0]
  if (!local) return 'You'
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const RAW_PROVIDER_ERROR = /api call failed|rate\s*limit|tokens per min|\bTPM\b|platform\.openai\.com\/account\/rate-limits/i

function QueryingIndicator({ label, logo }: { label: string; logo: string }) {
  const phases = [label, 'Thinking…', 'Working…', 'Writing…']
  const [phaseIndex, setPhaseIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % phases.length)
    }, 1600)
    return () => clearInterval(id)
  }, [phases.length])
  return (
    <span className="agent-querying">
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className="agent-querying-logo"
      />
      <span className="agent-querying-text">{phases[phaseIndex]}</span>
    </span>
  )
}

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
  // Logo shown on the assistant's messages and in the thinking indicator.
  // Defaults to the generic Trusted Tech agent mark.
  agentLogo?: string
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
  // Stream the assistant reply token-by-token over SSE (keeps the connection warm
  // for long tool-heavy answers instead of one blocking request that can time out).
  streaming?: boolean
  enableBrainMemorySave?: boolean
  // When set, "Save to Brain" saves into exactly this section (the one the user
  // is talking to) and the in-modal section picker is hidden.
  memorySection?: string
  // The current section's existing memories — enables "update an existing memory"
  // in the Save to Brain modal (replace in place instead of adding a duplicate).
  sectionMemories?: BrainSectionMemory[]
  // Called after a memory is saved/updated so the caller can refresh its section list.
  onMemorySaved?: () => void
  chatSidePanel?: ReactNode
  // Which side the panel sits on. 'left' puts it ahead of the conversation,
  // which is what a draft-and-chat split wants.
  chatSidePanelPosition?: 'left' | 'right'
  // Persistent left rail listing saved threads, instead of the header dropdown.
  threadRail?: boolean
  threadRailTitle?: string
  threadRailNewLabel?: string
  threadRailEmptyText?: string
  // The page's <h1>/subtitle block above the chat.
  showPageHeader?: boolean
  // The header's tag / New chat / Saved chats cluster. Off when the rail owns them.
  showHeaderControls?: boolean
  // Fill the viewport: the conversation takes all remaining height and the
  // composer stays pinned to the bottom, instead of the thread collapsing and
  // leaving the input floating in an empty card.
  fullHeight?: boolean
  onChatResponse?: (response: AgentChatResponse) => void
  // The assistant's final text, resolved. Streaming may end without a `message`
  // event (the accumulated text is the answer), so onChatResponse alone is not a
  // reliable way to see what was said.
  onAssistantMessage?: (content: string) => void
  // Fires on every streamed token with the text so far, so a side panel can open
  // while the answer is still arriving instead of only once it lands.
  onAssistantDelta?: (content: string) => void
  // Fires when the thread holds no assistant turn at all — a new chat, or the
  // active one deleted. A side panel showing the last answer must clear.
  onThreadReset?: () => void
  // Deliberate: the user asked for a new article, or deleted the one they were
  // reading. Distinct from onThreadReset, which also fires whenever a phase
  // simply has no assistant turn in its own thread.
  onNewThread?: () => void
  // Fired the moment a turn is sent, before any token arrives. The gap between
  // sending and the first token is memory and knowledge retrieval, which is
  // otherwise invisible.
  onTurnStart?: () => void
  // Fired whenever the chat starts or stops working. onTurnStart only marks the
  // beginning, so a host that wants to show progress of its own had no way to
  // learn the turn had ended.
  onBusyChange?: (busy: boolean) => void
  // Lets a side panel write into the conversation — a background job reporting
  // what it did belongs in the thread, not only in a toolbar tag.
  registerChatApi?: (api: {
    appendAssistantMessage: (content: string) => void
    sendMessage: (content: string) => void
  }) => void
  // Icon controls stacked under the thread-rail toggle, top right of the chat.
  railTools?: ReactNode
  // Suppress an assistant message in the thread — for a host that is already
  // showing that exact text somewhere better, e.g. in a side panel.
  hideAssistantMessage?: (content: string) => boolean
  // Rewrites what an assistant message SHOWS without touching what is stored.
  // The article workspace uses it to lift the article out of the reply and into
  // the panel, leaving the writer's actual remarks in the conversation. A
  // message left empty by the rewrite is dropped.
  transformAssistantMessage?: (content: string) => string
  // Storage key for autosaving the in-progress conversation to the browser so a
  // refresh/freeze doesn't lose it. Defaults to the agentId; pass a more specific
  // key (e.g. per competitor) to keep separate drafts.
  draftKey?: string
  // Optional sub-scope within an agent's saved chats. The Competitor Analyst
  // reuses one agentId across every competitor, so it passes the competitor slug
  // here to keep each section's server-persisted threads isolated (otherwise
  // every competitor's chats share one bucket and surface under the default).
  competitor?: string
}

const DRAFT_PREFIX = 'tt-chat-draft:'

function loadChatDraft(key: string): AgentChatMessage[] | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AgentChatMessage[]) : null
  } catch {
    return null
  }
}

function saveChatDraft(key: string, messages: AgentChatMessage[]) {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(messages))
  } catch {
    // Ignore quota / disabled-storage errors — autosave is best-effort.
  }
}

function clearChatDraft(key: string) {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${key}`)
  } catch {
    // no-op
  }
}

// The "last chat" snapshot is the most recent real conversation for an agent.
// Unlike the draft, it is NOT cleared when you start a new thread, so it can
// always be recalled with the "Resume last chat" button.
const LAST_CHAT_PREFIX = 'tt-chat-last:'

function loadLastChat(key: string): AgentChatMessage[] | null {
  try {
    const raw = localStorage.getItem(`${LAST_CHAT_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.some((entry) => entry?.role === 'user')
      ? (parsed as AgentChatMessage[])
      : null
  } catch {
    return null
  }
}

function saveLastChat(key: string, messages: AgentChatMessage[]) {
  try {
    localStorage.setItem(`${LAST_CHAT_PREFIX}${key}`, JSON.stringify(messages))
  } catch {
    // best-effort
  }
}

// Remembers which saved session the restored draft belongs to, so continuing a
// conversation after a refresh UPDATES that session instead of creating a
// duplicate.
const THREAD_ID_PREFIX = 'tt-chat-thread:'

function loadDraftThreadId(key: string): string | null {
  try {
    return localStorage.getItem(`${THREAD_ID_PREFIX}${key}`) || null
  } catch {
    return null
  }
}

function saveDraftThreadId(key: string, threadId: string) {
  try {
    localStorage.setItem(`${THREAD_ID_PREFIX}${key}`, threadId)
  } catch {
    // best-effort
  }
}

function clearDraftThreadId(key: string) {
  try {
    localStorage.removeItem(`${THREAD_ID_PREFIX}${key}`)
  } catch {
    // no-op
  }
}

// In-flight chat requests, keyed by draft/section key, kept at MODULE scope so a
// request survives navigating away from (and back to) the chat. If you leave a
// section mid-query the component unmounts, but the request keeps running here,
// persists its answer to the browser draft the moment it lands, and any chat that
// mounts for the same key re-attaches to it (see the reconnect effect below).
type ChatRunResult = { finalMessages: AgentChatMessage[]; response: AgentChatResponse }
const inflightChats = new Map<string, Promise<ChatRunResult>>()

// Wraps a message's HTML in a clean, branded document layout for PDF/Word export
// so downloads read like a real document, not a screenshot of the chat bubble.
function buildDocumentHtml(bodyHtml: string, title: string, logo?: string) {
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const brand = logo
    ? `<img class="tt-doc-logo" src="${logo}" alt="Trusted Technology" />`
    : `<div class="tt-doc-brand">Trusted Technology</div>`
  return `
  <style>
    .tt-doc { font-family: 'Helvetica Neue', Arial, sans-serif; color:#1f2933; background:#ffffff; line-height:1.55; font-size:12.5px; }
    .tt-doc * { box-sizing:border-box; }
    .tt-doc .tt-doc-header { border-bottom:3px solid #6b6a4b; padding-bottom:10px; margin-bottom:20px; }
    .tt-doc .tt-doc-logo { height:44px; width:auto; display:block; margin-bottom:8px; }
    .tt-doc .tt-doc-brand { font-size:15px; font-weight:700; letter-spacing:.05em; color:#4a4a35; text-transform:uppercase; }
    .tt-doc .tt-doc-meta { font-size:11px; color:#7b8794; margin-top:3px; }
    .tt-doc h1 { font-size:21px; margin:18px 0 8px; color:#1f2933; page-break-after:avoid; }
    .tt-doc h2 { font-size:16px; margin:18px 0 6px; color:#243b53; border-bottom:1px solid #e4e7eb; padding-bottom:4px; page-break-after:avoid; }
    .tt-doc h3 { font-size:13.5px; margin:14px 0 4px; color:#334e68; page-break-after:avoid; }
    .tt-doc p { margin:0 0 10px; }
    .tt-doc ul, .tt-doc ol { margin:0 0 10px; padding-left:22px; }
    .tt-doc li { margin:3px 0; page-break-inside:avoid; }
    .tt-doc a { color:#3b6bb8; text-decoration:none; }
    .tt-doc code { font-family:'SFMono-Regular',Consolas,monospace; background:#f3f4f6; padding:1px 4px; border-radius:3px; font-size:11.5px; }
    .tt-doc pre { background:#f3f4f6; padding:10px 12px; border-radius:6px; overflow:auto; font-size:11px; page-break-inside:avoid; }
    .tt-doc table { width:100%; border-collapse:collapse; margin:10px 0 16px; font-size:11.5px; }
    .tt-doc th, .tt-doc td { border:1px solid #cbd2d9; padding:6px 9px; text-align:left; vertical-align:top; }
    .tt-doc th { background:#f0f1e8; font-weight:700; color:#3e3e2d; }
    .tt-doc tr { page-break-inside:avoid; }
    .tt-doc tr:nth-child(even) td { background:#fafbf7; }
    .tt-doc strong { color:#1f2933; }
    .tt-doc blockquote { margin:10px 0; padding:6px 14px; border-left:3px solid #cbd2d9; color:#52606d; }
  </style>
  <div class="tt-doc">
    <div class="tt-doc-header">
      ${brand}
      <div class="tt-doc-meta">${title} — ${date}</div>
    </div>
    <div class="tt-doc-body">${bodyHtml}</div>
  </div>`
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
  agentLogo = trustedTechAgentLogo,
  backendLabel = 'OpenAI via backend',
  showRefreshButton = false,
  renderBeforeChat,
  children,
  renderChatTools,
  buildMessageContext,
  queryingLabel = 'Thinking through the request...',
  suppressChatErrors = false,
  streaming = false,
  enableBrainMemorySave = false,
  memorySection,
  sectionMemories,
  onMemorySaved,
  chatSidePanel,
  chatSidePanelPosition = 'right',
  threadRail = false,
  threadRailTitle = 'Chats',
  threadRailNewLabel = 'New chat',
  threadRailEmptyText = 'Nothing saved yet.',
  showPageHeader = true,
  showHeaderControls = true,
  fullHeight = false,
  onChatResponse,
  onAssistantMessage,
  onAssistantDelta,
  onThreadReset,
  onNewThread,
  onTurnStart,
  onBusyChange,
  registerChatApi,
  railTools,
  hideAssistantMessage,
  transformAssistantMessage,
  draftKey,
  competitor,
}: AgentChatWorkspaceProps) {
  const { isAuthenticated, user: authUser } = useAuth0()
  const userDisplayName = displayNameForUser(authUser)
  const draftStorageKey = draftKey ?? agentId
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>(() => {
    // Restore an autosaved in-progress conversation (survives refresh / freeze).
    const draft = loadChatDraft(draftStorageKey)
    if (draft && draft.some((entry) => entry.role === 'user')) return draft
    return showInitialAssistantMessage ? [{ role: 'assistant', content: intro }] : []
  })
  const [hasLastChat, setHasLastChat] = useState(() => Boolean(loadLastChat(draftStorageKey)))
  const [savedThreads, setSavedThreads] = useState<ChatThreadSummary[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    // Reconnect a restored draft to its saved session so continuing it updates
    // that session rather than creating a duplicate.
    const draft = loadChatDraft(draftStorageKey)
    return draft && draft.some((entry) => entry.role === 'user') ? loadDraftThreadId(draftStorageKey) : null
  })
  // Mirror of activeThreadId readable synchronously inside async auto-save.
  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  // Prevents a second create while the first is still in flight (dup guard).
  const creatingThreadRef = useRef(false)
  const [chatInput, setChatInput] = useState('')
  const [attachments, setAttachments] = useState<(ChatAttachment & { id: string })[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  // Drag events fire per child element, so a bare boolean flickers as the
  // pointer crosses the thread. Count enters/leaves and clear at zero.
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // DOM node of each rendered message body, so we can export one to PDF/Word.
  const messageRefs = useRef(new Map<number, HTMLDivElement>())
  const [chatError, setChatError] = useState('')
  const [isChatting, setIsChatting] = useState(false)

  // Mirror the in-flight flag out to the host. Effect rather than a call inside
  // the send path so it also fires on failure and abort, which return through
  // different branches.
  useEffect(() => {
    onBusyChange?.(isChatting)
  }, [isChatting, onBusyChange])
  // True once the streamed reply has started arriving, so the separate "thinking"
  // indicator is hidden while the answer itself is growing.
  const [streamingActive, setStreamingActive] = useState(false)
  // Held so a stalled stream can be cancelled — the SSE path has no timeout by
  // design, which without this leaves a hung request spinning forever.
  const chatAbortRef = useRef<AbortController | null>(null)
  const assistantMessageRef = useRef(onAssistantMessage)
  assistantMessageRef.current = onAssistantMessage
  const threadResetRef = useRef(onThreadReset)
  threadResetRef.current = onThreadReset

  // Registered once, so anything it calls must be reached through a ref.
  // appendAssistantMessage is safe because it only uses the setState updater
  // form; sendMessage is not — it reads chatInput, chatMessages and isChatting,
  // and a once-registered closure would send against the state as it was at
  // mount. The ref is reassigned every render and always points at the live one.
  useEffect(() => {
    registerChatApi?.({
      appendAssistantMessage: (content: string) => {
        const text = String(content || '').trim()
        if (!text) return
        setChatMessages((current) => [...current, { role: 'assistant', content: text }])
      },
      sendMessage: (content: string) => {
        const text = String(content || '').trim()
        if (text) void sendChatRef.current(text)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const sendChatRef = useRef<(text?: string) => Promise<void>>(async () => {})
  const [isSavingThread, setIsSavingThread] = useState(false)
  const [isThreadSidebarOpen, setIsThreadSidebarOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [memoryModalOpen, setMemoryModalOpen] = useState(false)
  const [memoryReviewing, setMemoryReviewing] = useState(false)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [memoryProposal, setMemoryProposal] = useState<BrainMemoryProposal>(EMPTY_MEMORY_PROPOSAL)
  // 'new' = write a fresh page; 'update' = overwrite an existing memory in place.
  const [memoryMode, setMemoryMode] = useState<'new' | 'update'>('new')
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
          isAuthenticated ? getChatThreads(agentId, competitor) : Promise.resolve([]),
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
  }, [agentId, competitor, isAuthenticated, enableBrainMemorySave])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatting])

  // Autosave the working conversation so a refresh or freeze doesn't lose it.
  // Only persist once there's real user content; an intro-only view clears the
  // draft. The "last chat" snapshot is also updated but never cleared here, so a
  // new thread doesn't erase the ability to recall the previous conversation.
  useEffect(() => {
    if (chatMessages.some((entry) => entry.role === 'user')) {
      saveChatDraft(draftStorageKey, chatMessages)
      saveLastChat(draftStorageKey, chatMessages)
      setHasLastChat(true)
    } else {
      clearChatDraft(draftStorageKey)
    }
  }, [chatMessages, draftStorageKey])

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
    if (activeThreadId) {
      saveDraftThreadId(draftStorageKey, activeThreadId)
    } else {
      clearDraftThreadId(draftStorageKey)
    }
  }, [activeThreadId, draftStorageKey])

  // Re-attach to an in-flight request for this section if one is still running
  // (e.g. you left HubSpot mid-query and came back): resume the "Querying…" state
  // and land the answer here when it completes, instead of losing it with the old
  // view. If it already finished while away, the answer is in the restored draft.
  useEffect(() => {
    const run = inflightChats.get(draftStorageKey)
    if (!run) return
    let cancelled = false
    setIsChatting(true)
    run.then(
      (settled) => {
        if (cancelled) return
        // Restore the VIEW only — the sending instance (even if unmounted) already
        // persisted the thread and fired onChatResponse, so we don't repeat those.
        setChatMessages(settled.finalMessages)
        setHasLastChat(true)
        setIsChatting(false)
        // Pick up the thread id the sending view saved so the next message here
        // continues the same session instead of forking a duplicate.
        const threadId = loadDraftThreadId(draftStorageKey)
        if (threadId) {
          activeThreadIdRef.current = threadId
          setActiveThreadId(threadId)
        }
      },
      (error) => {
        if (cancelled) return
        setIsChatting(false)
        if (!suppressChatErrors) {
          setChatError(error instanceof Error ? error.message : `${assistantLabel} could not respond right now.`)
        }
      },
    )
    return () => {
      cancelled = true
    }
    // Only re-attach on mount / when the section key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey])

  // A side panel has to reflect the conversation as it stands, not just what
  // arrived while the tab was watching. Restoring the autosaved draft, opening a
  // saved thread, or reloading all repopulate chatMessages without a turn ever
  // running, and the panel would otherwise sit empty beside a visible answer.
  useEffect(() => {
    const emit = assistantMessageRef.current
    if (!emit) return
    // Never during a live turn. Streaming calls setChatMessages on every token,
    // so this effect would re-run per token and replay the whole thread — which
    // reports each partial as a completed answer. The host then flips its state
    // hundreds of times a second: progress off, on, off. The send path already
    // reports deltas and completion; this exists for restores alone.
    if (isChatting) return
    // Every assistant turn, oldest first — not just the newest. The host decides
    // what it cares about, and replaying in order leaves it holding the most
    // recent match. Reading only the last message meant a thread ending in a
    // short conversational reply restored nothing at all.
    let seen = false
    for (const entry of chatMessages) {
      if (entry.role !== 'assistant') continue
      if (typeof entry.content === 'string' && entry.content.trim()) {
        emit(entry.content)
        seen = true
      }
    }
    if (!seen) threadResetRef.current?.()
  }, [chatMessages, isChatting])

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteChatThread(threadId)
      setSavedThreads((current) => current.filter((thread) => thread._id !== threadId))
      if (activeThreadIdRef.current === threadId) {
        activeThreadIdRef.current = null
        setActiveThreadId(null)
        // Deleting the thread you are reading clears the workspace with it —
        // otherwise the conversation, and anything a side panel is showing from
        // it, outlives the article it belonged to.
        onNewThread?.()
        setChatMessages(showInitialAssistantMessage ? [{ role: 'assistant', content: intro }] : [])
        setChatError('')
        clearChatDraft(draftStorageKey)
      }
      message.success('Chat deleted')
    } catch {
      message.error('Could not delete that chat.')
    }
  }

  const handleResumeLastChat = () => {
    const last = loadLastChat(draftStorageKey)
    if (!last) return
    setChatMessages(last)
    setActiveThreadId(null)
    setChatError('')
    setIsThreadSidebarOpen(false)
  }

  const threadTitleFrom = (messages: AgentChatMessage[]) => {
    const firstUserMessage = messages.find((entry) => entry.role === 'user')?.content.trim()
    return firstUserMessage ? firstUserMessage.slice(0, 80) : `${title} Thread`
  }

  // Auto-save the conversation as a session (create on first exchange, update
  // after). Best-effort: failures fall back to the localStorage draft/last-chat.
  const autoSaveThread = async (messages: AgentChatMessage[]) => {
    if (!isAuthenticated || !messages.some((entry) => entry.role === 'user')) return
    const existingId = activeThreadIdRef.current
    // Don't start a second create while the first is still in flight.
    if (!existingId && creatingThreadRef.current) return
    if (!existingId) creatingThreadRef.current = true
    try {
      const payload = {
        agentId,
        competitor,
        title: threadTitleFrom(messages),
        messages,
        thread: { messages },
      }
      const savedThread = existingId ? await updateChatThread(existingId, payload) : await createChatThread(payload)
      activeThreadIdRef.current = savedThread._id
      setActiveThreadId(savedThread._id)
      setSavedThreads((current) => [savedThread, ...current.filter((thread) => thread._id !== savedThread._id)])
    } catch {
      // Silent — the browser draft still holds the conversation.
    } finally {
      creatingThreadRef.current = false
    }
  }

  // ---- Attachments (paste / attach files → images + docs for the model) ----
  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const addFiles = async (files: File[]) => {
    const MAX_BYTES = 15 * 1024 * 1024
    const MAX_COUNT = 8
    const room = Math.max(0, MAX_COUNT - attachments.length)
    if (files.length > room) {
      message.warning(`Only ${MAX_COUNT} attachments per message — the rest were skipped.`)
    }
    const added: (ChatAttachment & { id: string })[] = []
    for (const file of files.slice(0, room)) {
      const mimeType = resolveMimeType(file)
      try {
        const downscaled = await downscaleImage(file, mimeType)
        if (!downscaled && file.size > MAX_BYTES) {
          message.error(`${file.name || 'File'} is too large (max 15MB).`)
          continue
        }
        if (!downscaled && /^image\/(heic|heif)/i.test(mimeType)) {
          // This browser could not decode it, so it will go up as-is and the
          // backend will report it. Say so now rather than after a slow round trip.
          message.warning(`${file.name || 'This photo'} is HEIC — export it as JPEG or PNG so it can be read.`)
        }
        const dataUrl = downscaled ?? (await readFileAsDataUrl(file))
        added.push({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          name: file.name || 'attachment',
          // A downscaled image is re-encoded, so its type is no longer the original's.
          mimeType: downscaled ? 'image/jpeg' : mimeType,
          dataBase64: dataUrl,
        })
      } catch {
        message.error(`Could not read ${file.name || 'file'}.`)
      }
    }
    if (added.length) setAttachments((current) => [...current, ...added])
  }

  // ---- Drag and drop: drop a file anywhere over the chat to attach it ----
  const dragHasFiles = (event: DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(event)) return
    // Without this the browser navigates away and opens the dropped file.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(event)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (!dragDepthRef.current) setIsDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length) void addFiles(files)
  }

  const removeAttachment = (id: string) =>
    setAttachments((current) => current.filter((entry) => entry.id !== id))

  // Export a single assistant message to a real PDF or Word file the browser
  // downloads directly — so you get a working download instead of a dead link.
  const downloadMessage = async (index: number, format: 'pdf' | 'word') => {
    const node = messageRefs.current.get(index)
    if (!node) return
    // Clone the rendered message and drop chat-specific classes so only the
    // document styles apply (no cramped/bubble/theme styling bleeds in).
    const clone = node.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
    const docTitle = title || assistantLabel || 'Trusted Tech'
    // Lazy-load the logo as a base64 data URI so it embeds in both PDF and Word
    // (offline) without bloating every page load.
    let logo: string | undefined
    try {
      logo = (await import('../assets/trusted-technology-primary-logo.png?inline')).default
    } catch {
      logo = undefined
    }
    const documentHtml = buildDocumentHtml(clone.innerHTML, docTitle, logo)
    const stamp = new Date().toISOString().slice(0, 10)
    const base = `${docTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp}`

    if (format === 'pdf') {
      // Render the styled document off-screen with ABSOLUTE positioning (html2canvas
      // renders `fixed` off-screen elements blank), then rasterize THAT — not the bubble.
      const container = document.createElement('div')
      container.style.cssText = 'position:absolute; left:-9999px; top:0; width:760px; background:#ffffff; padding:0;'
      container.innerHTML = documentHtml
      document.body.appendChild(container)
      // Hand html2pdf the IN-FLOW .tt-doc element (with real height), not the
      // absolutely-positioned wrapper — a positioned clone collapses to height 0
      // and produces a blank page. The wrapper stays in the DOM so its <style>
      // rules apply globally to the clone.
      const target = (container.querySelector('.tt-doc') as HTMLElement | null) ?? container
      try {
        // Let layout/fonts settle before capture, or the canvas can come out empty.
        await new Promise((resolve) => setTimeout(resolve, 80))
        const html2pdf = (await import('html2pdf.js')).default
        await html2pdf()
          .set({
            margin: [14, 14, 16, 14],
            filename: `${base}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] },
          })
          .from(target)
          .save()
      } catch {
        message.error('Could not generate the PDF.')
      } finally {
        document.body.removeChild(container)
      }
    } else {
      // Word opens an HTML-based .doc fine; embed the same document styling.
      const full = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${base}</title></head><body>${documentHtml}</body></html>`
      const blob = new Blob(['﻿', full], { type: 'application/msword' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${base}.doc`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const handlePasteChat = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length) {
      event.preventDefault()
      void addFiles(files)
    }
  }

  // overrideText lets a toolbar button run a request the user did not type — the
  // Ahrefs control asks the writer for keyword research in words, through the
  // same path a typed message takes, so the turn, the thread and the autosave
  // all behave identically.
  const handleSendChat = async (overrideText?: string) => {
    const trimmedInput = (overrideText ?? chatInput).trim()

    if ((!trimmedInput && attachments.length === 0) || isChatting) {
      return
    }
    const attachmentsToSend: ChatAttachment[] = attachments.map(({ name, mimeType, dataBase64 }) => ({
      name,
      mimeType,
      dataBase64,
    }))

    // What the user sees: their text plus a 📎 line per attachment (so an
    // image-only send still shows something). What the backend gets: clean text —
    // the attachments themselves ride in `attachmentsToSend`.
    const attachmentLabels = attachmentsToSend.map((entry) => `📎 ${entry.name}`)
    const displayContent = [trimmedInput, ...attachmentLabels].filter(Boolean).join('\n')
    const baseText = trimmedInput || 'Please analyze the attached file(s).'

    const nextUserMessage: AgentChatMessage = {
      role: 'user',
      content: displayContent,
    }
    const nextMessages = [...chatMessages, nextUserMessage]
    const context = buildMessageContext?.().trim() || ''
    const backendText = context ? `${context}\n\nUser request:\n${baseText}` : baseText
    const messagesForBackend = [...chatMessages, { role: 'user' as const, content: backendText }]

    onTurnStart?.()
    setChatInput('')
    setAttachments([])
    setChatError('')
    setIsChatting(true)
    setStreamingActive(false)
    setChatMessages(nextMessages)
    // Persist the question right away so it's there even if we navigate off before
    // the answer arrives.
    saveChatDraft(draftStorageKey, nextMessages)

    try {
      let response: AgentChatResponse
      if (streaming) {
        let accumulated = ''
        const controller = new AbortController()
        chatAbortRef.current = controller
        response = await streamAgentChat(
          agentId,
          messagesForBackend,
          {
            signal: controller.signal,
            onDelta: (text) => {
              accumulated += text
              setStreamingActive(true)
              // Rebuild from the stable nextMessages so the growing reply replaces
              // (not appends to) the previous partial on every token.
              setChatMessages([...nextMessages, { role: 'assistant', content: accumulated }])
              onAssistantDelta?.(accumulated)
            },
          },
          competitor,
          attachmentsToSend,
        )
        const finalMessages = [
          ...nextMessages,
          response.message ?? { role: 'assistant' as const, content: accumulated },
        ]
        setChatMessages(finalMessages)
        onChatResponse?.(response)
        const streamed = typeof response.message?.content === 'string' ? response.message.content : accumulated
        if (streamed.trim()) onAssistantMessage?.(streamed)
        await autoSaveThread(finalMessages)
      } else {
        const runKey = draftStorageKey
        // Run the request at module scope so leaving/returning to this section
        // can't lose the answer. It persists to the draft the moment it lands, so
        // even if this view has unmounted, the answer is captured.
        const run = (async (): Promise<ChatRunResult> => {
          const res = await sendAgentChat(agentId, messagesForBackend, competitor, attachmentsToSend)
          const finalMessages = [...nextMessages, res.message]
          saveChatDraft(runKey, finalMessages)
          saveLastChat(runKey, finalMessages)
          return { finalMessages, response: res }
        })()
        inflightChats.set(runKey, run)
        void run.catch(() => {}).finally(() => {
          if (inflightChats.get(runKey) === run) inflightChats.delete(runKey)
        })

        const settled = await run
        response = settled.response
        setChatMessages(settled.finalMessages)
        setHasLastChat(true)
        onChatResponse?.(settled.response)
        const replied = settled.response.message?.content
        if (typeof replied === 'string' && replied.trim()) onAssistantMessage?.(replied)
        // Await so the session id is set before another message can be sent
        // (prevents duplicate sessions).
        await autoSaveThread(settled.finalMessages)
      }
    } catch (submitError) {
      if (suppressChatErrors) {
        setChatMessages((current) => [...current, { role: 'assistant', content: queryingLabel }])
      } else {
        setChatError(submitError instanceof Error ? submitError.message : `${assistantLabel} could not respond right now.`)
      }
    } finally {
      chatAbortRef.current = null
      setIsChatting(false)
      setStreamingActive(false)
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
        isAuthenticated ? getChatThreads(agentId, competitor) : Promise.resolve([]),
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
    onNewThread?.()
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
      activeThreadIdRef.current = full._id
      setChatError('')
      setIsThreadSidebarOpen(false)
    } catch {
      message.error('Could not open that chat.')
    }
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
        competitor,
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
    setMemoryMode('new')
    setMemoryProposal({
      ...EMPTY_MEMORY_PROPOSAL,
      section: memorySection ?? COMPANY_SECTION,
      content: latestUserMessage,
    })
    setMemoryReviewing(false)
    setMemoryModalOpen(true)
  }

  // Switch between saving a fresh memory and replacing an existing one. Leaving
  // update mode clears the target so a save can't accidentally overwrite.
  const changeMemoryMode = (mode: 'new' | 'update') => {
    setMemoryMode(mode)
    if (mode === 'new') {
      setMemoryProposal((current) => ({ ...current, targetSlug: undefined }))
    }
  }

  // Picking an existing memory to update: lock onto its slug and prefill the
  // editor with its current title/content/sensitivity so you edit, not retype.
  const selectUpdateTarget = (slug: string) => {
    const target = (sectionMemories ?? []).find((memory) => memory.slug === slug)
    if (!target) return
    setMemoryProposal((current) => ({
      ...current,
      targetSlug: target.slug,
      title: target.title,
      content: target.content || current.content,
      sensitivity: target.sensitivity === 'public' ? 'public' : 'internal',
    }))
  }

  const closeMemoryProposal = () => {
    if (isSavingMemory) return
    setMemoryModalOpen(false)
    setMemoryReviewing(false)
  }

  const reviewMemoryProposal = () => {
    if (memoryMode === 'update' && !memoryProposal.targetSlug) {
      message.error('Pick which existing memory to update.')
      return
    }
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
      const verb = saved.updated ? 'Updated' : 'Saved'
      message.success(`${verb} and verified in GBrain: ${saved.title}`)
      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `${saved.updated ? 'Updated the existing memory in' : 'Saved to'} GBrain and verified.\n\n- Memory: ${saved.title}\n- ID: \`${saved.slug}\`\n- Section: ${sectionOptions.find((option) => option.value === saved.section)?.label ?? saved.section}\n- Sensitivity: ${saved.sensitivity}`,
        },
      ])
      onMemorySaved?.()
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : 'GBrain could not save this memory.')
    } finally {
      setIsSavingMemory(false)
    }
  }

  sendChatRef.current = handleSendChat

  const railToggle = (
    <button
      type="button"
      className="chat-rail-toggle"
      aria-label={isThreadSidebarOpen ? `Hide ${threadRailTitle}` : `Show ${threadRailTitle}`}
      aria-expanded={isThreadSidebarOpen}
      title={isThreadSidebarOpen ? `Hide ${threadRailTitle}` : `Show ${threadRailTitle}`}
      onClick={() => setIsThreadSidebarOpen((current) => !current)}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1.5" y="2.5" width="15" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="11" y1="2.5" x2="11" y2="15.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  )

  return (
    <div className={`page${fullHeight ? ' page-chat-full' : ''}`}>
      {showPageHeader ? (
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      ) : null}

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
              className={`section-card${fullHeight ? ' chat-card-full' : ''}`}
              title={chatTitle || undefined}
              extra={
                <Space size="small" wrap>
                {showHeaderControls ? (
                <Space size="small" wrap>
                  {showBackendTag && agent ? <Tag color="gold">{backendLabel}</Tag> : null}
                  <Button type="primary" onClick={handleNewThread} disabled={isChatting}>
                    New chat
                  </Button>
                  {isAuthenticated ? (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: savedThreads.length
                          ? savedThreads.slice(0, 30).map((thread) => ({
                              key: thread._id,
                              label: (
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    minWidth: 240,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 210,
                                    }}
                                  >
                                    {thread.title || 'Untitled chat'}
                                  </span>
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void handleDeleteThread(thread._id)
                                    }}
                                  >
                                    ✕
                                  </Button>
                                </span>
                              ),
                              onClick: () => void handleImportThread(thread._id),
                            }))
                          : [{ key: '__empty', label: 'No saved chats yet — start chatting', disabled: true }],
                      }}
                    >
                      <Button disabled={isChatting}>Saved chats ({savedThreads.length}) ▾</Button>
                    </Dropdown>
                  ) : null}
                  {hasLastChat && !chatMessages.some((entry) => entry.role === 'user') ? (
                    <Button onClick={handleResumeLastChat} disabled={isChatting}>
                      Resume last chat
                    </Button>
                  ) : null}
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
                {threadRail ? (
                  railTools ? (
                    <span className="chat-tool-anchor">
                      {railToggle}
                      <span className="chat-tool-stack">{railTools}</span>
                    </span>
                  ) : railToggle
                ) : null}
                </Space>
              }
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {showChatIntro ? <Text type="secondary">{intro}</Text> : null}

                {chatError && !suppressChatErrors ? (
                  <Alert type="error" showIcon message={`${assistantLabel} chat is unavailable`} description={chatError} />
                ) : null}

                <div
                  className={`chat-shell${threadRail ? ' chat-shell-railed' : ''}${
                    threadRail && isThreadSidebarOpen ? ' chat-shell-railed-open' : ''
                  }${railTools ? ' chat-shell-tooled' : ''}`}
                >
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
                  ) : null}

                  <div
                    className={
                      chatSidePanel
                        ? `chat-workspace-grid${chatSidePanelPosition === 'left' ? ' chat-workspace-grid-flipped' : ''}`
                        : 'chat-workspace-single'
                    }
                  >
                    {chatSidePanel && chatSidePanelPosition === 'left' ? chatSidePanel : null}
                    <div
                      className={`chat-main${isDragActive ? ' chat-main-dragging' : ''}${
                        chatMessages.length ? '' : ' chat-main-empty'
                      }`}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                    {isDragActive ? (
                      <div className="chat-dropzone-overlay" aria-hidden="true">
                        <span>📎 Drop to attach</span>
                        <small>Images and documents</small>
                      </div>
                    ) : null}
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
                      {chatMessages
                        .map((entry) => (
                          entry.role === 'assistant' && typeof entry.content === 'string' && transformAssistantMessage
                            ? { ...entry, content: transformAssistantMessage(entry.content) }
                            : entry
                        ))
                        .filter((entry) => !(
                          entry.role === 'assistant'
                          && typeof entry.content === 'string'
                          && (hideAssistantMessage?.(entry.content) || !entry.content.trim())
                        ))
                        .map((entry, index) => (
                        <div
                          key={`${entry.role}-${index}`}
                          className={`chat-message ${entry.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`}
                        >
                          <div className="chat-message-label">
                            <span className="chat-message-who">
                              {/* The assistant keeps its logo — it tells you which
                                  agent answered. Your own initials next to your own
                                  name say nothing you do not already know. */}
                              {entry.role === 'user' ? null : (
                                <img className="chat-message-avatar" src={agentLogo} alt="" aria-hidden="true" />
                              )}
                              <span>{entry.role === 'user' ? userDisplayName : assistantLabel}</span>
                            </span>
                            {entry.role === 'assistant' && entry.content.trim().length > 20 ? (
                              <span className="chat-message-actions">
                                <Dropdown
                                  trigger={['click']}
                                  menu={{
                                    items: [
                                      { key: 'pdf', label: 'Download as PDF', onClick: () => void downloadMessage(index, 'pdf') },
                                      { key: 'word', label: 'Download as Word', onClick: () => void downloadMessage(index, 'word') },
                                    ],
                                  }}
                                >
                                  <Button type="text" size="small" style={{ fontSize: 12 }}>
                                    ⬇ Download
                                  </Button>
                                </Dropdown>
                              </span>
                            ) : null}
                          </div>
                          <div
                            className="chat-message-body"
                            ref={(el) => {
                              if (el) messageRefs.current.set(index, el)
                              else messageRefs.current.delete(index)
                            }}
                          >
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

                      {isChatting && !streamingActive ? (
                        <div className="chat-message chat-message-assistant">
                          <div className="chat-message-label">
                            <span className="chat-message-who">
                              <img className="chat-message-avatar" src={agentLogo} alt="" aria-hidden="true" />
                              <span>{assistantLabel}</span>
                            </span>
                          </div>
                          <div className="chat-message-body">
                            <QueryingIndicator label={queryingLabel} logo={agentLogo} />
                          </div>
                        </div>
                      ) : null}

                      <div ref={chatEndRef} />
                    </div>

                    <div className="chat-composer">
                      {attachments.length ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          {attachments.map((att) => {
                            // HEIC would render as a broken image icon, so only
                            // preview what a browser can actually paint.
                            const isImage = /^image\/(jpeg|png|gif|webp|bmp|svg\+xml)$/i.test(att.mimeType)
                            return (
                              <span
                                key={att.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  border: '1px solid var(--app-border, rgba(0,0,0,0.15))',
                                  borderRadius: 8,
                                  padding: '4px 8px',
                                  maxWidth: 240,
                                }}
                              >
                                {isImage ? (
                                  <img
                                    src={att.dataBase64}
                                    alt={att.name}
                                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }}
                                  />
                                ) : (
                                  <span aria-hidden>📄</span>
                                )}
                                <span
                                  style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {att.name}
                                </span>
                                <Button
                                  type="text"
                                  size="small"
                                  aria-label={`Remove ${att.name}`}
                                  onClick={() => removeAttachment(att.id)}
                                  style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                                >
                                  ✕
                                </Button>
                              </span>
                            )
                          })}
                        </div>
                      ) : null}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          if (files.length) void addFiles(files)
                          event.target.value = ''
                        }}
                      />
                      <TextArea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        onPaste={handlePasteChat}
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
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isChatting}
                          title="Attach images or documents (or drag them onto the chat, or paste an image)"
                        >
                          📎 Attach
                        </Button>
                        {isChatting ? (
                          <Button
                            danger
                            onClick={() => {
                              chatAbortRef.current?.abort()
                              chatAbortRef.current = null
                            }}
                          >
                            Stop
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => void handleSendChat()} loading={isChatting}>
                          Send
                        </Button>
                      </div>
                    </div>
                    </div>
                    {chatSidePanel && chatSidePanelPosition === 'right' ? chatSidePanel : null}
                  </div>
                  {threadRail ? (
                    <aside className="chat-rail" aria-label={threadRailTitle} aria-hidden={!isThreadSidebarOpen}>
                      <div className="chat-rail-header">
                        <Text strong>{threadRailTitle}</Text>
                        <Text type="secondary">{savedThreads.length}</Text>
                      </div>
                      <Button type="primary" block onClick={handleNewThread} disabled={isChatting}>
                        {threadRailNewLabel}
                      </Button>
                      <div className="chat-thread-list">
                        {savedThreads.length ? (
                          savedThreads.map((thread) => (
                            <div
                              key={thread._id}
                              className={`chat-rail-item${activeThreadId === thread._id ? ' chat-rail-item-active' : ''}`}
                            >
                              <button
                                type="button"
                                className="chat-rail-open"
                                onClick={() => void handleImportThread(thread._id)}
                                disabled={isChatting}
                              >
                                <strong>{thread.title || 'Untitled'}</strong>
                                <span>{new Date(thread.updatedAt).toLocaleDateString()}</span>
                              </button>
                              <Button
                                type="text"
                                size="small"
                                danger
                                aria-label={`Delete ${thread.title || 'item'}`}
                                onClick={() => void handleDeleteThread(thread._id)}
                                disabled={isChatting}
                              >
                                ✕
                              </Button>
                            </div>
                          ))
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12 }}>{threadRailEmptyText}</Text>
                        )}
                      </div>
                    </aside>
                  ) : null}
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
                    <Tag color={memoryMode === 'update' ? 'orange' : 'green'}>
                      {memoryMode === 'update' ? 'Updating existing memory' : 'New memory'}
                    </Tag>
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
                  {sectionMemories ? (
                    <div style={{ width: '100%' }}>
                      <Text strong>New memory, or update an existing one in this section?</Text>
                      <div style={{ marginTop: 6 }}>
                        <Radio.Group
                          value={memoryMode}
                          onChange={(event) => changeMemoryMode(event.target.value)}
                          optionType="button"
                          buttonStyle="solid"
                        >
                          <Radio.Button value="new">Save as new</Radio.Button>
                          <Radio.Button value="update" disabled={!sectionMemories.length}>
                            Update existing
                          </Radio.Button>
                        </Radio.Group>
                      </div>
                      {!sectionMemories.length ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          No memories saved in this section yet — save one, then you can update it here.
                        </Text>
                      ) : null}
                      {memoryMode === 'update' && sectionMemories.length ? (
                        <div style={{ marginTop: 8 }}>
                          <Select
                            style={{ width: '100%' }}
                            placeholder="Choose the memory to replace"
                            value={memoryProposal.targetSlug}
                            options={sectionMemories.map((memory) => ({ value: memory.slug, label: memory.title }))}
                            onChange={selectUpdateTarget}
                            showSearch
                            optionFilterProp="label"
                          />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            This overwrites the selected memory in place — no duplicate is created.
                          </Text>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div style={{ width: '100%' }}>
                    <Text strong>Title</Text>
                    <Input
                      value={memoryProposal.title}
                      maxLength={160}
                      placeholder="Example: Preferred content audience"
                      disabled={memoryMode === 'update'}
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
                    <Text strong>{memorySection ? 'Saving to this section' : 'Save to which part of the brain?'}</Text>
                    <Space wrap>
                      {memorySection ? (
                        <Tag color="gold" style={{ padding: '4px 10px' }}>
                          {sectionOptions.find((option) => option.value === memoryProposal.section)?.label ?? memoryProposal.section}
                        </Tag>
                      ) : (
                        <Select
                          value={memoryProposal.section}
                          style={{ width: 260 }}
                          // "Trusted Tech Company" = readable by every agent. Any other choice
                          // scopes the memory to just that agent (the section that will use it).
                          options={sectionOptions}
                          onChange={(section) => setMemoryProposal((current) => ({ ...current, section }))}
                        />
                      )}
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
