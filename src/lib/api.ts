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
  // The brain "section" to save into: 'company' (readable by every agent) or a
  // specific agent id (scopes the memory so only that agent retrieves it).
  section: string
  sensitivity: 'internal' | 'public'
  source?: string
  // When set, update this existing memory in place (same GBrain page) instead of
  // creating a new one. Must be a memory in the same section.
  targetSlug?: string
}

export type BrainMemoryResult = {
  slug: string
  title: string
  department: string
  allowedAgents: string[]
  section: string
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
  } | null
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

export type BrainSectionMemory = {
  slug: string
  title: string
  sensitivity: string
  summary: string
  content: string
}

export type BrainSectionMemories = {
  section: string
  status: 'ok' | 'disabled' | 'unavailable'
  memories: BrainSectionMemory[]
}

// Loads a Brain "section": 'company' (memories readable by every agent) or an
// agent id (memories scoped to just that agent's section).
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

export function getBrainSectionMemories(section: string) {
  return request<BrainSectionMemories>(
    `/agents/trusted-tech-assistant/brain-sections/${encodeURIComponent(section)}/memories`,
  )
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
