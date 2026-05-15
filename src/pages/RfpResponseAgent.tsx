import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Collapse, Input, Segmented, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useParams } from 'react-router-dom'
import { getSamGovOpportunity, type Opportunity } from '../lib/api'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

type RequirementStatus = 'Covered' | 'Missing' | 'Needs Review'
type GenerationStatus = 'Generating' | 'Draft Ready' | 'Needs Review' | 'Approved'
type ReviewState = 'Draft' | 'Accepted' | 'Changes Requested'

type Requirement = {
  key: string
  requirement: string
  status: RequirementStatus
  confidence: string
  sourceSection: string
}

type SourceChunk = {
  documentName: string
  similarity: string
  preview: string
  retrievedAt: string
}

type ResponseSection = {
  id: string
  title: string
  body: string
  reviewState: ReviewState
  comments: string[]
  versions: string[]
  sources: SourceChunk[]
}

const fallbackOpportunity = {
  title: 'BODY-WORN CAMERA SOLUTION INDUSTRY DAY',
  agency: 'Federal Bureau of Prisons / Department of Justice',
  solicitationNumber: 'ID-2026-001_BWC',
  dueDate: 'Feb 23, 2026 10:00 AM EST',
  setAside: 'Not listed',
  summary:
    'This notice requests industry participation for commercially available body-worn camera solutions in a correctional environment, including digital evidence workflows, radio-triggered recording, and security/compliance considerations.',
  questionsDue: 'Not specified',
  proposalDue: 'Feb 23, 2026',
  remainingDays: 0,
}

