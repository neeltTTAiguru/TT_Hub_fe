import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Popconfirm, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useParams } from 'react-router-dom'
import {
  deletePoliceGrantLead,
  getPoliceGrantLeads,
  getUsers,
  surfPoliceGrantDatabase,
  type PoliceGrantLead,
  type User,
} from '../lib/api'

const { Paragraph, Text, Title } = Typography

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
  const [applicationUser, setApplicationUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSurfing, setIsSurfing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const [lastSurfText, setLastSurfText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [surfInstructions, setSurfInstructions] = useState('')
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<string[]>([])

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
          message="OpenClaw is surfing Police Funding Database"
          description="This now opens and reads live location pages through the OpenClaw browser, so it may take longer than the previous direct fetch."
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
          <Text type="secondary">Total Leads</Text>
          <Title level={3}>{leads.length}</Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Immediate Outreach</Text>
          <Title level={3}>{leads.filter((lead) => lead.recommendedAction === 'Immediate outreach').length}</Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Avg Score</Text>
          <Title level={3}>
            {leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.opportunityScore, 0) / leads.length) : 0}
          </Title>
        </Card>
      </div>

      <Card className="section-card" title="Grant Lead Pipeline">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div className="grant-surf-builder">
            <Input.TextArea
              value={surfInstructions}
              onChange={(event) => setSurfInstructions(event.target.value)}
              placeholder="Search instructions, e.g. 'Florida county sheriff offices', 'Pasco County', 'small departments in Nebraska', or 'rural agencies in the Southeast'"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <Button type="primary" onClick={() => void runSurf()} loading={isSurfing}>
              Surf Leads
            </Button>
          </div>

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
        </Space>
      </Card>
    </div>
  )
}
