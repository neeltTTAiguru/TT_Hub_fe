const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

let accessTokenProvider: null | (() => Promise<string>) = null

export function setAccessTokenProvider(provider: null | (() => Promise<string>)) {
  accessTokenProvider = provider
}

type ApiErrorPayload = {
  message?: string
}

export type CompanyContext = {
  _id?: string
  companyName: string
  companySummary: string
  mission: string
  website: string
  targetCustomers: string[]
  serviceLines: string[]
  activeProducts: string[]
  researchPriorities: string[]
  positioningNotes: string
}

export type Competitor = {
  _id: string
  name: string
  website: string
  category: string
  status: 'watching' | 'priority' | 'inactive'
  notes: string
  strengths: string[]
  watchSignals: string[]
  updatedAt: string
}

export type ResearchSource = {
  label: string
  url: string
  sourceType: string
}

export type ResearchFinding = {
  summary: string
  implication: string
  confidence: 'low' | 'medium' | 'high'
  sources: ResearchSource[]
}

export type ResearchRun = {
  _id: string
  title: string
  objective: string
  scope: string
  status: 'queued' | 'in_progress' | 'completed'
  requestedBy: string
  findings: ResearchFinding[]
  recommendedNextSteps: string[]
  reportSummary: string
  updatedAt: string
  createdAt: string
}

export type PublicPage = {
  _id: string
  url: string
  slug: string
  title: string
  pageType: string
  summary: string
  highlights: string[]
  rawText: string
  sourceDomain: string
  visibility: 'public' | 'internal'
  updatedAt: string
  createdAt: string
}

export type Opportunity = {
  _id: string
  noticeId: string
  title: string
  solicitationNumber: string
  agency: string
  office: string
  postedDate: string
  responseDeadline: string
  noticeType: string
  setAside: string
  naicsCode: string
  classificationCode: string
  uiLink: string
  descriptionLink: string
  sourceKeyword: string
  active: string
  updatedAt: string
  createdAt: string
}

export type AgentSummary = {
  id: string
  name: string
  status: string
  productArea: string
  summary: string
  mission: string
  workflow: string[]
  outputShape: string[]
  behaviorRules: string[]
  workspace: {
    purpose: string
    activeProducts: string[]
    trustedTechRules: string[]
  }
  plugin: {
    id: string
    name: string
    description: string
    version: string
    tools: string[]
    configFields: string[]
  }
  files: Record<string, string>
}

export type AgentDetail = AgentSummary & {
  documents: Record<
    string,
    {
      path: string
      content: string | Record<string, unknown>
    }
  >
}

export type AgentChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatThread = {
  _id: string
  userId: string
  agentId: string
  title: string
  messages: AgentChatMessage[]
  thread: {
    messages: AgentChatMessage[]
    [key: string]: unknown
  }
  updatedAt: string
  createdAt: string
}

export type AgentChatResponse = {
  message: AgentChatMessage
  meta: {
    model: string
    responseId: string
  }
}

export type User = {
  _id: string
  name: string
  email: string
  role: string
  status: 'active' | 'invited' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type BrowserCaptureResponse = {
  page: PublicPage
  researchRun: ResearchRun
}

export type SamGovSyncResponse = {
  opportunities: Opportunity[]
  researchRun: ResearchRun
}

export type LinkedInPostCaptureResponse = {
  title: string
  url: string
  keyword: string
  screenshotDataUrl?: string
  posts: Array<{
    author: string
    text: string
    selector?: string
  }>
}

export type LinkedInBrowserSessionResponse = {
  ok: boolean
  page: {
    title: string
    url: string
    readyState: string
  }
}

export type BrowserScreenshotResponse = {
  mediaPath: string
  dataUrl: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  const authHeaders =
    accessTokenProvider
      ? (() => accessTokenProvider())().then((token) => (token ? { Authorization: `Bearer ${token}` } : {}))
      : Promise.resolve({})

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders),
        ...(init?.headers ?? {}),
      },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Trusted Tech Hub API is unavailable at ${API_BASE_URL}. Start the backend and try again.`)
    }

    throw error
  }

  if (!response.ok) {
    const body = await response.text()
    let message = body

    try {
      const parsed = JSON.parse(body) as ApiErrorPayload
      if (parsed.message) {
        message = parsed.message
      }
    } catch {
      // Keep the raw response body when the payload is not JSON.
    }

    throw new Error(message || `Request failed with ${response.status}`)
  }

  return response.json()
}

export function getAgents() {
  return request<AgentSummary[]>('/agents')
}

export function getAgent(agentId: string) {
  return request<AgentDetail>(`/agents/${agentId}`)
}

export function getCompanyContext() {
  return request<CompanyContext>('/company-context')
}

export function updateCompanyContext(payload: Partial<CompanyContext>) {
  return request<CompanyContext>('/company-context', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getCompetitors() {
  return request<Competitor[]>('/competitors')
}

export function getResearchRuns() {
  return request<ResearchRun[]>('/research-runs')
}

export function getUsers() {
  return request<User[]>('/users')
}

export function createUser(payload: {
  name: string
  email: string
  role?: string
  status?: User['status']
}) {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createResearchRun(payload: {
  title: string
  objective: string
  scope?: string
  requestedBy?: string
}) {
  return request<ResearchRun>('/research-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function sendAgentChat(agentId: string, messages: AgentChatMessage[]) {
  return request<AgentChatResponse>(`/agents/${agentId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  })
}

export function getChatThreads(agentId?: string) {
  const search = new URLSearchParams()

  if (agentId) {
    search.set('agentId', agentId)
  }

  const query = search.toString()

  return request<ChatThread[]>(`/chat-threads${query ? `?${query}` : ''}`, {
  })
}

export function createChatThread(
  payload: {
    agentId: string
    title: string
    messages: AgentChatMessage[]
    thread: {
      messages: AgentChatMessage[]
      [key: string]: unknown
    }
  },
) {
  return request<ChatThread>('/chat-threads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateChatThread(
  threadId: string,
  payload: {
    agentId: string
    title: string
    messages: AgentChatMessage[]
    thread: {
      messages: AgentChatMessage[]
      [key: string]: unknown
    }
  },
) {
  return request<ChatThread>(`/chat-threads/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function captureBrowserResearchPage(payload: { url: string; objective?: string }) {
  return request<BrowserCaptureResponse>('/browser-research/capture-page', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getSamGovOpportunities() {
  return request<Opportunity[]>('/sam-gov-monitor/opportunities')
}

export function syncSamGovMonitor() {
  return request<SamGovSyncResponse>('/sam-gov-monitor/sync', {
    method: 'POST',
  })
}

export function getLinkedInProfiles() {
  return request<PublicPage[]>('/linkedin-surfer/profiles')
}

export function openLinkedInSession(payload?: { url?: string }) {
  return request<LinkedInBrowserSessionResponse>('/linkedin-surfer/open-session', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function getLinkedInScreenshot() {
  return request<BrowserScreenshotResponse>('/linkedin-surfer/screenshot', {
    method: 'POST',
  })
}

export function captureLinkedInProfile(payload: { url: string }) {
  return request<PublicPage>('/linkedin-surfer/capture-profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function captureLinkedInPosts(payload: { url: string; keyword: string }) {
  return request<LinkedInPostCaptureResponse>('/linkedin-surfer/capture-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function searchLinkedInPosts(payload: { keyword: string }) {
  return request<LinkedInPostCaptureResponse>('/linkedin-surfer/search-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
