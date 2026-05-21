import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Modal, Popconfirm, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useParams } from 'react-router-dom'
import {
  deletePoliceGrantLead,
  discoverGrantOpportunities,
  generateGrantResponse,
  type GrantApplicationDraft,
  type GrantApplicationQuestionsResponse,
  type GrantOpportunity,
  getPoliceGrantLeads,
  getUsers,
  readGrantApplicationQuestions,
  surfPoliceGrantDatabase,
  type PoliceGrantLead,
  type User,
} from '../lib/api'

const { Paragraph, Text, Title } = Typography

const userTypeLabels: Record<User['userType'], string> = {
  trusted_employee: 'Trusted employee',
  police_officer: 'Police officer',
  firefighter: 'Firefighter',
  agency_admin: 'Agency admin',
  non_trusted_employee: 'External reviewer',
}

function actionColor(action: PoliceGrantLead['recommendedAction']) {
  if (action === 'Immediate outreach') return 'green'
  if (action === 'High priority') return 'blue'
  if (action === 'Monitor') return 'gold'
  return 'default'
}

function getAgencyKey(lead: PoliceGrantLead) {
  return `${lead.agencyName}|${lead.locationName}|${lead.state}`.toLowerCase()
}

function sortLeadsByPriority(leadsToSort: PoliceGrantLead[]) {
  return [...leadsToSort].sort((left, right) => {
    if (right.opportunityScore !== left.opportunityScore) {
      return right.opportunityScore - left.opportunityScore
    }

    return new Date(right.scannedAt || right.updatedAt || 0).getTime() - new Date(left.scannedAt || left.updatedAt || 0).getTime()
  })
}