function getRemainingDays(deadline: string) {
  const time = Date.parse(deadline)

  if (Number.isNaN(time)) {
    return 0
  }

  const diff = time - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function getOpportunitySummary(opportunity: Opportunity | null) {
  const description = opportunity?.rfpPackage?.description || opportunity?.descriptionLink || ''
  const cleanDescription = description.replace(/\s+/g, ' ').trim()

  if (cleanDescription) {
    return cleanDescription.length > 320 ? `${cleanDescription.slice(0, 320)}...` : cleanDescription
  }

  return fallbackOpportunity.summary
}

function buildOpportunityView(opportunity: Opportunity | null) {
  if (!opportunity) {
    return fallbackOpportunity
  }

  return {
    title: opportunity.title || fallbackOpportunity.title,
    agency: opportunity.agency || fallbackOpportunity.agency,
    solicitationNumber: opportunity.solicitationNumber || opportunity.noticeId || 'Unknown',
    dueDate: opportunity.responseDeadline || 'Unknown',
    setAside: opportunity.setAside || opportunity.rfpPackage?.originalSetAside || 'Not listed',
    summary: getOpportunitySummary(opportunity),
    questionsDue: 'Not specified',
    proposalDue: opportunity.responseDeadline || 'Unknown',
    remainingDays: getRemainingDays(opportunity.responseDeadline),
  }
}

const requirements: Requirement[] = [
  {
    key: 'cjis',
    requirement: 'CJIS-aligned evidence security controls',
    status: 'Needs Review',
    confidence: '72%',
    sourceSection: 'Demonstration Content',
  },
  {
    key: 'fedramp',
    requirement: 'FedRAMP documentation for cloud evidence workflows',
    status: 'Missing',
    confidence: '68%',
    sourceSection: 'Demonstration Content',
  },
  {
    key: 'radio',
    requirement: 'Radio interoperability to trigger recording events',
    status: 'Covered',
    confidence: '81%',
    sourceSection: 'Agency Interest Examples',
  },
  {
    key: 'devices',
    requirement: 'Body-worn camera devices and accessories for live demonstration',
    status: 'Covered',
    confidence: '93%',
    sourceSection: 'Demonstration Requirements',
  },
  {
    key: 'evidence',
    requirement: 'Digital evidence management system narrative',
    status: 'Covered',
    confidence: '88%',
    sourceSection: 'Purpose / Demonstration Content',
  },
]

const riskAlerts = [
  'FedRAMP documentation is not mapped to a confirmed Trusted Tech artifact.',
  'Pricing narrative has not been generated for this opportunity.',
  'Registration deadline has passed; use this record for training or future similar pursuits unless reopened.',
]

function getOpportunityText(opportunity: Opportunity | null) {
  return [
    opportunity?.title,
    opportunity?.agency,
    opportunity?.office,
    opportunity?.noticeType,
    opportunity?.setAside,
    opportunity?.naicsCode,
    opportunity?.classificationCode,
    opportunity?.rfpPackage?.description,
    opportunity?.rfpPackage?.attachmentsLinksText,
    opportunity?.attachmentsLinksText,
  ]
    .filter(Boolean)
    .join(' ')
}

function getRequirementStatus(haystack: string, patterns: string[]): RequirementStatus {
  return patterns.some((pattern) => haystack.includes(pattern)) ? 'Covered' : 'Needs Review'
}

function buildRequirements(opportunity: Opportunity | null): Requirement[] {
  if (!opportunity) {
    return requirements
  }

  const haystack = getOpportunityText(opportunity).toLowerCase()
  const sourceSection = opportunity.rfpPackage?.description ? 'Description' : 'SAM.gov package'

  return [
    {
      key: 'camera-solution',
      requirement: 'Body-worn camera solution fit',
      status: getRequirementStatus(haystack, ['body worn camera', 'body-worn camera', 'body camera', 'bwc']),
      confidence: '91%',
      sourceSection,
    },
    {
      key: 'digital-evidence',
      requirement: 'Digital evidence management workflow',
      status: getRequirementStatus(haystack, ['digital evidence', 'evidence management', 'dems']),
      confidence: '84%',
      sourceSection,
    },
    {
      key: 'security',
      requirement: 'Security/compliance documentation',
      status: getRequirementStatus(haystack, ['cjis', 'fedramp', 'security', 'privacy', 'encryption']) === 'Covered' ? 'Needs Review' : 'Missing',
      confidence: '67%',
      sourceSection,
    },
    {
      key: 'submission',
      requirement: 'Submission or registration instructions',
      status: getRequirementStatus(haystack, ['submit', 'registration', 'response date', 'proposal', 'quote']),
      confidence: '76%',
      sourceSection: opportunity.rfpPackage?.attachmentsLinksText ? 'Attachments/Links' : sourceSection,
    },
    {
      key: 'pricing',
      requirement: 'Pricing narrative or quote structure',
      status: getRequirementStatus(haystack, ['pricing', 'price', 'quote', 'cost']) === 'Covered' ? 'Needs Review' : 'Missing',
      confidence: '58%',
      sourceSection,
    },
  ]
}

function buildRiskAlerts(opportunity: Opportunity | null) {
  if (!opportunity) {
    return riskAlerts
  }

  const haystack = getOpportunityText(opportunity).toLowerCase()
  const alerts: string[] = []

  if (!opportunity.responseDeadline) {
    alerts.push('No proposal due date was captured from SAM.gov.')
  }

  if (!opportunity.attachmentLinks?.length && !opportunity.opportunityLinks?.length) {
    alerts.push('No public attachments or links were captured for this opportunity.')
  }

  if (haystack.includes('fedramp') && !haystack.includes('trusted tech fedramp')) {
    alerts.push('FedRAMP is mentioned, but supporting Trusted Tech documentation is not mapped yet.')
  }

  if (!haystack.includes('pricing') && !haystack.includes('price')) {
    alerts.push('Pricing narrative has not been generated for this opportunity.')
  }

  if (opportunity.active === 'No') {
    alerts.push('This opportunity appears inactive; use this workspace for training or future similar pursuits unless reopened.')
  }

  return alerts.length ? alerts : ['No major extraction risks identified yet. Validate requirements before generating a final response.']
}

const initialSections: ResponseSection[] = [
  {
    id: 'executive-summary',
    title: 'Executive Summary',
    reviewState: 'Draft',
    body:
      'Trusted Tech proposes a secure body-worn camera and digital evidence workflow designed for correctional environments where accountability, chain of custody, and operational simplicity matter. The response should position Trusted Tech as a practical partner for FBOP market research while clearly marking final compliance claims that require validation.',
    comments: ['Confirm whether Trusted Tech wants to lead with hardware, evidence management, or integrated ecosystem.'],
    versions: ['v1 generated from SAM.gov package', 'v0 source extraction loaded'],
    sources: [
      {
        documentName: 'BWC_Architecture_v4.pdf',
        similarity: '91%',
        preview: 'Architecture overview describing camera capture, secure upload, retention, and evidence review workflows.',
        retrievedAt: 'May 12, 2026 12:32 PM',
      },
      {
        documentName: 'DOJ_Proposal_2025.pdf',
        similarity: '84%',
        preview: 'Reusable DOJ-facing language for reliability, accountability, and support posture.',
        retrievedAt: 'May 12, 2026 12:32 PM',
      },
    ],
  },
  {
    id: 'technical-response',
    title: 'Technical Response',
    reviewState: 'Draft',
    body:
      'The technical response should describe the T500 body-worn camera workflow, evidence ingestion, role-based access, audit logging, secure retention, and optional integrations such as radio-triggered recording. Include clear placeholders for security certifications and deployment constraints that must be verified before submission.',
    comments: ['Add actual battery life, storage, device ruggedization, and radio integration details.'],
    versions: ['v1 generated from requirements table'],
    sources: [
      {
        documentName: 'T500_Product_Overview.docx',
        similarity: '89%',
        preview: 'Device capabilities, field operations, docking workflow, and support model.',
        retrievedAt: 'May 12, 2026 12:33 PM',
      },
      {
        documentName: 'CJIS_Response.docx',
        similarity: '77%',
        preview: 'Security controls and evidence access language requiring certification review.',
        retrievedAt: 'May 12, 2026 12:33 PM',
      },
    ],
  },
  {
    id: 'compliance-response',
    title: 'Compliance Response',
    reviewState: 'Changes Requested',
    body:
      'Known requirements should be mapped into a compliance matrix before any submission. CJIS and FedRAMP references require evidence-backed language only. Do not claim certification or authorization unless a Trusted Tech source document confirms it.',
    comments: ['Missing FedRAMP artifact. Ask leadership whether a partner cloud environment should be referenced.'],
    versions: ['v1 flagged missing evidence'],
    sources: [
      {
        documentName: 'CJIS_Response.docx',
        similarity: '86%',
        preview: 'Prior compliance response language for access control, auditability, and encryption.',
        retrievedAt: 'May 12, 2026 12:35 PM',
      },
    ],
  },
  {
    id: 'implementation-plan',
    title: 'Implementation Plan',
    reviewState: 'Draft',
    body:
      'For an industry day, the implementation plan should focus on demonstration readiness: device samples, offline slide deck, support staff, scripted use cases, evidence workflow demonstration, and follow-up materials for the contracting team.',
    comments: [],
    versions: ['v1 generated from event details'],
    sources: [
      {
        documentName: 'BWC_Demo_Playbook.pdf',
        similarity: '82%',
        preview: 'Suggested demonstration flow and field-ready proof points.',
        retrievedAt: 'May 12, 2026 12:36 PM',
      },
    ],
  },
  {
    id: 'pricing-narrative',
    title: 'Pricing Narrative',
    reviewState: 'Changes Requested',
    body:
      'Pricing is not requested in the industry day notice. Prepare a non-binding pricing posture only if leadership wants to discuss acquisition models. Use placeholders for device unit pricing, evidence storage tiers, support, and implementation services.',
    comments: ['Pricing model needed from leadership before any reusable language is approved.'],
    versions: ['v1 generated with pricing caveat'],
    sources: [
      {
        documentName: 'Pricing_Assumptions_Template.xlsx',
        similarity: '73%',
        preview: 'Reusable pricing components and assumptions that require current approval.',
        retrievedAt: 'May 12, 2026 12:37 PM',
      },
    ],
  },
  {
    id: 'support-maintenance',
    title: 'Support & Maintenance',
    reviewState: 'Draft',
    body:
      'Trusted Tech should describe device support, warranty handling, software updates, evidence platform administration, training, and escalation paths. Any SLA language should be reviewed before final approval.',
    comments: [],
    versions: ['v1 generated from support library'],
    sources: [
      {
        documentName: 'Support_Model_2026.docx',
        similarity: '88%',
        preview: 'Support tiers, training approach, issue escalation, and maintenance responsibilities.',
        retrievedAt: 'May 12, 2026 12:38 PM',
      },
    ],
  },
]

function buildResponseSections(opportunityView: typeof fallbackOpportunity): ResponseSection[] {
  return initialSections.map((section) => {
    if (section.id === 'executive-summary') {
      return {
        ...section,
        body: `Trusted Tech should prepare a focused response for ${opportunityView.title}. The draft should address ${opportunityView.agency}'s stated need, map known requirements from the extracted SAM.gov package, and clearly flag any compliance, pricing, or capability claims that require validation before approval.`,
        versions: [`v1 generated from ${opportunityView.solicitationNumber}`, 'v0 source extraction loaded'],
      }
    }

    if (section.id === 'technical-response') {
      return {
        ...section,
        body: `The technical response should be tailored to ${opportunityView.title}. Use the extracted opportunity package to describe the relevant body-worn camera, digital evidence, integration, deployment, support, and security capabilities. Any product specifications, certifications, or past performance claims must be backed by uploaded Trusted Tech source documents.`,
      }
    }

    if (section.id === 'compliance-response') {
      return {
        ...section,
        body: `Build the compliance response from the extracted requirements for ${opportunityView.solicitationNumber}. Mark each requirement as covered, missing, or requiring leadership validation. Do not claim CJIS, FedRAMP, set-aside eligibility, pricing, or delivery commitments unless the supporting source is present.`,
      }
    }

    return section
  })
}

function buildSourceChunks(opportunity: Opportunity | null, opportunityView: typeof fallbackOpportunity): SourceChunk[] {
  const chunks: SourceChunk[] = []
  const retrievedAt = new Date().toLocaleString()

  if (opportunity?.rfpPackage?.description) {
    chunks.push({
      documentName: 'SAM.gov Description',
      similarity: '100%',
      preview: opportunity.rfpPackage.description.replace(/\s+/g, ' ').slice(0, 180),
      retrievedAt,
    })
  }

  if (opportunity?.rfpPackage?.attachmentsLinksText || opportunity?.attachmentsLinksText) {
    chunks.push({
      documentName: 'SAM.gov Attachments/Links',
      similarity: '96%',
      preview: (opportunity.rfpPackage?.attachmentsLinksText || opportunity.attachmentsLinksText).replace(/\s+/g, ' ').slice(0, 180),
      retrievedAt,
    })
  }

  if (opportunity?.uiLink) {
    chunks.push({
      documentName: 'SAM.gov Opportunity Record',
      similarity: '92%',
      preview: opportunity.uiLink,
      retrievedAt,
    })
  }

  return chunks.length
    ? chunks
    : [
        {
          documentName: `${opportunityView.solicitationNumber} metadata`,
          similarity: '82%',
          preview: `${opportunityView.title} from ${opportunityView.agency}. Additional source documents have not been uploaded yet.`,
          retrievedAt,
        },
      ]
}

function buildResponseSectionsForOpportunity(opportunity: Opportunity | null, opportunityView: typeof fallbackOpportunity): ResponseSection[] {
  const sourceChunks = buildSourceChunks(opportunity, opportunityView)

  return buildResponseSections(opportunityView).map((section) => ({
    ...section,
    sources: sourceChunks,
  }))
}

const requirementColumns: ColumnsType<Requirement> = [
  {
    title: 'Requirement',
    dataIndex: 'requirement',
    key: 'requirement',
    width: 190,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 116,
    render: (status: RequirementStatus) => {
      const color = status === 'Covered' ? 'green' : status === 'Missing' ? 'red' : 'gold'
      return <Tag color={color}>{status}</Tag>
    },
  },
  {
    title: 'Confidence',
    dataIndex: 'confidence',
    key: 'confidence',
    width: 84,
  },
  {
    title: 'Source',
    dataIndex: 'sourceSection',
    key: 'sourceSection',
    width: 150,
  },
]

export default function RfpResponseAgent() {
  const { rfpId } = useParams()
  const [opportunityRecord, setOpportunityRecord] = useState<Opportunity | null>(null)
  const [isLoadingOpportunity, setIsLoadingOpportunity] = useState(Boolean(rfpId))
  const [opportunityError, setOpportunityError] = useState('')
  const [sections, setSections] = useState<ResponseSection[]>(() => buildResponseSections(fallbackOpportunity))
  const [selectedSectionId, setSelectedSectionId] = useState(initialSections[0].id)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('Draft Ready')
  const [approvalStatus, setApprovalStatus] = useState('Awaiting internal review')
  const [reviewerName] = useState('Neel Palle')
  const [lastModified, setLastModified] = useState('May 12, 2026 12:38 PM')

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? sections[0],
    [sections, selectedSectionId],
  )
  const opportunity = useMemo(() => buildOpportunityView(opportunityRecord), [opportunityRecord])
  const opportunityRequirements = useMemo(() => buildRequirements(opportunityRecord), [opportunityRecord])
  const opportunityRiskAlerts = useMemo(() => buildRiskAlerts(opportunityRecord), [opportunityRecord])

  useEffect(() => {
    if (!rfpId) {
      setIsLoadingOpportunity(false)
      return
    }

    const loadOpportunity = async () => {
      setIsLoadingOpportunity(true)
      setOpportunityError('')

      try {
        const result = await getSamGovOpportunity(rfpId)
        setOpportunityRecord(result)
        const nextOpportunity = buildOpportunityView(result)
        setSections(buildResponseSectionsForOpportunity(result, nextOpportunity))
        setSelectedSectionId('executive-summary')
      } catch (error) {
        setOpportunityError(error instanceof Error ? error.message : 'Failed to load this RFP from MongoDB.')
      } finally {
        setIsLoadingOpportunity(false)
      }
    }

    void loadOpportunity()
  }, [rfpId])

  const updateSection = (sectionId: string, patch: Partial<ResponseSection>) => {
    setSections((current) =>
      current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
    )
    setLastModified(new Date().toLocaleString())
  }

  const regenerateSelectedSection = () => {
    setGenerationStatus('Generating')
    window.setTimeout(() => {
      updateSection(selectedSection.id, {
        body: `${selectedSection.body}\n\n[Regenerated note] Tighten this section against the latest extracted requirements and retrieved Trusted Tech source material before approval.`,
        reviewState: 'Draft',
        versions: [`v${selectedSection.versions.length + 1} regenerated`, ...selectedSection.versions],
      })
      setGenerationStatus('Needs Review')
    }, 500)
  }

  const generateFullResponse = () => {
    setGenerationStatus('Generating')
    window.setTimeout(() => {
      setSections((current) =>
        current.map((section) => ({
          ...section,
          reviewState: section.reviewState === 'Accepted' ? section.reviewState : 'Draft',
          versions: [`v${section.versions.length + 1} full response refresh`, ...section.versions],
        })),
      )
      setGenerationStatus('Draft Ready')
      setLastModified(new Date().toLocaleString())
    }, 700)
  }

  const addReviewerComment = () => {
    updateSection(selectedSection.id, {
      comments: ['Reviewer comment: validate this section against final company facts before approval.', ...selectedSection.comments],
      reviewState: 'Changes Requested',
    })
    setApprovalStatus('Revision requested')
  }

  return (
    <div className="rfp-workstation">
      <header className="rfp-workstation-header">
        <div>
          <Link to="/rfp-response-agent" className="rfp-back-link">
            Back to RFP CRM
          </Link>
          <Text className="rfp-kicker">AI Procurement Analyst</Text>
          <Title level={2}>RFP Response Page</Title>
          <Paragraph>
            Review extracted SAM.gov intelligence, generate proposal sections, and route the draft for boss approval.
          </Paragraph>
        </div>
        <Space size="small" wrap>
          {rfpId ? <Tag>{rfpId}</Tag> : null}
          <Tag color={generationStatus === 'Approved' ? 'green' : generationStatus === 'Generating' ? 'processing' : 'gold'}>
            {generationStatus}
          </Tag>
          <Tag>Reviewer: {reviewerName}</Tag>
        </Space>
      </header>

      {opportunityError ? (
        <Alert
          type="warning"
          showIcon
          message="Using fallback response workspace"
          description={opportunityError}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {isLoadingOpportunity ? (
        <div style={{ padding: 24 }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : null}

      {!isLoadingOpportunity ? <main className="rfp-workstation-grid">
        <aside className="rfp-intel-panel">
          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Opportunity</Text>
            <Title level={4}>{opportunity.title}</Title>
            <div className="rfp-field-grid">
              <span>Agency</span>
              <strong>{opportunity.agency}</strong>
              <span>Solicitation</span>
              <strong>{opportunity.solicitationNumber}</strong>
              <span>Due date</span>
              <strong>{opportunity.dueDate}</strong>
              <span>Set-aside</span>
              <strong>{opportunity.setAside}</strong>
            </div>
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">AI Summary</Text>
            <Paragraph>{opportunity.summary}</Paragraph>
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Requirements</Text>
            <Table
              size="small"
              pagination={false}
              columns={requirementColumns}
              dataSource={opportunityRequirements}
              className="rfp-requirements-table"
              scroll={{ x: 540 }}
            />
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Deadline Tracker</Text>
            <div className="rfp-deadline-grid">
              <span>Questions due</span>
              <strong>{opportunity.questionsDue}</strong>
              <span>Proposal due</span>
              <strong>{opportunity.proposalDue}</strong>
              <span>Remaining days</span>
              <strong>{opportunity.remainingDays}</strong>
            </div>
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Risk Alerts</Text>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {opportunityRiskAlerts.map((alert) => (
                <Alert key={alert} type="warning" showIcon message={alert} />
              ))}
            </Space>
          </section>
        </aside>

        <section className="rfp-editor-panel">
          <div className="rfp-action-bar">
            <Space size="small" wrap>
              <Button type="primary" onClick={generateFullResponse} loading={generationStatus === 'Generating'}>
                Generate Full Response
              </Button>
              <Button onClick={regenerateSelectedSection} loading={generationStatus === 'Generating'}>
                Regenerate Selected Section
              </Button>
              <Button onClick={() => setGenerationStatus('Draft Ready')}>Save Draft</Button>
              <Button>Export PDF</Button>
              <Button onClick={() => setApprovalStatus('Sent for review')}>Send for Review</Button>
            </Space>
            <Segmented
              value={generationStatus}
              onChange={(value) => setGenerationStatus(value as GenerationStatus)}
              options={['Generating', 'Draft Ready', 'Needs Review', 'Approved']}
            />
          </div>

          <div className="rfp-editor-shell">
            <Collapse
              activeKey={[selectedSectionId]}
              onChange={(keys) => {
                const nextKey = Array.isArray(keys) ? keys[0] : keys
                if (nextKey) {
                  setSelectedSectionId(String(nextKey))
                }
              }}
              items={sections.map((section) => ({
                key: section.id,
                label: (
                  <div className="rfp-section-heading">
                    <strong>{section.title}</strong>
                    <Space size={6}>
                      <Tag color={section.reviewState === 'Accepted' ? 'green' : section.reviewState === 'Changes Requested' ? 'red' : 'blue'}>
                        {section.reviewState}
                      </Tag>
                      <Text type="secondary">{section.sources.length} sources</Text>
                    </Space>
                  </div>
                ),
                children: (
                  <div className="rfp-response-section" onFocus={() => setSelectedSectionId(section.id)}>
                    <TextArea
                      value={section.body}
                      onChange={(event) => updateSection(section.id, { body: event.target.value, reviewState: 'Draft' })}
                      autoSize={{ minRows: 8, maxRows: 18 }}
                      className="rfp-rich-editor"
                    />
                    <div className="rfp-section-controls">
                      <Space size="small" wrap>
                        <Button size="small" onClick={regenerateSelectedSection}>Regenerate</Button>
                        <Button size="small" onClick={() => updateSection(section.id, { reviewState: 'Accepted' })}>Accept</Button>
                        <Button size="small" onClick={() => updateSection(section.id, { reviewState: 'Changes Requested' })}>Reject</Button>
                        <Button size="small" onClick={addReviewerComment}>Comment</Button>
                      </Space>
                      <div className="rfp-version-history">
                        <Text type="secondary">Version history</Text>
                        {section.versions.slice(0, 3).map((version) => (
                          <Tag key={version}>{version}</Tag>
                        ))}
                      </div>
                    </div>
                    {section.comments.length ? (
                      <div className="rfp-comments">
                        {section.comments.map((comment) => (
                          <p key={comment}>{comment}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ),
              }))}
            />
          </div>
        </section>

        <aside className="rfp-source-panel">
          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Knowledge Sources</Text>
            <Title level={4}>{selectedSection.title}</Title>
            <Paragraph>
              Sources used for this generated section. Scores reflect similarity to the selected response language.
            </Paragraph>
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Uploaded Proposal Library</Text>
            <div className="rfp-source-library">
              {selectedSection.sources.map((source) => (
                <Tag key={`library-${source.documentName}`}>{source.documentName}</Tag>
              ))}
            </div>
            <Button block>Upload historical proposal</Button>
          </section>

          <section className="rfp-panel-block">
            <Text className="rfp-panel-label">Retrieved Chunks</Text>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {selectedSection.sources.map((source) => (
                <article className="rfp-source-card" key={`${selectedSection.id}-${source.documentName}`}>
                  <div>
                    <strong>{source.documentName}</strong>
                    <Tag color="cyan">{source.similarity}</Tag>
                  </div>
                  <p>{source.preview}</p>
                  <Text type="secondary">Retrieved {source.retrievedAt}</Text>
                </article>
              ))}
            </Space>
          </section>
        </aside>
      </main> : null}

      <footer className="rfp-review-bar">
        <div>
          <Text className="rfp-panel-label">Review Control</Text>
          <strong>{approvalStatus}</strong>
          <span>Last modified {lastModified}</span>
        </div>
        <Space size="small" wrap>
          <Button type="primary" onClick={() => {
            setApprovalStatus('Approved by boss')
            setGenerationStatus('Approved')
          }}>
            Approve Draft
          </Button>
          <Button onClick={() => {
            setApprovalStatus('Returned for revision')
            setGenerationStatus('Needs Review')
          }}>
            Return for Revision
          </Button>
          <Button onClick={addReviewerComment}>Add Reviewer Comment</Button>
          <Button onClick={() => setApprovalStatus('Final version locked')}>Lock Final Version</Button>
        </Space>
      </footer>
    </div>
  )
}
