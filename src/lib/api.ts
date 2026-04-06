const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
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
