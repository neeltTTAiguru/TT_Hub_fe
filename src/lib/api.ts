const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

export function contentOperationsAssetUrl(assetId: string) {
  return `${API_BASE_URL}/content-operations-download/asset/${encodeURIComponent(assetId)}`
}

let accessTokenProvider: null | ((forceRefresh?: boolean) => Promise<string>) = null

export function setAccessTokenProvider(provider: null | ((forceRefresh?: boolean) => Promise<string>)) {
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
  attachmentLinks: OpportunityAttachmentLink[]
  opportunityLinks: OpportunityLink[]
  attachmentsLinksText: string
  rfpPackage: RfpPackage
  sourceKeyword: string
  active: string
  updatedAt: string
  createdAt: string
}

export type OpportunityAttachmentLink = {
  label: string
  url: string
  access: string
  fileType: string
}

export type OpportunityLink = {
  label: string
  url: string
  updatedDate: string
}

export type RfpPackage = {
  classification?: string
  originalSetAside?: string
  productServiceCode?: string
  naicsCode?: string
  placeOfPerformance?: string
  initiative?: string
  description?: string
  contactInformation?: string
  primaryPointOfContact?: string
  alternativePointOfContact?: string
  contractingOfficeAddress?: string
  attachmentsLinksText?: string
  sourceUrl?: string
  capturedAt?: string
}

export type ReadOpportunityAttachment = OpportunityAttachmentLink & {
  status: 'read' | 'empty' | 'unsupported' | 'error'
  contentType?: string
  sizeBytes?: number
  text: string
  excerpt: string
  truncated?: boolean
  error?: string
}

export type ReadOpportunityAttachmentsResponse = {
  opportunity: Opportunity
  attachments: ReadOpportunityAttachment[]
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
  competitor?: string
  title: string
  messages: AgentChatMessage[]
  thread: {
    messages: AgentChatMessage[]
    [key: string]: unknown
  }
  updatedAt: string
  createdAt: string
}

// Metadata-only shape returned by the Saved-chats list (no message bodies, so the
// list stays cheap). Fetch the full ChatThread by id when the user opens one.
export type ChatThreadSummary = {
  _id: string
  agentId: string
  competitor?: string
  title: string
  updatedAt: string
  createdAt?: string
}

export type AgentChatResponse = {
  message: AgentChatMessage
  meta: {
    provider?: 'hermes' | 'openai'
    model: string
    responseId: string
  }
  wordpressDraft?: {
    id: number
    title: string
    type: 'post' | 'page'
    reviewUrl: string
  }
}

export type WordPressDraftPreview = {
  id: number
  type: 'post' | 'page'
  title: string
  content: string
  excerpt: string
  reviewUrl: string
  siteUrl: string
  stylesheets: string[]
  inlineStyles: string[]
  modified: string
}

export type BrainMemoryProposal = {
  title: string
  content: string
  sensitivity: 'internal' | 'public'
  source?: string
  // When set, update this existing memory in place (same GBrain page) instead of
  // creating a new one.
  targetSlug?: string
}

export type BrainMemoryResult = {
  slug: string
  title: string
  department: string
  competitor?: string
  competitorName?: string
  sensitivity: BrainMemoryProposal['sensitivity']
  source: string
  lifecycle: 'approved'
  updated?: boolean
  verified: boolean
}

export type CompetitorMemoryProposal = {
  // Slug of the tracked competitor whose brain section to save into.
  competitor: string
  // Optional BWC model line item within that section, e.g. "Axon Body 4".
  model?: string
  title: string
  content: string
  sensitivity: 'internal' | 'public'
  source?: string
}