export default function PoliceGrantIntelligenceAgent() {
  const { applicationUserId } = useParams()
  const [leads, setLeads] = useState<PoliceGrantLead[]>([])
  const [grantMatches, setGrantMatches] = useState<GrantOpportunity[]>([])
  const [applicationUser, setApplicationUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSurfing, setIsSurfing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const [lastSurfText, setLastSurfText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [surfInstructions, setSurfInstructions] = useState('')
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<string[]>([])
  const [generatedDraft, setGeneratedDraft] = useState<GrantApplicationDraft | null>(null)
  const [generatingGrantId, setGeneratingGrantId] = useState('')
  const [portalGrant, setPortalGrant] = useState<GrantOpportunity | null>(null)
  const [portalQuestions, setPortalQuestions] = useState<GrantApplicationQuestionsResponse | null>(null)
  const [isReadingPortal, setIsReadingPortal] = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [nextLeads, users] = await Promise.all([
          getPoliceGrantLeads(),
          applicationUserId ? getUsers() : Promise.resolve([]),
        ])
        const selectedUser = users.find((user) => user._id === applicationUserId) ?? null

        setLeads(nextLeads)
        setApplicationUser(selectedUser)

        if (selectedUser) {
          const agencyContext = [
            selectedUser.agencyName,
            selectedUser.city,
            selectedUser.state,
            selectedUser.agencyType,
            selectedUser.grantProjectFocus,
          ].filter(Boolean).join(' ')
          setSurfInstructions(agencyContext)
          setSearchText([selectedUser.agencyName, selectedUser.city, selectedUser.state].filter(Boolean).join(' '))
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load police grant leads.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [applicationUserId])

  const visibleLeads = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    if (!query) {
      return leads
    }

    return leads.filter((lead) =>
      [
        lead.agencyName,
        lead.locationName,
        lead.state,
        lead.fundingProgram,
        lead.fundingSource,
        lead.recommendedAction,
        lead.likelyNeeds.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [leads, searchText])

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedLeadKeys.includes(lead.leadId)),
    [leads, selectedLeadKeys],
  )

  const runSurf = async () => {
    setIsSurfing(true)
    setError('')

    try {
      if (applicationUser) {
        const projectNeeds = [
          applicationUser.grantProjectFocus,
          applicationUser.promptVariables?.knownNeeds,
          applicationUser.promptVariables?.grantRequirements,
          surfInstructions,
        ].filter(Boolean)

        const result = await discoverGrantOpportunities({
          state: applicationUser.state,
          stateCode: applicationUser.state,
          userProfile: {
            organizationName: applicationUser.agencyName || applicationUser.name,
            organizationType: applicationUser.agencyType || userTypeLabels[applicationUser.userType],
            state: applicationUser.state,
            serviceArea: [applicationUser.city, applicationUser.state].filter(Boolean).join(', '),
            projectNeeds,
            knownNeeds: applicationUser.promptVariables?.knownNeeds,
            grantRequirements: applicationUser.promptVariables?.grantRequirements,
          },
        })

        setGrantMatches(result.opportunities)
        setLastSurfText(
          `Phase 2 grant discovery searched ${result.sources.length} saved ${result.stateCode || result.state} source${result.sources.length === 1 ? '' : 's'} and saved ${result.opportunities.length} matched grant opportunit${result.opportunities.length === 1 ? 'y' : 'ies'} at ${new Date(result.scannedAt).toLocaleString()}.`,
        )
        return
      }

      const alreadySeenLeads = leads
      const result = await surfPoliceGrantDatabase({
        limit: 10,
        instructions: surfInstructions,
        excludeLeadIds: alreadySeenLeads.map((lead) => lead.leadId),
        excludeAgencyKeys: alreadySeenLeads.map(getAgencyKey),
      })
      setLeads((current) => {
        const byLeadId = new Map(current.map((lead) => [lead.leadId, lead]))

        for (const lead of result.leads) {
          byLeadId.set(lead.leadId, lead)
        }

        return sortLeadsByPriority(Array.from(byLeadId.values()))
      })
      setLastSurfText(
        `Added ${result.leads.length} new leads from ${result.source}${result.instructions ? ` for "${result.instructions}"` : ''}${result.skippedCount ? ` after skipping ${result.skippedCount} already in the pipeline` : ''}${result.exhausted ? '; the database run did not find a full new batch' : ''} at ${new Date(result.scannedAt).toLocaleString()}.`,
      )
    } catch (surfError) {
      setError(surfError instanceof Error ? surfError.message : 'Failed to surf Police Funding Database.')
    } finally {
      setIsSurfing(false)
    }
  }

  const deleteSelectedLeads = async () => {
    if (!selectedLeads.length) {
      return
    }

    setIsDeleting(true)
    setError('')

    try {
      const results = await Promise.allSettled(selectedLeads.map((lead) => deletePoliceGrantLead(lead.leadId)))
      const deletedKeys = selectedLeads
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((lead) => lead.leadId)

      setLeads((current) => current.filter((lead) => !deletedKeys.includes(lead.leadId)))
      setSelectedLeadKeys((current) => current.filter((key) => !deletedKeys.includes(key)))

      const failedCount = results.length - deletedKeys.length
      if (failedCount) {
        setError(`${failedCount} selected lead${failedCount === 1 ? '' : 's'} could not be deleted.`)
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete selected leads.')
    } finally {
      setIsDeleting(false)
    }
  }

  const generateResponseForGrant = async (grant: GrantOpportunity) => {
    if (!applicationUser) {
      return
    }

    const portalUrl = grant.applicationUrl || grant.sourceUrl

    if (portalUrl) {
      window.open(portalUrl, '_blank', 'noopener,noreferrer')
    }

    setPortalGrant(grant)
    setPortalQuestions(null)
    setGeneratedDraft(null)
  }

  const continueAfterPortalLogin = async () => {
    if (!applicationUser || !portalGrant) {
      return
    }

    setGeneratingGrantId(portalGrant.opportunityId)
    setIsReadingPortal(true)
    setError('')

    try {
      const questions = await readGrantApplicationQuestions(portalGrant.opportunityId)
      setPortalQuestions(questions)

      if (questions.needsLogin || (!questions.questions.length && !questions.visibleQuestionText.length)) {
        return
      }

      const result = await generateGrantResponse(portalGrant.opportunityId, {
        userId: applicationUser._id,
        applicationQuestions: questions,
      })
      setPortalGrant(null)
      setPortalQuestions(null)
      setGeneratedDraft(result.draft)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate grant response.')
    } finally {
      setGeneratingGrantId('')
      setIsReadingPortal(false)
    }
  }

  const columns: ColumnsType<PoliceGrantLead> = [
    {
      title: 'Agency',
      dataIndex: 'agencyName',
      key: 'agencyName',
      width: 340,
      render: (_, lead) => (
        <Space direction="vertical" size={4} className="rfp-opportunity-cell">
          <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="rfp-opportunity-link">
            <Text strong>{lead.agencyName}</Text>
          </a>
          <Text type="secondary" className="rfp-agency-text">
            {lead.locationName || lead.state} {lead.state ? `- ${lead.state}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'opportunityScore',
      key: 'opportunityScore',
      width: 90,
      sorter: (left, right) => left.opportunityScore - right.opportunityScore,
      render: (score: number) => <Tag color={score >= 78 ? 'green' : score >= 64 ? 'blue' : score >= 42 ? 'gold' : 'default'}>{score}/100</Tag>,
    },
    {
      title: 'Grant',
      key: 'grant',
      width: 180,
      render: (_, lead) => (
        <span className="rfp-date-cell">
          <Text>{lead.grantAmountText || '$0'}</Text>
          <Text type="secondary">{lead.grantDate || 'Date unknown'}</Text>
        </span>
      ),
    },
    {
      title: 'Program',
      dataIndex: 'fundingProgram',
      key: 'fundingProgram',
      width: 230,
      render: (value: string) => <Text className="grant-program-cell">{value || 'Program not listed'}</Text>,
    },
    {
      title: 'Likely Needs',
      dataIndex: 'likelyNeeds',
      key: 'likelyNeeds',
      width: 250,
      render: (needs: string[]) => (
        <Space size={4} wrap>
          {needs.slice(0, 3).map((need) => (
            <Tag key={need}>{need}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'recommendedAction',
      key: 'recommendedAction',
      width: 150,
      render: (action: PoliceGrantLead['recommendedAction']) => <Tag color={actionColor(action)}>{action}</Tag>,
    },
  ]

  const grantColumns: ColumnsType<GrantOpportunity> = [
    {
      title: 'Grant',
      dataIndex: 'title',
      key: 'title',
      width: 320,
      render: (title: string, opportunity) => (
        <Space direction="vertical" size={4} className="rfp-opportunity-cell">
          <a href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rfp-opportunity-link">
            <Text strong>{title}</Text>
          </a>
          <Text type="secondary" className="rfp-agency-text">{opportunity.sourceAgency || 'Source unknown'}</Text>
        </Space>
      ),
    },
    {
      title: 'Fit',
      dataIndex: 'fitScore',
      key: 'fitScore',
      width: 90,
      render: (score: number) => <Tag color={score >= 80 ? 'green' : score >= 55 ? 'gold' : 'default'}>{score >= 80 ? 'Eligible' : score >= 55 ? 'Maybe' : 'Review'}</Tag>,
    },
    {
      title: 'Deadline',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 150,
      render: (value: string) => <Text>{value || 'Unknown'}</Text>,
    },
    {
      title: 'Award',
      dataIndex: 'awardRange',
      key: 'awardRange',
      width: 170,
      render: (value: string) => <Text>{value || 'Unknown'}</Text>,
    },
    {
      title: 'Summary',
      dataIndex: 'summary',
      key: 'summary',
      render: (value: string) => <Text>{value || 'No summary captured.'}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 190,
      render: (_, opportunity) => (
        <Button
          type="primary"
          loading={generatingGrantId === opportunity.opportunityId}
          disabled={Boolean(generatingGrantId) && generatingGrantId !== opportunity.opportunityId}
          onClick={() => void generateResponseForGrant(opportunity)}
        >
          Generate Response
        </Button>
      ),
    },
  ]

  return (
    <div className="page police-grant-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {applicationUser ? `${applicationUser.agencyName || applicationUser.name} Police Grant Intel` : 'Police Grant Intelligence Agent'}
          </h1>
          <p className="page-subtitle">
            {applicationUser
              ? 'Find grant-backed buying signals for this application user before drafting a response.'
              : 'Surf Police Funding Database with OpenClaw Browser for grant-backed agencies likely to need BWC and evidence technology.'}
          </p>
        </div>
        <Space wrap>
          {applicationUser ? <Link to="/grant-applications">Back to Applications</Link> : null}
          <Button type="primary" onClick={() => void runSurf()} loading={isSurfing}>
            Surf Database
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message="Grant intelligence needs attention" description={error} /> : null}
      {isSurfing ? (
        <Alert
          type="info"
          showIcon
          message={applicationUser ? 'OpenClaw is running Phase 2 grant discovery' : 'OpenClaw is surfing Police Funding Database'}
          description={applicationUser
            ? 'This reads saved state grant sources, applies the grant discovery prompt, and saves eligible or maybe eligible opportunities.'
            : 'This opens and reads live location pages through the OpenClaw browser, so it may take longer than the previous direct fetch.'}
        />
      ) : null}
      {lastSurfText ? <Alert type="info" showIcon message="Latest surf" description={lastSurfText} /> : null}
      {applicationUser ? (
        <Card className="section-card">
          <Space direction="vertical" size={4}>
            <Text type="secondary">Selected Application User</Text>
            <Text strong>{applicationUser.name}</Text>
            <Text>
              {[applicationUser.agencyName, applicationUser.city, applicationUser.state].filter(Boolean).join(' · ')}
            </Text>
            <Text type="secondary">{applicationUser.grantProjectFocus || 'No grant focus set'}</Text>
          </Space>
        </Card>
      ) : null}

      <div className="rfp-crm-stats">
        <Card className="section-card">
          <Text type="secondary">{applicationUser ? 'Grant Matches' : 'Total Leads'}</Text>
          <Title level={3}>{applicationUser ? grantMatches.length : leads.length}</Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">{applicationUser ? 'Eligible' : 'Immediate Outreach'}</Text>
          <Title level={3}>
            {applicationUser ? grantMatches.filter((grant) => grant.fitScore >= 80).length : leads.filter((lead) => lead.recommendedAction === 'Immediate outreach').length}
          </Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Avg Score</Text>
          <Title level={3}>
            {applicationUser
              ? grantMatches.length ? Math.round(grantMatches.reduce((sum, grant) => sum + grant.fitScore, 0) / grantMatches.length) : 0
              : leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.opportunityScore, 0) / leads.length) : 0}
          </Title>
        </Card>
      </div>

      <Card className="section-card" title={applicationUser ? 'Phase 2 Grant Matches' : 'Grant Lead Pipeline'}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div className="grant-surf-builder">
            <Input.TextArea
              value={surfInstructions}
              onChange={(event) => setSurfInstructions(event.target.value)}
              placeholder={applicationUser ? 'Optional grant discovery hints for this applicant' : "Search instructions, e.g. 'Florida county sheriff offices', 'Pasco County', 'small departments in Nebraska', or 'rural agencies in the Southeast'"}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <Button type="primary" onClick={() => void runSurf()} loading={isSurfing}>
              Surf Leads
            </Button>
          </div>

          {applicationUser ? (
            <Table
              columns={grantColumns}
              dataSource={grantMatches}
              pagination={false}
              rowKey="opportunityId"
              tableLayout="fixed"
              scroll={{ x: 1080 }}
              locale={{ emptyText: 'No Phase 2 grant matches yet. Click Surf Leads to search saved state sources.' }}
            />
          ) : null}

          {!applicationUser ? (
            <>
              <div className="rfp-crm-toolbar">
                <Input.Search
                  placeholder="Search agency, state, program, need"
                  allowClear
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                {selectedLeadKeys.length ? (
                  <Space wrap className="rfp-selection-actions">
                    <Tag color="blue">{selectedLeadKeys.length} selected</Tag>
                    <Popconfirm
                      title="Delete selected leads?"
                      description="This removes the selected grant intelligence records."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancel"
                      onConfirm={() => void deleteSelectedLeads()}
                    >
                      <Button danger loading={isDeleting}>Delete</Button>
                    </Popconfirm>
                  </Space>
                ) : null}
              </div>

              {isLoading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
              ) : (
                <Table
                  columns={columns}
                  dataSource={visibleLeads}
                  pagination={false}
                  rowClassName="rfp-crm-row"
                  rowKey="leadId"
                  rowSelection={{
                    selectedRowKeys: selectedLeadKeys,
                    onChange: (keys) => setSelectedLeadKeys(keys.map(String)),
                  }}
                  tableLayout="fixed"
                  expandable={{
                    expandedRowRender: (lead) => (
                      <div className="grant-expanded-row">
                        <Paragraph>{lead.description}</Paragraph>
                        <Text strong>Why this matters: </Text>
                        <Text>{lead.whyThisMatters}</Text>
                        <br />
                        <Text strong>Startup opportunity: </Text>
                        <Text>{lead.startupOpportunity}</Text>
                      </div>
                    ),
                  }}
                  scroll={{ x: 1240 }}
                />
              )}
            </>
          ) : null}
        </Space>
      </Card>

      <Modal
        title={portalGrant ? `Generate Response: ${portalGrant.title}` : 'Generate Response'}
        open={Boolean(portalGrant)}
        onCancel={() => {
          setPortalGrant(null)
          setPortalQuestions(null)
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setPortalGrant(null)
              setPortalQuestions(null)
            }}
          >
            Cancel
          </Button>,
          <Button
            key="continue"
            type="primary"
            loading={isReadingPortal || Boolean(generatingGrantId)}
            onClick={() => void continueAfterPortalLogin()}
          >
            Continue after login
          </Button>,
        ]}
        width={820}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Log in to the grant portal"
            description="OpenClaw opened the application portal in a new tab. Log in or create the account there, handle any MFA/CAPTCHA, then come back and click Continue after login."
          />
          {portalGrant ? (
            <div>
              <Text type="secondary">Application portal</Text>
              <Paragraph>
                <a href={portalGrant.applicationUrl || portalGrant.sourceUrl} target="_blank" rel="noreferrer">
                  {portalGrant.applicationUrl || portalGrant.sourceUrl}
                </a>
              </Paragraph>
            </div>
          ) : null}
          {portalQuestions?.needsLogin ? (
            <Alert
              type="warning"
              showIcon
              message="Still seeing a login page"
              description={portalQuestions.message || 'The application questions are not visible yet. Finish logging in, navigate to the application form if needed, then click Continue after login again.'}
            />
          ) : null}
          {portalQuestions && !portalQuestions.needsLogin ? (
            <Alert
              type="success"
              showIcon
              message="Application questions detected"
              description={`OpenClaw found ${portalQuestions.questions.length} visible form field${portalQuestions.questions.length === 1 ? '' : 's'} and is ready to generate question-specific answers.`}
            />
          ) : null}
        </Space>
      </Modal>

      <Modal
        title={generatedDraft?.draftTitle || 'Generated Grant Response'}
        open={Boolean(generatedDraft)}
        onCancel={() => setGeneratedDraft(null)}
        footer={<Button type="primary" onClick={() => setGeneratedDraft(null)}>Done</Button>}
        width={920}
      >
        {generatedDraft ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="Draft generated"
              description="The user should review this before OpenClaw fills anything into a grant portal. Final submission stays manual."
            />
            {generatedDraft.questionResponses?.length ? (
              <div>
                <Title level={5}>Question-Specific Responses</Title>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {generatedDraft.questionResponses.map((response, index) => (
                    <Card key={`${response.fieldName}-${index}`} size="small">
                      <Space direction="vertical" size={4}>
                        <Text strong>{response.question || `Question ${index + 1}`}</Text>
                        <Paragraph>{response.answer || '[Answer needs review]'}</Paragraph>
                        <Space wrap>
                          <Tag color={response.confidence === 'high' ? 'green' : response.confidence === 'medium' ? 'gold' : 'default'}>
                            {response.confidence}
                          </Tag>
                          {response.needsUserReview ? <Tag color="red">Review</Tag> : null}
                        </Space>
                        {response.missingInfo.length ? (
                          <Text type="secondary">Missing: {response.missingInfo.join(', ')}</Text>
                        ) : null}
                      </Space>
                    </Card>
                  ))}
                </Space>
              </div>
            ) : null}
            {Object.entries(generatedDraft.sections).map(([key, value]) => (
              value ? (
                <div key={key}>
                  <Title level={5}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())}</Title>
                  <Paragraph>{value}</Paragraph>
                </div>
              ) : null
            ))}
            {generatedDraft.missingInformation.length ? (
              <div>
                <Title level={5}>Missing Information</Title>
                <ul>
                  {generatedDraft.missingInformation.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {generatedDraft.complianceChecklist.length ? (
              <div>
                <Title level={5}>Compliance Checklist</Title>
                <ul>
                  {generatedDraft.complianceChecklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {generatedDraft.portalInstructions ? (
              <div>
                <Title level={5}>Portal Instructions</Title>
                <Paragraph>{generatedDraft.portalInstructions}</Paragraph>
              </div>
            ) : null}
          </Space>
        ) : null}
      </Modal>
    </div>
  )
}