export type User = {
  _id: string
  name: string
  email: string
  createdBy: string
  isAdmin: boolean
  role: string
  title: string
  phone: string
  userType: 'trusted_employee' | 'police_officer' | 'firefighter' | 'agency_admin' | 'non_trusted_employee'
  onboardingFlow: 'trusted_employee' | 'public_safety' | 'external_reviewer' | 'restricted_guest'
  agencyName: string
  agencyType: string
  city: string
  state: string
  department: string
  accessScope: 'internal' | 'agency_workspace' | 'grant_drafting_only' | 'read_only'
  grantProjectFocus: string
  targetGrantTypes: string[]
  promptVariables: {
    agencyName: string
    agencyType: string
    location: string
    roleContext: string
    projectFocus: string
    knownNeeds: string
    grantRequirements: string
  }
  uploadedGrantApplications?: Array<{
    _id?: string
    fileName: string
    contentType: string
    sizeBytes: number
    extractedText: string
    truncated: boolean
    uploadedAt: string
  }>
  status: 'active' | 'invited' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type BrowserCaptureResponse = {
  page: PublicPage
  researchRun: ResearchRun
}

export type SamGovBrowserSearchResponse = {
  source: string
  searchUrl: string
  daysBack: number
  keywords: string[]
  noticeTypes: string[]
  opportunities: Opportunity[]
  scannedAt: string
}

export type FirstSamGovBrowserOpportunityResponse = {
  source: string
  searchUrl: string
  keyword: string
  searchPlan?: {
    originalInstructions: string
    searchText: string
    noticeTypes: string[]
    includeInactive: boolean
  }
  opportunity: Opportunity | null
  scannedAt: string
}

export type PoliceGrantLead = {
  _id: string
  leadId: string
  agencyName: string
  locationName: string
  state: string
  estimatedAgencySize: string
  grantAmount: number
  grantAmountText: string
  fundingProgram: string
  fundingSource: string
  grantDate: string
  grantEndDate: string
  description: string
  opportunityScore: number
  likelyNeeds: string[]
  whyThisMatters: string
  startupOpportunity: string
  recommendedAction: 'Immediate outreach' | 'High priority' | 'Monitor' | 'Low priority'
  sourceUrl: string
  sourceType: string
  scannedAt: string
  updatedAt: string
  createdAt: string
}

export type GrantOpportunity = {
  _id: string
  opportunityId: string
  title: string
  sourceAgency: string
  sourceUrl: string
  applicationUrl: string
  grantProgram: string
  eligibility: string
  deadline: string
  awardRange: string
  matchRequired: string
  focusAreas: string[]
  fitTags: string[]
  fitScore: number
  summary: string
  sourceText: string
  sourceType: string
  scannedAt: string
  updatedAt: string
  createdAt: string
}

export type GrantOpportunitySearchResponse = {
  source: string
  sources: string[]
  keywords: string[]
  scannedAt: string
  errors: Array<{
    source: string
    url: string
    message: string
  }>
  opportunities: GrantOpportunity[]
}

export type GrantApplicationDraft = {
  _id: string
  userId: string
  grantOpportunityId: string
  status: 'draft' | 'needs_review' | 'ready'
  draftTitle: string
  sections: {
    executiveSummary: string
    needStatement: string
    projectDescription: string
    goalsAndOutcomes: string
    implementationPlan: string
    budgetNarrative: string
    sustainabilityPlan: string
    agencyBenefitStatement: string
  }
  questionResponses: Array<{
    question: string
    answer: string
    fieldName: string
    fieldType: string
    confidence: 'high' | 'medium' | 'low'
    needsUserReview: boolean
    missingInfo: string[]
  }>
  missingInformation: string[]
  complianceChecklist: string[]
  recommendedNextSteps: string[]
  sourceReferences: Array<{
    label: string
    url: string
  }>
  portalInstructions: string
  createdAt: string
  updatedAt: string
}

export type GrantApplicationDraftResponse = {
  draft: GrantApplicationDraft
  opportunity: GrantOpportunity
  user: User
  meta: {
    model: string
    responseId: string
  }
}

export type UploadedGrantApplicationDraftResponse = {
  draft: GrantApplicationDraft
  upload: NonNullable<User['uploadedGrantApplications']>[number]
  user: User
  meta: {
    model: string
    responseId: string
  }
}

export type GrantApplicationQuestionsResponse = {
  opportunity: GrantOpportunity
  applicationUrl: string
  page: {
    title: string
    url: string
  }
  needsLogin: boolean
  message: string
  questions: Array<{
    label: string
    type: string
    name: string
    required: boolean
    options: string[]
  }>
  visibleQuestionText: string[]
  capturedAt: string
}

export type GrantDiscoveryResponse = {
  source: string
  state: string
  stateCode: string
  sources: Array<{
    sourceName: string
    sourceUrl: string
    focusArea: string
  }>
  readErrors: Array<{
    sourceName: string
    sourceUrl: string
    message: string
  }>
  scannedAt: string
  result: {
    eligibleGrants?: unknown[]
    maybeEligibleGrants?: unknown[]
    notEligibleGrants?: unknown[]
    missingUserInfo?: string[]
    sourceFindings?: unknown[]
  }
  opportunities: GrantOpportunity[]
}

export type PoliceGrantSurfResponse = {
  source: string
  searchUrl: string
  instructions?: string
  scannedAt: string
  skippedCount?: number
  exhausted?: boolean
  leads: PoliceGrantLead[]
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

export type TwitterPostCaptureResponse = {
  title: string
  url: string
  keyword: string
  screenshotDataUrl?: string
  posts: Array<{
    author: string
    handle: string
    text: string
    postedAt: string
    url: string
    selector?: string
  }>
}

export type TwitterSignalPost = TwitterPostCaptureResponse['posts'][number] & {
  search: string
  sourcePage: string
  signal: {
    score: number
    matchedTerms: string[]
    hasBodyCameraLanguage: boolean
    hasPublicSafetyLanguage: boolean
  }
}

export type TwitterConnectionStatus = {
  connected: boolean
  browserReady: boolean
  currentUrl: string
  title: string
  readyState: string
  needsLogin: boolean
  source: string
  message: string
}

export type TwitterSurferSyncResponse = {
  searches: string[]
  filter: string
  posts: TwitterSignalPost[]
  errors: Array<{
    search: string
    message: string
  }>
  report: {
    summary: string
    opportunitySignals: TwitterSignalPost[]
    weakSignals: TwitterSignalPost[]
    recommendedNextSteps: string[]
  }
  researchRun: ResearchRun | null
}

export type TwitterSurferTaskRun = {
  id: string
  title: string
  task: string
  status: 'running' | 'completed' | 'failed'
  durationMinutes: number
  startedAt: string
  endsAt: string
  completedAt: string
  searches: string[]
  posts: TwitterSignalPost[]
  errors: Array<{
    search: string
    message: string
  }>
  report: TwitterSurferSyncResponse['report']
  researchRun: ResearchRun | null
  progress: {
    roundsAttempted: number
    lastRoundAt: string
  }
  stoppedByUser: boolean
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

/** A run as the command board and the assignments card describe it. */
export type AssignableRun = {
  id: string
  status: string
  brief: string
  filtersLabel: string
  total: number
  completed: number
  failed: number
  foundCameras?: number
  foundEmails?: number
  foundPhones?: number
  startedBy?: string
  /** Who the daily schedule researched this run for, if it did. */
  assignedTo?: string
  startedAt: string | null
  finishedAt: string | null
}

export type DailyPlanEntry = {
  email: string
  count: number
  status: 'pending' | 'starting' | 'running' | 'done' | 'skipped' | 'failed'
  runId: string
  queued: number
  /** Leads delivered so far - `count` is the target for this. */
  leads?: number
  rounds?: number
  runIds?: string[]
  note: string
  /** How the leads-ready email went, or why it did not go. */
  notified?: string
  startedAt: string | null
  finishedAt: string | null
}

export type DailySchedule = {
  enabled: boolean
  hour: number
  minute: number
  timezone: string
  pick: { states: string[]; agencyTypes: string[]; maxOfficers: number | null; camera: 'unknown' | 'not_yes' | 'any' }
  /** Whose Gmail the leads-ready email goes from. */
  notifyFrom: string
  /** Copied on every leads email. */
  notifyCc: string[]
  /** Agencies left to draw from under the pick scope. */
  pool: number
  nextFireAt: string | null
  days: Array<{ date: string; trigger: string; finishedAt: string | null; plan: DailyPlanEntry[] }>
}

export type MemberScope = {
  states: string[]
  agencyTypes: string[]
  maxOfficers: number | null
  /** not_yes = anything but a confirmed yes: unknown or none. */
  camera: 'any' | 'unknown' | 'yes' | 'no' | 'not_yes'
}

/**
 * What the command board decided a restricted account sees. Null for a
 * full-access account, and for anyone the board has not configured. A
 * configured account gets no filter controls: the scope is the map.
 */
export type MemberView = {
  assignedRuns: AssignableRun[]
  limitToAssignedRuns: boolean
  includeCalled: boolean
  scope: MemberScope
}

export type MyAccess = {
  email: string
  /** True for the accounts on the backend's FULL_ACCESS_EMAILS list. */
  fullAccess: boolean
  member: MemberView | null
}

export type HubMember = {
  email: string
  name: string
  lastSeenAt: string | null
  fullAccess: boolean
  assignedRunIds: string[]
  limitToAssignedRuns: boolean
  /** Also every agency anyone has called: the Reached out and Call later pins. */
  includeCalled: boolean
  /** How many agencies the morning schedule researches for them. */
  dailyResearch: number
  gmail: { connected: boolean; address: string }
  scope: MemberScope
  notes: string
  updatedBy: string
  updatedAt: string | null
}

export type CommandBoard = {
  members: HubMember[]
  runs: AssignableRun[]
  agencyTypes: string[]
  fullAccessEmails: string[]
  schedule: DailySchedule
}

export type HubMemberInput = Pick<
  HubMember,
  'name' | 'assignedRunIds' | 'limitToAssignedRuns' | 'includeCalled' | 'dailyResearch' | 'scope' | 'notes'
>

export type GmailStatus = {
  configured: boolean
  connected: boolean
  address: string
  connectedAt: string | null
  lastError: string
}

export type GmailMessageSummary = {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  unread: boolean
}

export type GmailMessage = GmailMessageSummary & {
  messageId: string
  references: string
  body: string
}

export type EmailTemplate = {
  key: string
  subject: string
  body: string
  updatedBy?: string
  placeholders: Array<[string, string]>
}

export const getGmailStatus = () => request<GmailStatus>('/gmail/status')
export const getGmailConnectUrl = () => request<{ url: string }>('/gmail/connect')
export const disconnectGmail = () => request<{ ok: true }>('/gmail', { method: 'DELETE' })

export function getGmailInbox(options: { q?: string; pageToken?: string } = {}) {
  const params = new URLSearchParams()
  if (options.q) params.set('q', options.q)
  if (options.pageToken) params.set('pageToken', options.pageToken)
  return request<{ nextPageToken: string; messages: GmailMessageSummary[] }>(`/gmail/inbox?${params.toString()}`)
}

export const getGmailMessage = (id: string) => request<GmailMessage>(`/gmail/messages/${encodeURIComponent(id)}`)

export function replyToGmailMessage(id: string, body: string) {
  return request<{ ok: true; id: string }>(`/gmail/messages/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export const getEmailTemplate = (key: string) => request<EmailTemplate>(`/gmail/template/${key}`)

export function saveEmailTemplate(key: string, input: { subject: string; body: string }) {
  return request<EmailTemplate>(`/gmail/template/${key}`, { method: 'PUT', body: JSON.stringify(input) })
}

/** The template filled in for one agency, as the signed-in person would send it. */
export function previewEmailTemplate(key: string, ori: string) {
  return request<{ subject: string; body: string; to: string } & GmailStatus>(
    `/gmail/template/${key}/preview/${encodeURIComponent(ori)}`,
  )
}

/** A plain email to anyone from the Gmail page. */
export function composeGmail(input: { to: string; subject: string; body: string }) {
  return request<{ ok: true; id: string; to: string }>('/gmail/compose', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function sendAgencyEmail(input: { ori: string; to?: string; subject: string; body: string }) {
  return request<{ ok: true; id: string; to: string }>('/gmail/send', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveDailySchedule(input: Partial<Pick<DailySchedule, 'enabled' | 'hour' | 'minute' | 'pick' | 'notifyFrom' | 'notifyCc'>>) {
  return request<DailySchedule>('/command-board/schedule', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Run today's plan now instead of at the hour. Spends today's budget. */
export function runDailyResearchNow() {
  return request<{ date: string; plan: DailyPlanEntry[] }>('/command-board/schedule/run-now', {
    method: 'POST',
  })
}

/** The roster and everything needed to configure it. Full access only. */
export function getCommandBoard() {
  return request<CommandBoard>('/command-board')
}

export function saveHubMember(email: string, input: HubMemberInput) {
  return request<HubMember>(`/command-board/members/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function removeHubMember(email: string) {
  return request<{ ok: true }>(`/command-board/members/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

/** How many agencies one member's map would show under their saved rules. */
export function previewHubMember(email: string) {
  return request<{ agencies: number; limited: boolean; view: MemberView }>(
    `/command-board/members/${encodeURIComponent(email)}/preview`,
  )
}

/**
 * What this account is allowed to see.
 *
 * The server owns the answer. Shipping the allowlist into the bundle would put
 * it on a CDN and leave the same rule written in two places, so the sidebar
 * asks instead of deciding.
 */
export function getMyAccess() {
  return request<MyAccess>('/access')
}

async function request<T>(path: string, init?: RequestInit, options?: { timeoutMs?: number }): Promise<T> {
  let response: Response
  // Bound slow requests (e.g. HubSpot chat) so the UI never hangs indefinitely.
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs
  const timeoutTimer =
    typeof timeoutMs === 'number' && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
  const buildHeaders = async (forceRefresh = false) => {
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')

    if (accessTokenProvider) {
      const token = await accessTokenProvider(forceRefresh)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    }

    return headers
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: await buildHeaders(),
      signal: controller.signal,
    })

    if (response.status === 401 && accessTokenProvider) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: await buildHeaders(true),
        signal: controller.signal,
      })
    }
  } catch (error) {
    const errorName = typeof error === 'object' && error !== null ? (error as { name?: string }).name : undefined
    if (errorName === 'AbortError') {
      throw new Error('The assistant took too long to respond. Nothing was lost — your chat is saved, please try again.')
    }
    if (error instanceof TypeError) {
      throw new Error(`Trusted Tech Hub API is unavailable at ${API_BASE_URL}. Start the backend and try again.`)
    }

    throw error
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer)
  }

  if (!response.ok) {
    const body = await response.text()
    let message = body.trim()

    try {
      const parsed = JSON.parse(body) as ApiErrorPayload
      if (parsed.message) {
        message = parsed.message
      }
    } catch {
      const contentType = response.headers.get('content-type') || ''
      const looksHtml = contentType.includes('text/html') || /^<!doctype html/i.test(message) || /^<html/i.test(message)
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        // Gateway/timeout (common on the slow HubSpot round-trip): reassure, don't scare.
        message = 'The assistant took too long and the server timed out. Nothing was lost — your chat is saved, please try again.'
      } else if (looksHtml) {
        message = `The server returned an unexpected response for ${path}. Nothing was lost — please try again in a moment.`
      }
    }

    if (response.status === 401 && /unauthorized/i.test(message)) {
      message = 'Your Auth0 session is signed in, but the API rejected the access token. Log out and back in to refresh the API token.'
    }

    throw new Error(message || `Request failed with ${response.status}`)
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export function getAgents() {
  return request<AgentSummary[]>('/agents')
}

export function getAgent(agentId: string) {
  return request<AgentDetail>(`/agents/${agentId}`)
}

export type ContentOpportunity = {
  id: string
  primaryKeyword: string
  title: string
  buyerIntent: string
  businessFit: number | null
  searchVolume: number | null
  keywordDifficulty: number | null
  trafficPotential: number | null
  currentPosition: number | null
  competitorGap: string
  conversionPotential: string
  revenuePath: string
  score: number | null
  rationale: string
  source: 'ahrefs'
}

export type ContentOperationsRun = {
  runId: string
  targetDomain: string
  requestType: string
  userInstructions: string
  workflowMode: 'manual' | 'balanced' | 'draft_automation'
  keywordListId?: string
  surferOptimization?: {
    editorId: number | null
    editorUrl: string
    seoScoreBefore: number | null
    seoScoreAfter: number | null
    aiSearchScore: number | null
    targetScore?: number
    targetMet?: boolean
    scoreFloor?: number | null
    floorMet?: boolean
    passes: number
    notes: string
    optimizedAt: string
    // Set by the length gate: the kept article's word count against Surfer's.
    wordCount?: number
    targetWordCount?: number | null
    lengthOk?: boolean
  } | null
  // The workflow check for length: the article measured against SurferSEO's
  // word target with a tolerance band. `corrected` means the gate changed the
  // article to bring it into range.
  lengthCheck?: {
    words: number
    target: number | null
    min: number | null
    max: number | null
    tolerance: number
    status: 'ok' | 'short' | 'long' | 'unknown'
    ok: boolean
    delta: number
    corrected?: boolean
    checkedAt?: string
  } | null
  // What happened to the sitemap after this run's post went live.
  sitemap?: SitemapRefreshResult | null
  // What Surfer says the SERP rewards: priority terms with the frequency range
  // they want, and whether each one works as a heading. Already returned with
  // every run — the report just never read it.
  surferGuidelines?: {
    targetWordCount?: number | null
    terms?: Array<{ term: string; min: number | null; max: number | null; heading: boolean }>
    // Counts the ranking pages average — images, headings, paragraphs. A factor
    // Surfer has no data for is omitted rather than reported as zero.
    structure?: Record<string, { min: number | null; max: number | null; avg: number | null }>
    // People Also Ask for the keyword. The honest way to add length.
    questions?: string[]
  } | null
  currentStage: string
  status: 'ready' | 'running' | 'waiting_for_approval' | 'completed' | 'error' | 'stopped'
  researchOnly: boolean
  opportunities: ContentOpportunity[]
  selectedOpportunity: ContentOpportunity | null
  brief: Record<string, unknown> | null
  article: string
  heroImage?: {
    assetId: string
    altText: string
    caption: string
  } | null
  // The generated artwork. Kept out of `article`, which is prose only, and spliced into
  // the post at WordPress-sync time — see insertGeneratedImages on the backend.
  generatedImages?: Array<{
    role?: string
    url?: string
    altText?: string
    caption?: string
    placementAfterHeading?: string
    mediaId?: number
  }>
  testPublication: {
    published: boolean
    slug: string
    title: string
    publishedAt: string | null
    url: string
  }
  wordpressPublication?: {
    postId: number | null
    status: string
    slug: string
    title: string
    createdAt: string | null
    url: string
  }
  stages: Array<{
    stage: string
    status: string
    input?: unknown
    tool: string
    result: unknown
    explanation: string
    output: unknown
    completedAt: string
    cycle?: number
  }>
  currentCycle?: number
  editorChat?: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    revisionId?: string
    revert?: boolean
    failed?: boolean
    scoreRejected?: boolean
    createdAt: string
  }>
  // Little fixes: the surgical line-edit thread and its undo stack, separate from the
  // heavy editorChat/revisions pair above.
  quickFixChat?: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    fixId?: string
    edits?: Array<{ find: string; replace: string; why?: string }>
    skipped?: Array<{ find: string; why?: string; reason: string }>
    revert?: boolean
    failed?: boolean
    createdAt: string
  }>
  quickFixes?: Array<{
    id: string
    instruction: string
    applied?: Array<{ find: string; replace: string; why?: string }>
    skipped?: Array<{ find: string; why?: string; reason: string }>
    wordCountBefore: number
    wordCountAfter: number
    wordpressSynced: boolean
    appliedToLive: boolean
    revertedAt: string | null
    createdAt: string
  }>
  revisions?: Array<{
    id: string
    instruction: string
    status?: 'applied' | 'rejected'
    appliedDespiteScoreDrop?: boolean
    scoreFloor?: number | null
    wordCountBefore: number
    wordCountAfter: number
    seoScoreBefore: number | null
    seoScoreAfter: number | null
    wordpressSynced: boolean
    appliedToLive: boolean
    revertedAt: string | null
    createdAt: string
  }>
  toolCallsUsed: string[]
  approval: {
    opportunity: boolean
    brief: boolean
    article: boolean
    publish: boolean
  }
  errors: string[]
  createdAt: string
  updatedAt: string
}

export type ContentIntegrationMap = Record<string, {
  label: string
  status: 'connected' | 'not_configured' | 'partially_configured'
}>

export type CompanyFile = {
  id: string
  title: string
  originalFilename: string
  sizeBytes: number
  pageCount: number
  sourceType: string
  approvalStatus: string
  recordCount: number
  createdAt: string
  updatedAt: string
  brainPageCount: number
  brainIngestedAt: string | null
}

// Starts the Surfer pass on a chat-written article. Returns immediately with a
// run id — guidelines take minutes — and the caller polls getContentOperationsRun.
export function startContentOperationsSeoPass(payload: {
  article: string
  title?: string
  primaryKeyword?: string
  guidance?: string
}) {
  return request<{ runId: string; status: string }>('/content-operations/seo-pass', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getContentOperationsRun(runId: string) {
  return request<ContentOperationsRun>(`/content-operations/runs/${encodeURIComponent(runId)}`)
}

export function getCompanyFiles() {
  return request<CompanyFile[]>('/company-files')
}

// Raw bytes with the name in headers — the backend uses express.raw, so this
// must not be wrapped in FormData.
export async function uploadCompanyFile(file: File) {
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'x-file-name': encodeURIComponent(file.name).replace(/%20/g, ' '),
    'x-file-type': file.type || 'application/octet-stream',
  })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE_URL}/company-files`, {
    method: 'POST',
    headers,
    body: await file.arrayBuffer(),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || `Upload failed (${response.status}).`)
  return payload as { id: string; title: string; pageCount: number; sizeBytes: number; replaced: boolean }
}

export type BrainIngestResult = {
  documentId: string
  title: string
  written: { slug: string; title: string }[]
  skipped: { title: string; reason: string }[]
}

// Splits an uploaded document into brain pages that every agent can retrieve.
export function ingestCompanyFileToBrain(id: string, sensitivity: 'internal' | 'public' = 'internal') {
  return request<BrainIngestResult>(`/company-files/${encodeURIComponent(id)}/ingest`, {
    method: 'POST',
    body: JSON.stringify({ sensitivity }),
  })
}

export function deleteCompanyFile(id: string) {
  return request<{ deletedRecords: number }>(`/company-files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export type ProductImage = {
  name: string
  sizeBytes: number
  updatedAt: string
  isReference: boolean
  description: string
}

export function listProductImages() {
  return request<{ images: ProductImage[]; reference: string }>('/product-images')
}

// The thumbnail source. Cache-busted on the caller's side because replacing an
// image keeps its name, and the browser would otherwise keep showing the old one.
export function productImageUrl(name: string, version = '') {
  const suffix = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${API_BASE_URL}/product-images/${encodeURIComponent(name)}/raw${suffix}`
}

export async function uploadProductImage(file: File) {
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'x-file-name': encodeURIComponent(file.name).replace(/%20/g, ' '),
  })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE_URL}/product-images`, {
    method: 'POST',
    headers,
    body: await file.arrayBuffer(),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || `Upload failed (${response.status}).`)
  return payload as { name: string; replaced: boolean; sizeBytes: number }
}

// The writer picks images by what they show, so an undescribed image is never
// offered to it. This is the field that puts one on the shelf.
export function describeProductImage(name: string, description: string) {
  return request<{ name: string; description: string }>(
    `/product-images/${encodeURIComponent(name)}/description`,
    { method: 'POST', body: JSON.stringify({ description }) },
  )
}

export function setProductImageReference(name: string) {
  return request<{ reference: string }>(`/product-images/${encodeURIComponent(name)}/reference`, { method: 'POST' })
}

export function deleteProductImage(name: string) {
  return request<{ name: string; deleted: boolean }>(`/product-images/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

// Artwork for a chat-authored draft. The draft has no run behind it, so the
// article text goes up with the request and the images come straight back.
export function generateContentOperationsDraftImages(payload: {
  article: string
  title?: string
  primaryKeyword?: string
}) {
  return request<{ images: Array<{
    role?: string
    url?: string
    altText?: string
    caption?: string
    placementAfterHeading?: string
  }> }>('/content-operations/draft-images', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getContentOperationsIntegrations() {
  return request<ContentIntegrationMap>('/content-operations/integrations')
}

export type ArticleKeywordFix = {
  id: string
  keyword: string
  find: string
  replace: string
  why: string
}

// Proposals only — the server applies nothing. The editor accepts each edit in
// the article panel, and that is the only thing that changes the draft.
export function proposeArticleKeywordFixes(payload: {
  article: string
  keywords: Array<{ keyword: string; volume: number | null; difficulty: number | null; position: number | null }>
}) {
  return request<{ fixes: ArticleKeywordFix[] }>('/content-operations/article/keyword-fixes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function proposeArticleSurferFixes(payload: {
  article: string
  guidelines: { targetWordCount?: number | null; questions?: string[] }
  gaps: Array<{ term: string; used: number; target: number; heading: boolean }>
}) {
  return request<{ fixes: ArticleKeywordFix[]; words: number; targetWords: number | null }>(
    '/content-operations/article/surfer-fixes',
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function getContentOperationsRuns() {
  return request<ContentOperationsRun[]>('/content-operations/runs')
}

export function createContentOperationsRun(payload: {
  targetDomain: string
  requestType: string
  userInstructions: string
  workflowMode: ContentOperationsRun['workflowMode']
  researchOnly: boolean
  keywordListId?: string
}) {
  return request<ContentOperationsRun>('/content-operations/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function stopContentOperationsRun(runId: string) {
  return request<ContentOperationsRun>(`/content-operations/runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
  })
}

export function restartContentOperationsRun(runId: string) {
  return request<ContentOperationsRun>(`/content-operations/runs/${encodeURIComponent(runId)}/restart`, {
    method: 'POST',
  })
}

export function approveContentOperationsGate(
  runId: string,
  payload: {
    gate: 'opportunity' | 'brief' | 'article'
    opportunityId?: string
    brief?: Record<string, unknown>
  },
) {
  return request<ContentOperationsRun>(`/content-operations/runs/${encodeURIComponent(runId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function reviseContentOperationsArticle(
  runId: string,
  payload: {
    instruction: string
    research: boolean
    regenerateImages: boolean
    reoptimize: boolean
    enforceScoreFloor: boolean
    applyToLive: boolean
  },
) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/revise`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function applyContentOperationsQuickFix(
  runId: string,
  payload: { instruction: string; applyToLive?: boolean },
) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/quick-fix`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function revertContentOperationsQuickFix(
  runId: string,
  payload: { fixId: string; applyToLive?: boolean },
) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/quick-fix-revert`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function applyContentOperationsRevision(
  runId: string,
  payload: { revisionId: string; applyToLive: boolean },
) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/apply-revision`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function revertContentOperationsRevision(
  runId: string,
  payload: { revisionId: string; applyToLive: boolean },
) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/revert`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export function publishContentOperationsTestPost(runId: string) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/test-publish`,
    { method: 'POST' },
  )
}

export function createContentOperationsWordPressDraft(runId: string) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/wordpress-draft`,
    { method: 'POST' },
  )
}

// Sitemap automation. Yoast builds the sitemap; the backend verifies a published
// URL is in it and re-submits it to Google Search Console so the change is
// crawled promptly. The status call reads the live sitemap, so it takes a moment.
export type SitemapRefreshResult = {
  sitemapUrl: string
  reason: string
  urls: string[]
  ok: boolean
  summary: string
  verification: {
    reachable: boolean
    httpStatus?: number
    totalUrls?: number
    latestLastmod?: string
    found: Array<{ url: string; lastmod: string }>
    missing: string[]
    cachedStale: boolean
    error?: string
  } | null
  searchConsole: { submitted: boolean; reason?: string; error?: string; submittedAt?: string } | null
  indexNow: { notified: boolean; count?: number; reason?: string; error?: string } | null
  startedAt: string
  finishedAt?: string
}

export type SitemapStatus = {
  sitemapUrl: string
  reachable: boolean
  httpStatus: number
  error: string
  totalUrls: number
  latestLastmod: string
  children: Array<{ loc: string; lastmod: string; urlCount: number }>
  searchConsole: {
    configured: boolean
    siteUrl?: string
    lastSubmitted?: string
    lastDownloaded?: string
    isPending?: boolean
    errors?: number
    warnings?: number
    submittedUrls?: number
    indexedUrls?: number
    error?: string
  }
  indexNow: { configured: boolean }
  watcher: { enabled: boolean; intervalMs: number; lastRunAt: string; lastResult: string }
  recent: Array<{ at: string; reason: string; ok: boolean; summary: string; urls: string[] }>
}

export function getSitemapStatus() {
  return request<SitemapStatus>('/content-operations/integrations/sitemap/status')
}

export function refreshSitemap(payload: { urls?: string[]; scanWordPress?: boolean } = {}) {
  return request<SitemapRefreshResult>('/content-operations/integrations/sitemap/refresh', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function publishContentOperationsWordPress(runId: string) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/wordpress-publish`,
    { method: 'POST' },
  )
}

export function deleteContentOperationsWordPressDraft(runId: string) {
  return request<ContentOperationsRun>(
    `/content-operations/runs/${encodeURIComponent(runId)}/wordpress-draft`,
    { method: 'DELETE' },
  )
}

// Phase 3 publishing for a chat-authored article. The draft is held in the browser,
// so it is sent up with the call rather than read from a run the backend already has.
export type ContentPublishState = {
  runId: string
  postId: number | null
  status: string
  published: boolean
  title: string
  slug: string
  url: string
  editorUrl: string
}

export function createContentPublishWordPressDraft(payload: {
  article: string
  images?: unknown[]
  runId?: string
  title?: string
}) {
  return request<ContentPublishState>('/content-operations/publish/wordpress-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getContentPublishState(runId: string) {
  return request<ContentPublishState>(`/content-operations/publish/state/${encodeURIComponent(runId)}`)
}

export function deleteContentOperationsRun(runId: string) {
  return request<{ runId: string; wordpressAction: 'none' | 'trashed_draft' | 'left_published' }>(
    `/content-operations/runs/${encodeURIComponent(runId)}`,
    { method: 'DELETE' },
  )
}

export function getContentOperationsBlogPosts() {
  return request<ContentOperationsRun[]>('/content-operations/blog')
}

export async function downloadContentOperationsPdf(runId: string) {
  const result = await request<{ url: string }>(
    `/content-operations/runs/${encodeURIComponent(runId)}/pdf-link`,
    { method: 'POST' },
  )
  window.location.assign(`${API_BASE_URL}${result.url}`)
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
  isAdmin?: boolean
  role?: string
  title?: string
  phone?: string
  userType?: User['userType']
  onboardingFlow?: User['onboardingFlow']
  agencyName?: string
  agencyType?: string
  city?: string
  state?: string
  department?: string
  accessScope?: User['accessScope']
  grantProjectFocus?: string
  targetGrantTypes?: string[]
  promptVariables?: Partial<User['promptVariables']>
  status?: User['status']
}) {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateUser(userId: string, payload: Partial<User>) {
  return request<User>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function uploadGrantApplication(userId: string, file: File) {
  const headers = new Headers()
  headers.set('Content-Type', file.type || 'application/octet-stream')
  headers.set('X-File-Name', encodeURIComponent(file.name || 'grant-application-upload'))

  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/grant-applications`, {
      method: 'POST',
      headers,
      body: file,
    })

    if (response.status === 401 && accessTokenProvider) {
      const refreshedToken = await accessTokenProvider(true)
      if (refreshedToken) {
        headers.set('Authorization', `Bearer ${refreshedToken}`)
      }

      response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/grant-applications`, {
        method: 'POST',
        headers,
        body: file,
      })
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Trusted Tech Hub API is unavailable at ${API_BASE_URL}. Start the backend and try again.`)
    }

    throw error
  }

  if (!response.ok) {
    const body = await response.text()
    let message = body.trim()

    try {
      const parsed = JSON.parse(body) as ApiErrorPayload
      if (parsed.message) {
        message = parsed.message
      }
    } catch {
      // Keep the raw response text when the API returns a non-JSON upload error.
    }

    throw new Error(message || `Upload failed with ${response.status}`)
  }

  return response.json() as Promise<User>
}

export function generateUploadedGrantApplicationResponse(userId: string, uploadId: string) {
  return request<UploadedGrantApplicationDraftResponse>(
    `/users/${encodeURIComponent(userId)}/grant-applications/${encodeURIComponent(uploadId)}/generate-response`,
    {
      method: 'POST',
    },
  )
}

export function deleteUser(userId: string) {
  return request<{ user: User }>(`/users/${userId}`, {
    method: 'DELETE',
  })
}

export function getAdminAccess() {
  return request<{
    allowed: boolean
    user: {
      id: string
      email: string
    }
  }>('/admin/access')
}

export function getAdminUsers() {
  return request<User[]>('/admin/users')
}

export function createAdminUser(payload: {
  name: string
  email: string
  isAdmin?: boolean
  role?: string
  title?: string
  phone?: string
  userType?: User['userType']
  onboardingFlow?: User['onboardingFlow']
  agencyName?: string
  agencyType?: string
  city?: string
  state?: string
  department?: string
  accessScope?: User['accessScope']
  grantProjectFocus?: string
  targetGrantTypes?: string[]
  promptVariables?: Partial<User['promptVariables']>
  status?: User['status']
}) {
  return request<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminUser(userId: string, payload: Partial<User>) {
  return request<User>(`/admin/users/${userId}`, {
    method: 'PATCH',
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

// A file/image the user attached to a chat message. `dataBase64` may be a bare
// base64 string or a full `data:<mime>;base64,…` URI.
export type ChatAttachment = {
  name: string
  mimeType: string
  dataBase64: string
}

export function sendAgentChat(
  agentId: string,
  messages: AgentChatMessage[],
  competitor?: string,
  attachments?: ChatAttachment[],
) {
  const body: {
    messages: AgentChatMessage[]
    competitor?: string
    attachments?: ChatAttachment[]
  } = { messages }
  // `competitor` scopes GBrain memory retrieval to one competitor section.
  if (competitor) body.competitor = competitor
  // Attachments (PDF/Word/text extracted to text; images sent for vision).
  if (attachments?.length) body.attachments = attachments

  return request<AgentChatResponse>(
    `/agents/${agentId}/chat`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    // HubSpot (Hermes → HubSpot) and vision/extraction can be slow; bound it so
    // the UI fails cleanly instead of hanging, while the conversation stays saved.
    { timeoutMs: 180000 },
  )
}

// Streaming chat over Server-Sent Events. Calls onDelta(text) as tokens arrive
// and resolves with the final message once the stream ends. No client-side
// timeout — the backend's heartbeat + stream keep the connection alive so long
// tool-heavy (HubSpot) answers don't hit a fixed cap.
export async function streamAgentChat(
  agentId: string,
  messages: AgentChatMessage[],
  handlers: { onDelta: (text: string) => void; signal?: AbortSignal },
  competitor?: string,
  attachments?: ChatAttachment[],
): Promise<AgentChatResponse> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const streamBody: { messages: AgentChatMessage[]; competitor?: string; attachments?: ChatAttachment[] } = { messages }
  if (competitor) streamBody.competitor = competitor
  if (attachments?.length) streamBody.attachments = attachments

  const response = await fetch(`${API_BASE_URL}/agents/${agentId}/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(streamBody),
    signal: handlers.signal,
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    let messageText = body.trim() || `Streaming request failed (${response.status}).`
    try {
      const parsed = JSON.parse(body) as ApiErrorPayload
      if (parsed.message) messageText = parsed.message
    } catch {
      // non-JSON error body — keep as-is
    }
    throw new Error(messageText)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamError: string | null = null
  let final: AgentChatResponse | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary: number
    // SSE events are separated by a blank line.
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue // ':' comment lines are heartbeats
        const payload = trimmed.slice(5).trim()
        if (!payload) continue
        let evt: { delta?: string; error?: string; done?: boolean; message?: AgentChatMessage; meta?: unknown }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue
        }
        if (typeof evt.delta === 'string') handlers.onDelta(evt.delta)
        else if (evt.error) streamError = evt.error
        else if (evt.done && evt.message) final = { message: evt.message, meta: evt.meta as AgentChatResponse['meta'] }
      }
    }
  }

  if (streamError) throw new Error(streamError)
  if (!final) throw new Error('The assistant stream ended unexpectedly. Your chat is saved — please try again.')
  return final
}

export function getWordPressDraftPreview(postId: number) {
  return request<WordPressDraftPreview>(`/agents/wordpress-draft-editor/preview/${encodeURIComponent(postId)}`)
}

export function saveBrainMemory(proposal: BrainMemoryProposal) {
  return request<BrainMemoryResult>('/agents/trusted-tech-assistant/memory', {
    method: 'POST',
    body: JSON.stringify({ proposal, confirmed: true }),
  })
}

export type CompetitorSectionMemory = {
  slug: string
  title: string
  model: string
  summary: string
}

export type CompetitorSectionMemories = {
  competitor: string
  status: 'ok' | 'disabled' | 'unavailable' | 'invalid'
  memories: CompetitorSectionMemory[]
}

// Loads the memory stored in a competitor's brain section (its BWC model spec pages).
export function getCompetitorSectionMemories(competitor: string) {
  return request<CompetitorSectionMemories>(
    `/agents/competitor-analyst/sections/${encodeURIComponent(competitor)}/memories`,
  )
}

export type BrainPage = {
  slug: string
  title: string
  sensitivity: string
  updatedAt: string
  summary: string
  content: string
}

export type BrainPages = {
  status: 'ok' | 'disabled' | 'unavailable'
  memories: BrainPage[]
}

// Every page in the brain the signed-in user is allowed to see. One brain — no
// section filter.
export function getBrainPages() {
  return request<BrainPages>('/agents/trusted-tech-assistant/brain/pages')
}

// Soft delete. GBrain keeps the page recoverable for 72 hours.
export function deleteBrainPage(slug: string) {
  return request<{ slug: string; title: string; recoverableHours: number }>(
    '/agents/trusted-tech-assistant/brain/pages',
    { method: 'DELETE', body: JSON.stringify({ slug }) },
  )
}

export type GbrainHealth = {
  status: 'ok' | 'unauthorized' | 'down' | 'disabled'
  transport: string
  pageCount: number | null
  error: string
  checkedAt: string
}

// Unauthenticated liveness probe. Retrieval fails soft, so this is the only way
// to tell a connected brain from one that is quietly returning nothing.
export async function getGbrainHealth() {
  const response = await fetch(`${API_BASE_URL}/health/gbrain`)
  return (await response.json()) as GbrainHealth
}

export type ResearchedBwcModel = {
  name: string
  category: string
  batteryLife: string
  resolution: string
  storage: string
  fieldOfView: string
  preRecord: string
  durability: string
  weight: string
  lowLight: string
  connectivity: string
  activation: string
  evidenceManagement: string
  price: string
  notes: string
  source: string
}

export type CompetitorWebsiteResearch = {
  competitor: string
  competitorName: string
  website: string
  pagesRead: string[]
  overview: string
  models: ResearchedBwcModel[]
}

// Reads the competitor's own website and extracts their BWC models + specs.
export function researchCompetitorWebsite(competitor: string) {
  return request<CompetitorWebsiteResearch>(
    `/agents/competitor-analyst/sections/${encodeURIComponent(competitor)}/research`,
    { method: 'POST' },
  )
}

// Saves an approved memory into a specific competitor's brain section. The memory
// is scoped to the Competitor Analyst agent (section) and tagged with the competitor.
export function saveCompetitorMemory(proposal: CompetitorMemoryProposal) {
  return request<BrainMemoryResult>('/agents/competitor-analyst/memory', {
    method: 'POST',
    body: JSON.stringify({
      proposal: { ...proposal, section: 'competitor-analyst' },
      confirmed: true,
    }),
  })
}

export function getChatThreads(agentId?: string, competitor?: string) {
  const search = new URLSearchParams()

  if (agentId) {
    search.set('agentId', agentId)
  }

  // Sub-scope within an agent (e.g. one competitor section of the Competitor
  // Analyst). Omitted for agents whose threads aren't subdivided.
  if (competitor) {
    search.set('competitor', competitor)
  }

  const query = search.toString()

  return request<ChatThreadSummary[]>(`/chat-threads${query ? `?${query}` : ''}`, {
  })
}

// Full thread (with messages) — fetched lazily when the user opens a saved chat.
export function getChatThread(threadId: string) {
  return request<ChatThread>(`/chat-threads/${threadId}`)
}

export function createChatThread(
  payload: {
    agentId: string
    competitor?: string
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
    competitor?: string
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

export function deleteChatThread(threadId: string) {
  return request<{ _id: string }>(`/chat-threads/${threadId}`, {
    method: 'DELETE',
  })
}

export function captureBrowserResearchPage(payload: { url: string; objective?: string }) {
  return request<BrowserCaptureResponse>('/browser-research/capture-page', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getSamGovOpportunities() {
  return request<Opportunity[]>('/rfp-opportunities')
}

export function getSamGovOpportunity(noticeId: string) {
  return request<Opportunity>(`/rfp-opportunities/${encodeURIComponent(noticeId)}`)
}

export function deleteSamGovOpportunity(noticeId: string) {
  return request<{ opportunity: Opportunity }>(`/rfp-opportunities/${encodeURIComponent(noticeId)}`, {
    method: 'DELETE',
  })
}

export function searchSamGovWithBrowser(payload?: { daysBack?: number; keywords?: string[]; noticeTypes?: string[] }) {
  return request<SamGovBrowserSearchResponse>('/rfp-opportunities/browser-search', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function findFirstSamGovWithBrowser(payload?: { keyword?: string; instructions?: string; excludeNoticeIds?: string[] }) {
  return request<FirstSamGovBrowserOpportunityResponse>('/rfp-opportunities/browser-search/first', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function readSamGovOpportunityAttachments(noticeId: string) {
  return request<ReadOpportunityAttachmentsResponse>(`/rfp-opportunities/${encodeURIComponent(noticeId)}/attachments/read`, {
    method: 'POST',
  })
}

export function getPoliceGrantLeads() {
  return request<PoliceGrantLead[]>('/police-grant-leads')
}

export function surfPoliceGrantDatabase(payload?: {
  limit?: number
  instructions?: string
  excludeLeadIds?: string[]
  excludeAgencyKeys?: string[]
}) {
  return request<PoliceGrantSurfResponse>('/police-grant-leads/surf', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function deletePoliceGrantLead(leadId: string) {
  return request<{ lead: PoliceGrantLead }>(`/police-grant-leads/${encodeURIComponent(leadId)}`, {
    method: 'DELETE',
  })
}

export function getGrantOpportunities() {
  return request<GrantOpportunity[]>('/grant-opportunities')
}

export function searchGrantOpportunities(payload?: {
  limit?: number
  keywords?: string[]
  state?: string
  agencyType?: string
  projectType?: string
  sourceUrls?: string[]
}) {
  return request<GrantOpportunitySearchResponse>('/grant-opportunities/search', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function discoverGrantOpportunities(payload: {
  state: string
  stateCode?: string
  userProfile: {
    organizationName?: string
    organizationType?: string
    state?: string
    serviceArea?: string
    projectNeeds?: string[]
    knownNeeds?: string
    grantRequirements?: string
  }
}) {
  return request<GrantDiscoveryResponse>('/grant-opportunities/discover', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function generateGrantResponse(opportunityId: string, payload: {
  userId: string
  applicationQuestions?: GrantApplicationQuestionsResponse
}) {
  return request<GrantApplicationDraftResponse>(`/grant-opportunities/${encodeURIComponent(opportunityId)}/generate-response`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function readGrantApplicationQuestions(opportunityId: string) {
  return request<GrantApplicationQuestionsResponse>(`/grant-opportunities/${encodeURIComponent(opportunityId)}/read-application-questions`, {
    method: 'POST',
  })
}

export function deleteGrantOpportunity(opportunityId: string) {
  return request<{ opportunity: GrantOpportunity }>(`/grant-opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'DELETE',
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

export function openTwitterSession(payload?: { url?: string }) {
  return request<LinkedInBrowserSessionResponse>('/twitter-surfer/open-session', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function getTwitterScreenshot() {
  return request<BrowserScreenshotResponse>('/twitter-surfer/screenshot', {
    method: 'POST',
  })
}

export function getTwitterConnectionStatus() {
  return request<TwitterConnectionStatus>('/twitter-surfer/connection-status')
}

export function getTwitterSurferRuns() {
  return request<ResearchRun[]>('/twitter-surfer/runs')
}

export function getTwitterSurferTaskRuns() {
  return request<TwitterSurferTaskRun[]>('/twitter-surfer/task-runs')
}

export function getTwitterSurferTaskRun(runId: string) {
  return request<TwitterSurferTaskRun>(`/twitter-surfer/task-runs/${encodeURIComponent(runId)}`)
}

export function startTwitterSurferTaskRun(payload: { task: string; durationMinutes?: number }) {
  return request<TwitterSurferTaskRun>('/twitter-surfer/task-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function stopTwitterSurferTaskRun(runId: string) {
  return request<TwitterSurferTaskRun>(`/twitter-surfer/task-runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
  })
}

export function searchTwitterPosts(payload: { keyword: string; filter?: string }) {
  return request<TwitterPostCaptureResponse>('/twitter-surfer/search-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function runTwitterSurfer(payload?: { searches?: string[]; filter?: string }) {
  return request<TwitterSurferSyncResponse>('/twitter-surfer/sync', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export type BrevoList = {
  id: number
  name: string
  folderId?: number
  contactCount: number
}

export type BrevoSender = {
  id: number
  name: string
  email: string
  active: boolean
}

export function fetchBrevoLists() {
  return request<BrevoList[]>('/brevo/lists')
}

export function fetchBrevoSenders() {
  return request<BrevoSender[]>('/brevo/senders')
}

export function createBrevoCampaign(payload: {
  name?: string
  subject: string
  senderName: string
  senderEmail: string
  htmlContent: string
  listIds: number[]
}) {
  return request<{ id: number }>('/brevo/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function sendBrevoTest(campaignId: number, emails: string[]) {
  return request<{ sent: boolean }>(`/brevo/campaigns/${campaignId}/test`, {
    method: 'POST',
    body: JSON.stringify({ emails }),
  })
}

export function sendBrevoCampaign(campaignId: number) {
  return request<{ sent: boolean }>(`/brevo/campaigns/${campaignId}/send`, {
    method: 'POST',
  })
}

export function sendBrevoDirect(payload: {
  subject: string
  senderName: string
  senderEmail: string
  htmlContent: string
  to: string[]
}) {
  return request<{ sent: boolean }>('/brevo/send-direct', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type LeAgencyEmployment = {
  swornOfficers: number | null
  civilians: number | null
  totalEmployees: number | null
  dataYear: number | null
}

export type LeAgency = {
  _id: string
  ori: string
  agencyName: string
  agencyType: string
  state: string
  stateName: string
  county: string
  latitude: number | null
  longitude: number | null
  employment?: LeAgencyEmployment
  contacts?: {
    chiefName: string
    chiefTitle: string
    phone: string
    email: string
    website: string
    streetAddress?: { line1: string; city: string }
  }
  surveillance?: {
    bwc?: {
      status?: string
      trustedResearched?: string
      trustedResearchedBy?: string
      trustedResearchedAt?: string | null
      evidence?: string
      vendor?: string
      asOf?: string | null
      evidenceUrl?: string
      summary?: string
      contractEnd?: string | null
    }
  }
  crm?: { matched?: boolean; stage?: string }
}

export type LeAgencyFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    ori: string
    name: string
    agencyType: string
    state: string
    county: string
    swornOfficers: number | null
    dataYear: number | null
    website: string
    phone: string
    inPipeline: boolean
    stage: string
    stageRank: number | null
    dealCount: number
    dealOwner: string
    // rooftop | street | city | county | fbi - how the point was placed.
    precision: string
    locationSource: string
    approximate: boolean
    streetAddress: string
    addressCity: string
    email: string
    chiefName: string
    chiefTitle: string
    chiefSourceUrl: string
    commandStaff: Array<{ name: string; title: string }>
    // Body-worn camera documented by the Atlas of Surveillance. `bwcVendor` is
    // blank on most of them - that means the vendor was never published, not
    // that the agency runs no vendor.
    hasBwc: boolean
    // Our own research verdict: 'has_bwc' | 'no_bwc' | '' (never looked).
    // Outranks bwcStatus for colouring, because it is the one we stand behind.
    bwcTrusted: string
    // 'research' or 'manual' - who established it.
    bwcTrustedBy: string
    // yes | no | unknown. 'no' comes only from a source that asked the agency.
    bwcStatus: string
    // observed | surveyed | funded | mandated - how strong the claim is.
    bwcEvidence: string
    bwcAsOf: string | null
    bwcDeclineReasons: string[]
    bwcVendor: string
    bwcEvidenceDate: string | null
    // Has an SDR logged a call to this agency. Sent as a summary, never the
    // log itself - the map only needs to know whether anyone has reached out.
    contacted?: boolean
    callCount?: number
    lastCalledAt?: string | null
    lastCallOutcome?: string
    isTest?: boolean
  }
}

export type LeAgencyStats = {
  totals: {
    agencies: number
    withCounts: number
    withCoords: number
    totalOfficers: number
    inPipeline: number
    countyProxies: number
    resolved: number
    withBwc: number
    withBwcVendor: number
  }
  byState: Array<{ _id: string; agencies: number; under100: number }>
  bySizeBand: Array<{ _id: number | string; agencies: number }>
  byStage: Array<{ _id: string; agencies: number; rank: number | null }>
}

export type LeAgencyQuery = {
  state?: string
  agencyType?: string
  minOfficers?: number
  maxOfficers?: number
  hasOfficerCount?: boolean
  search?: string
  limit?: number
  page?: number
  crm?: 'matched' | 'unmatched'
  stage?: string
  bwc?: boolean | 'unknown'
  bwcVendor?: string
  bwcEvidence?: string
}

function buildLeAgencyParams(query: LeAgencyQuery = {}) {
  const params = new URLSearchParams()
  if (query.state) params.set('state', query.state)
  if (query.agencyType) params.set('agencyType', query.agencyType)
  if (typeof query.minOfficers === 'number') params.set('minOfficers', String(query.minOfficers))
  if (typeof query.maxOfficers === 'number') params.set('maxOfficers', String(query.maxOfficers))
  if (query.hasOfficerCount) params.set('hasOfficerCount', 'true')
  if (query.crm) params.set('crm', query.crm)
  if (query.stage) params.set('stage', query.stage)
  if (query.bwc !== undefined) params.set('bwc', String(query.bwc))
  if (query.bwcVendor) params.set('bwcVendor', query.bwcVendor)
  if (query.bwcEvidence) params.set('bwcEvidence', query.bwcEvidence)
  if (query.search) params.set('search', query.search)
  if (typeof query.limit === 'number') params.set('limit', String(query.limit))
  if (typeof query.page === 'number') params.set('page', String(query.page))
  return params
}

/**
 * Set the trusted verdict by hand, for when research turns up nothing but you
 * know the answer anyway. Pass '' to clear it back to unchecked.
 */
export function setTrustedBwc(
  ori: string,
  value: 'has_bwc' | 'no_bwc' | '',
  options: { vendor?: string; note?: string } = {},
) {
  return request<{
    ori: string
    name: string
    trustedResearched: string
    trustedResearchedBy: string
    vendor: string
  }>(`/le-agencies/${encodeURIComponent(ori)}/trusted-bwc`, {
    method: 'PATCH',
    body: JSON.stringify({ value, ...options }),
  })
}

export type AgencySdr = {
  timeline: string
  money: string
  authority: string
  needs: string
  pain: string
  notes: string
  filledBy?: string
  filledAt?: string | null
}

/** Save the TMAN-P qualification. Shared per agency, not per user. */
export type HubSpotSyncResult = {
  companyId?: string
  contactId?: string
  // The timeline note carrying the whole form, and how many of the
  // qualification fields the portal let us write.
  noteId?: string
  propertiesWritten?: number
  contactSkipped?: string
  tool?: string
  error?: string
}

export function saveAgencySdr(ori: string, sdr: Partial<AgencySdr>) {
  return request<{ ori: string; name: string; sdr: AgencySdr; hubspot: HubSpotSyncResult | null }>(
    `/le-agencies/${encodeURIComponent(ori)}/sdr`,
    { method: 'PATCH', body: JSON.stringify(sdr) },
  )
}

/**
 * One logged call to an agency.
 *
 * Shared per agency like the qualification, and kept as a log rather than a
 * single record: the second call only makes sense next to the first.
 */
export type AgencyCall = {
  _id: string
  clientCallId: string
  calledAt: string
  contactName: string
  contactTitle: string
  phone: string
  outcome: string
  followUpAt: string | null
  notes: string
  loggedBy: string
  loggedAt: string
}

export type AgencyOutreach = {
  callCount: number
  lastCalledAt: string | null
  lastOutcome: string
  lastLoggedBy: string
}

type CallLogResponse = {
  ori: string
  name: string
  calls: AgencyCall[]
  outreach: AgencyOutreach | null
  // Present on a save: the HubSpot Call activity the entry became, or why it
  // could not. The hub's log is saved either way.
  hubspot?: { callId: string; ownerId: string; loggedBy: string } | { error: string } | null
}

/** Every call logged against an agency, newest first. */
export function getAgencyCallLog(ori: string) {
  return request<CallLogResponse>(`/le-agencies/${encodeURIComponent(ori)}/call-log`)
}

/**
 * Add a call to the log. Appends - it never overwrites an earlier call.
 *
 * `clientCallId` is minted by the caller so a retried save (a flaky
 * connection, a double click) updates the same entry - and the same HubSpot
 * Call - instead of logging the call twice. The server refuses a save without one.
 */
export function addAgencyCall(ori: string, call: Partial<AgencyCall> & { clientCallId: string }) {
  return request<CallLogResponse>(`/le-agencies/${encodeURIComponent(ori)}/call-log`, {
    method: 'POST',
    body: JSON.stringify(call),
  })
}

/** Remove a mis-logged call, so the map stops showing the agency as contacted. */
export function deleteAgencyCall(ori: string, callId: string) {
  return request<CallLogResponse>(
    `/le-agencies/${encodeURIComponent(ori)}/call-log/${encodeURIComponent(callId)}`,
    { method: 'DELETE' },
  )
}

/**
 * Wipe the whole log, putting the pin back to its camera colour.
 *
 * Distinct from deleting entries one by one: this is "we never worked this
 * agency", not "that entry was wrong".
 */
export function clearAgencyCallLog(ori: string) {
  return request<CallLogResponse>(`/le-agencies/${encodeURIComponent(ori)}/call-log`, {
    method: 'DELETE',
  })
}

/**
 * Call activity across a whole territory over a date range.
 *
 * The per-agency call log answers "what happened at this department"; this
 * answers "what happened this week", which is the question a territory gets
 * managed by. Scoped by whatever the map is currently filtered to.
 */
export type CallReport = {
  period: { from: string; to: string; days: number; timezone: string }
  totals: {
    calls: number
    agenciesCalled: number
    agenciesInScope: number
    firstContacts: number
    reps: number
    conversations: number
    decisionMakers: number
    gatekeepers: number
    voicemails: number
    noAnswer: number
    callbacks: number
    notInterested: number
    badNumbers: number
    followUps: number
    unlabelled: number
    days: number
    callsPerDay: number
    connectRate: number
  }
  byOutcome: { outcome: string; calls: number; agencies: number }[]
  byDay: { date: string; calls: number; agencies: number; conversations: number }[]
  byState: { state: string; calls: number; agencies: number; conversations: number }[]
  byRep: { rep: string; calls: number; agencies: number; conversations: number; decisionMakers: number }[]
  topAgencies: {
    ori: string
    name: string
    state: string
    county: string
    calls: number
    conversations: number
    lastCalledAt: string | null
  }[]
  followUps: {
    ori: string
    name: string
    state: string
    followUpAt: string
    outcome: string
    contactName: string
    loggedBy: string
  }[]
  scopeLabel: string
}

export type CallReportRange = {
  /** Bare `YYYY-MM-DD`; the server reads both ends as whole days in `timezone`. */
  from: string
  to: string
  timezone?: string
}

/** The browser's own zone, so "calls on the 10th" means the 10th where the SDR sits. */
const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The figures alone, for the preview in the report dialog. */
export function getCallReport(range: CallReportRange, filters: LeAgencyQuery = {}) {
  const params = buildLeAgencyParams(filters)
  params.set('from', range.from)
  params.set('to', range.to)
  params.set('timezone', range.timezone || localZone())
  return request<CallReport>(`/le-agencies/call-report?${params.toString()}`)
}

/**
 * The same period as a PDF, with a summary written by Hermes.
 *
 * Its own fetch rather than `request`, because that helper parses JSON and this
 * returns a binary body. No timeout: Hermes reads every call note in the period
 * before he writes anything, and cutting him off at thirty seconds would fail
 * the download precisely on the weeks with the most to say.
 */
export async function downloadCallReportPdf(
  range: CallReportRange,
  filters: LeAgencyQuery = {},
  options: { narrative?: boolean } = {},
) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE_URL}/le-agencies/call-report/pdf`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filters: Object.fromEntries(buildLeAgencyParams(filters)),
      from: range.from,
      to: range.to,
      timezone: range.timezone || localZone(),
      narrative: options.narrative !== false,
    }),
  })
  if (!response.ok) {
    // The API reports failures as JSON even on this binary endpoint, so unwrap
    // it rather than showing the reader a brace-wrapped payload.
    const body = await response.text().catch(() => '')
    let detail = body
    try {
      detail = (JSON.parse(body) as ApiErrorPayload).message || body
    } catch {
      detail = body
    }
    throw new Error(detail || `Could not build the report (${response.status}).`)
  }

  const blob = await response.blob()
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    'call-activity.pdf'
  // Anchor-click rather than window.open: a blob URL opened as a tab is blocked
  // by the popup blocker, and this keeps the server's filename.
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return name
}

/** Send your traveller to a named agency. */
export function moveTraveller(ori: string) {
  return request<{ ori: string; name: string; state: string; county: string; lat: number; lon: number }>(
    '/le-agencies/traveller-position',
    { method: 'PUT', body: JSON.stringify({ ori }) },
  )
}

/** One agency, in full. Used for the card the traveller shows. */
export function getLeAgency(ori: string) {
  return request<LeAgency>(`/le-agencies/${encodeURIComponent(ori)}`)
}

export function getLeAgencies(query: LeAgencyQuery = {}) {
  const params = buildLeAgencyParams(query)
  return request<{ total: number; page: number; limit: number; agencies: LeAgency[] }>(
    `/le-agencies?${params.toString()}`,
    undefined,
    { timeoutMs: 60000 },
  )
}

export function getLeAgencyGeojson(query: LeAgencyQuery = {}) {
  const params = buildLeAgencyParams(query)
  return request<{ type: 'FeatureCollection'; features: LeAgencyFeature[] }>(
    `/le-agencies/geojson?${params.toString()}`,
    undefined,
    // The full national pull is a large payload, so allow it real time to land.
    { timeoutMs: 120000 },
  )
}

export function getLeAgencyStats(query: LeAgencyQuery = {}) {
  const params = buildLeAgencyParams(query)
  return request<LeAgencyStats>(`/le-agencies/stats?${params.toString()}`, undefined, {
    timeoutMs: 60000,
  })
}

export type ResearchRunPreview = {
  matched: number
  alreadyDone: number
  /** How many could be researched under these filters, before any cap. */
  eligible: number
  /** How many this run would actually visit - `eligible`, or the cap if smaller. */
  queue: number
  limit: number | null
  offMap: number
  includeOffMap: boolean
  needEmail: number
  needPhone: number
  perAgency: { low: number; high: number }
  cost: { low: number; high: number }
  hours: { serial: number; concurrent3: number }
  searchesPerAgency: { low: number; high: number }
}

/**
 * Price a research run without starting one. Takes the same query the map is
 * already showing, so the run and the map can never quietly disagree.
 */
export function previewResearchRun(
  filters: LeAgencyQuery = {},
  options: { skipResearched?: boolean; includeOffMap?: boolean; limit?: number } = {},
) {
  // Encoded through buildLeAgencyParams rather than sent as a raw object: the
  // backend's filter builder reads query-string values, so `hasOfficerCount`
  // has to arrive as the string 'true', not a JSON boolean. Reusing the encoder
  // is what keeps a preview counting the same rows the map is drawing.
  const encoded = Object.fromEntries(buildLeAgencyParams(filters))
  return request<ResearchRunPreview>('/le-agencies/research-run/preview', {
    method: 'POST',
    body: JSON.stringify({
      filters: encoded,
      skipResearched: options.skipResearched !== false,
      includeOffMap: options.includeOffMap === true,
      limit: options.limit,
    }),
  })
}

/**
 * Download the run as a workbook.
 *
 * Its own fetch rather than `request`, because that helper parses JSON and this
 * returns a binary body. Same auth header as everything else.
 */
export async function downloadResearchRunWorkbook(
  filters: LeAgencyQuery = {},
  options: { skipResearched?: boolean; includeOffMap?: boolean; brief?: string } = {},
) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE_URL}/le-agencies/research-run/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filters: Object.fromEntries(buildLeAgencyParams(filters)),
      skipResearched: options.skipResearched !== false,
      includeOffMap: options.includeOffMap === true,
      brief: options.brief || '',
    }),
  })
  if (!response.ok) {
    throw new Error(`Could not build the spreadsheet (${response.status}).`)
  }

  const blob = await response.blob()
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    'research-run.xlsx'
  // Anchor-click rather than window.open: a blob URL opened as a tab is blocked
  // by the popup blocker, and this keeps the server's filename.
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return name
}

export type ResearchRunStop = {
  ori: string
  name: string
  state: string
  lat: number | null
  lon: number | null
  at: string | null
  verdict: string
  foundEmail: boolean
  foundPhone: boolean
  searches: number
  error: string
}

export type ResearchRunState = {
  id: string
  status: 'running' | 'stopping' | 'stopped' | 'done' | 'failed'
  brief: string
  filtersLabel: string
  total: number
  completed: number
  failed: number
  cursor: number
  searches: number
  foundCameras: number
  foundEmails: number
  foundPhones: number
  current: ResearchRunStop | null
  path: ResearchRunStop[]
  pathTruncated: boolean
  startedAt: string | null
  finishedAt: string | null
  lastError: string
}

/** One line in the runs menu: what a run was and how it went, without its rows. */
export type ResearchRunSummary = Pick<
  ResearchRunState,
  | 'id'
  | 'status'
  | 'brief'
  | 'filtersLabel'
  | 'total'
  | 'completed'
  | 'failed'
  | 'searches'
  | 'foundCameras'
  | 'foundEmails'
  | 'foundPhones'
  | 'startedAt'
  | 'finishedAt'
  | 'lastError'
> & { startedBy: string }

/** Every run there has been, newest first. Open to everyone who can see the map. */
export function listResearchRuns(limit = 50) {
  return request<ResearchRunSummary[]>(`/le-agencies/research-run?limit=${limit}`)
}

/**
 * The run everyone is watching. Global, not per user - there is one run and the
 * server owns it, so two people with the hub open see the same walker: the
 * traveller of whoever started it.
 */
export function getActiveResearchRun() {
  return request<ResearchRunState | { run: null }>('/le-agencies/research-run/active')
}

/**
 * Start a run. It lives in the server process, so it carries on after you close
 * the tab. `limit` is how you test: same targeting and prompt, fewer agencies.
 */
export function startResearchRun(
  filters: LeAgencyQuery = {},
  options: {
    skipResearched?: boolean
    includeOffMap?: boolean
    brief?: string
    limit?: number
  } = {},
) {
  return request<ResearchRunState>('/le-agencies/research-run/start', {
    method: 'POST',
    body: JSON.stringify({
      filters: Object.fromEntries(buildLeAgencyParams(filters)),
      skipResearched: options.skipResearched !== false,
      includeOffMap: options.includeOffMap === true,
      brief: options.brief || '',
      limit: options.limit,
    }),
  })
}

/**
 * Download a specific run's spreadsheet.
 *
 * By run id, not by filters: the run knows the exact agencies it queued, so the
 * sheet is what that run covered rather than whatever the form happens to say
 * now.
 */
export async function downloadRunWorkbook(runId: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  // Bounded, so a stalled request cannot leave the button spinning forever.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  let response: Response
  try {
    response = await fetch(
      `${API_BASE_URL}/le-agencies/research-run/${encodeURIComponent(runId)}/export`,
      { method: 'POST', headers, signal: controller.signal },
    )
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('The spreadsheet took too long to build. Try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`Could not build the spreadsheet (${response.status}).`)

  const blob = await response.blob()
  // Content-Disposition is only readable cross-origin when the server exposes
  // it, so keep a fallback that is still a usable name rather than a generic one.
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    `trustedtech_map_research_${new Date().toISOString().slice(0, 10)}.xlsx`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return name
}

/** One agency's row from a run's findings - the same row the spreadsheet carries. */
export type ResearchRunFindingRow = {
  ori: string
  agency: string
  type: string
  county: string
  state: string
  cameras: 'Yes' | 'No' | 'Planned' | 'Unknown' | 'Not researched'
  cameraSource: string
  reasoning: string
  caveat: string
  cameraUrl: string
  cameraAsOf: string | null
  confidence: string
  vendor: string
  contractEnd: string
  chief: string
  chiefTitle: string
  email: string
  contactUrl: string
  contactVerified: string | null
  phone: string
  website: string
  officers: number | null
  addedBy: string
}

export type ResearchRunFindings = {
  id: string
  status: ResearchRunState['status']
  brief: string
  filtersLabel: string
  total: number
  completed: number
  failed: number
  startedAt: string | null
  finishedAt: string | null
  rows: ResearchRunFindingRow[]
}

/**
 * A run's findings for the on-screen table. Open to everyone who can see the
 * map, unlike the spreadsheet download, and the full run rather than the trail
 * tail that the active-run poll returns.
 */
export function getResearchRunFindings(runId: string) {
  return request<ResearchRunFindings>(
    `/le-agencies/research-run/${encodeURIComponent(runId)}/findings`,
  )
}

/** Ask the run to stop. It finishes the agency in flight first. */
export function stopResearchRun() {
  return request<ResearchRunState>('/le-agencies/research-run/stop', { method: 'POST' })
}

export type CrmDealFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    dealId: string
    name: string
    stage: string
    owner: string
    state: string
    ori: string
    matchedAgencyName: string
    isLawEnforcement: boolean
    locationSource: string
    locationNote: string
  }
}

export type UnplacedDeal = {
  dealId: string
  dealName: string
  stage: string
  owner: string
  state: string
  locationNote: string
}

export function getCrmDealGeojson(query: { stage?: string; state?: string } = {}) {
  const params = new URLSearchParams()
  if (query.stage) params.set('stage', query.stage)
  if (query.state) params.set('state', query.state)
  return request<{ type: 'FeatureCollection'; features: CrmDealFeature[] }>(
    `/crm-deals/geojson?${params.toString()}`,
    undefined,
    { timeoutMs: 60000 },
  )
}

export type CrmDealStats = {
  total: number
  byStage: Array<{
    _id: string
    deals: number
    placed: number
    unplaced: number
    rank: number | null
  }>
}

/** Stage counts taken from the deals themselves, not from agencies matched to one. */
export function getCrmDealStats(query: { stage?: string; state?: string } = {}) {
  const params = new URLSearchParams()
  if (query.stage) params.set('stage', query.stage)
  if (query.state) params.set('state', query.state)
  return request<CrmDealStats>(`/crm-deals/stats?${params.toString()}`, undefined, {
    timeoutMs: 60000,
  })
}

export function getUnplacedCrmDeals(query: { stage?: string } = {}) {
  const params = new URLSearchParams()
  if (query.stage) params.set('stage', query.stage)
  return request<{ total: number; deals: UnplacedDeal[] }>(
    `/crm-deals/unplaced?${params.toString()}`,
    undefined,
    { timeoutMs: 60000 },
  )
}

export type BriefingSourcedItem = { text: string; url: string; date: string }

export type AgencyBriefing = {
  ori: string
  agencyName: string
  cached?: boolean
  searchCount?: number
  generatedAt?: string
  durationMs?: number
  sources: string[]
  facts: {
    agencyType: string
    state: string
    county: string
    swornOfficers: number | null
    civilians: number | null
    dataYear: number | null
    populationServed: number | null
    trend: null | {
      fromYear: number
      toYear: number
      fromOfficers: number
      toOfficers: number
      change: number
    }
    isNibrs: boolean
    crm: null | { stage: string; dealCount: number; owner: string }
  }
  research: {
    summary: string
    bwcStatus: {
      hasProgram: 'yes' | 'no' | 'unknown'
      vendor: string
      details: string
      // The citation. Required before a briefing may write its finding back
      // onto the agency, so it has to survive into the client type too.
      sourceUrl: string
      confidence: string
    }
    budget: { summary: string; fiscalYear: string; signals: BriefingSourcedItem[] }
    grants: BriefingSourcedItem[]
    news: BriefingSourcedItem[]
    outreachAngle: string
    openQuestions: string[]
    failedTopics?: string[]
  }
}

/** Where one person's traveller is standing, and whose he is. */
export type TravellerPerson = {
  key: string
  displayName: string
  mine: boolean
  // True while this person's research run is walking: their traveller is the
  // walker, and stands wherever the run currently is.
  ownsRun: boolean
  working: boolean
  at: { ori: string; name: string; state: string; county: string; lat: number; lon: number } | null
  // When this person last had the map open. Written at most once a minute.
  lastSeenAt: string | null
}

export type ResearchActivity = {
  now: string
  travellers: Array<{
    ori: string
    name: string
    state: string
    county: string
    startedAt: string | null
    lat: number
    lon: number
  }>
  // The caller's own traveller. Always present - opening the map is what
  // creates him - though `at` can be null if no agency could be found to stand on.
  me: TravellerPerson
  // Everyone else who has opened the map recently, wherever they left theirs.
  others: TravellerPerson[]
  completed: Array<{
    ori: string
    name: string
    lat: number
    lon: number
    bwcStatus: string
    bwcVendor: string
  }>
  remaining: number
}

/** The caller's traveller with the tail of the last conversation. */
export function getMyTraveller() {
  return request<TravellerPerson & { chat: Array<{ role: 'user' | 'assistant'; content: string; at: string }> }>(
    '/le-agencies/traveller',
  )
}

export type BwcResearchResult = {
  ori: string
  name: string
  status: string
  searches: number
  vendor: string
  confidence: string
  contractEnd: string
  sourceUrl: string
  quote: string
}

/**
 * Research one agency, reporting each search as it runs.
 *
 * Uses fetch rather than EventSource because EventSource cannot send an
 * Authorization header, and this route is behind auth like everything else.
 */
export async function streamBwcResearch(
  ori: string,
  handlers: {
    onSearch: (query: string) => void
    onDone: (result: BwcResearchResult) => void
    onFailed: (message: string) => void
    signal?: AbortSignal
  },
) {
  const headers = new Headers()
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(
    `${API_BASE_URL}/le-agencies/${encodeURIComponent(ori)}/research-stream`,
    { headers, signal: handlers.signal },
  )
  if (!response.ok || !response.body) {
    throw new Error(`Could not start research (${response.status}).`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1]
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1]
      if (!event || !dataLine) continue
      const data = JSON.parse(dataLine)
      if (event === 'search') handlers.onSearch(data.query)
      else if (event === 'done') handlers.onDone(data)
      else if (event === 'failed') handlers.onFailed(data.message)
    }
  }
}

export type TravellerChatReply = {
  reply: string
  // Set when he was asked to travel and the destination resolved to a real
  // agency, so the map can move him and fly there.
  moved: { ori: string; name: string; state: string; county: string; lat: number; lon: number } | null
  nearest: Array<{ ori: string; name: string; miles: number | null; bwcStatus: string }>
}

/** Chat with the traveller. Nearest agencies are resolved server-side from Mongo. */
export function travellerChat(body: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  lat: number
  lon: number
  // Which agency he is standing on. Without it "their website" is ambiguous
  // between everything within a few miles of him.
  ori?: string
}) {
  return request<TravellerChatReply>(
    '/le-agencies/traveller-chat',
    { method: 'POST', body: JSON.stringify(body) },
    { timeoutMs: 120000 },
  )
}

/** Small on purpose: polled every few seconds while a research run is going. */
export function getResearchActivity(params: { since?: string; state?: string } = {}) {
  const search = new URLSearchParams()
  if (params.since) search.set('since', params.since)
  if (params.state) search.set('state', params.state)
  return request<ResearchActivity>(`/le-agencies/research-activity?${search.toString()}`)
}

export function getAgencyBriefing(ori: string, options: { refresh?: boolean } = {}) {
  const params = new URLSearchParams()
  if (options.refresh) params.set('refresh', 'true')
  return request<AgencyBriefing>(
    `/le-agencies/${encodeURIComponent(ori)}/briefing?${params.toString()}`,
    undefined,
    // Four parallel web-research calls plus a writeup.
    { timeoutMs: 180000 },
  )
}

export type HermesSessionResult =
  | { status: 'ok'; email: string; expiresInMs: number }
  | { status: 'forbidden'; message: string }
  | { status: 'unavailable'; message: string }

/**
 * Mint the cookie the Orchestrator's iframe travels on.
 *
 * Deliberately a RELATIVE url, not API_BASE_URL: the cookie has to land on the
 * Hub's own origin, because that is the origin the iframe loads Hermes from. A
 * cookie set on the API's hostname would never be sent with the frame's
 * requests. In production the Hub's host routes /hermes-session through to the
 * backend; in dev the Vite proxy does.
 *
 * Only a 403 is a real refusal. Everything else that fails means the route is
 * not wired up -- a static host answers a POST it cannot route with 400/404/405
 * and an XML body, and reporting that as "you do not have access" sends whoever
 * sees it hunting through an allowlist for a problem that is not there.
 */
export async function startHermesSession(): Promise<HermesSessionResult> {
  const headers = new Headers()
  if (accessTokenProvider) {
    const token = await accessTokenProvider()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch('/hermes-session', {
      method: 'POST',
      headers,
      // Without this the Set-Cookie is dropped and every frame request 401s.
      credentials: 'include',
    })
  } catch {
    return { status: 'unavailable', message: 'The Hub could not reach /hermes-session.' }
  }

  const payload = await response.json().catch(() => null)

  if (response.status === 403) {
    return {
      status: 'forbidden',
      message: payload?.message || 'This account is not approved for the Hermes dashboard.',
    }
  }

  if (!response.ok || !payload?.ok) {
    return {
      status: 'unavailable',
      message:
        payload?.message ||
        `/hermes-session is not routed to the backend here (${response.status}).`,
    }
  }

  return { status: 'ok', email: payload.email, expiresInMs: payload.expiresInMs }
}
