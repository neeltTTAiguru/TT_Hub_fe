import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Input, Popconfirm, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { deleteSamGovOpportunity, findFirstSamGovWithBrowser, getSamGovOpportunities, type Opportunity } from '../lib/api'

const { Text, Title } = Typography

type RfpRecord = {
  key: string
  title: string
  agency: string
  solicitationNumber: string
  dueDate: string
  stage: 'Extracted' | 'Drafting' | 'Review' | 'Approved'
  owner: string
  lastUpdated: string
}

const MAX_VISIBLE_RFPS = 5

const rfpRecords: RfpRecord[] = [
  {
    key: 'id-2026-001-bwc',
    title: 'BODY-WORN CAMERA SOLUTION INDUSTRY DAY',
    agency: 'Federal Bureau of Prisons / DOJ',
    solicitationNumber: 'ID-2026-001_BWC',
    dueDate: 'Feb 23, 2026',
    stage: 'Drafting',
    owner: 'Neel Palle',
    lastUpdated: 'May 12, 2026 1:47 PM',
  },
]

function toRfpRecord(opportunity: Opportunity): RfpRecord {
  const id = opportunity.solicitationNumber || opportunity.noticeId || opportunity.title

  return {
    key: id || `rfp-${Date.now()}`,
    title: opportunity.title || 'Untitled SAM.gov opportunity',
    agency: opportunity.agency || 'Agency not listed',
    solicitationNumber: opportunity.solicitationNumber || opportunity.noticeId || 'Unknown',
    dueDate: opportunity.responseDeadline || 'Unknown',
    stage: 'Extracted',
    owner: 'OpenClaw',
    lastUpdated: new Date().toLocaleString(),
  }
}

function rankRfpRecords(records: RfpRecord[]) {
  return [...records]
    .sort((left, right) => String(right.lastUpdated).localeCompare(String(left.lastUpdated)))
    .slice(0, MAX_VISIBLE_RFPS)
}

function formatSolicitation(value: string) {
  if (!value || value === 'Unknown') {
    return 'Unknown'
  }

  if (/^https?:\/\//i.test(value)) {
    return 'SAM.gov record'
  }

  return value
}

function formatDueDate(value: string) {
  const parsed = Date.parse(value)

  if (!value || value === 'Unknown' || Number.isNaN(parsed)) {
    return {
      date: value || 'Unknown',
      time: '',
    }
  }

  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(parsed)

  return { date, time }
}

export default function RfpResponseCrm() {
  const [records, setRecords] = useState<RfpRecord[]>(rfpRecords)
  const [isLoadingRecords, setIsLoadingRecords] = useState(true)
  const [isFinding, setIsFinding] = useState(false)
  const [findError, setFindError] = useState('')
  const [lastSearchText, setLastSearchText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedRecordKeys, setSelectedRecordKeys] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const loadRecords = async () => {
      setIsLoadingRecords(true)

      try {
        const opportunities = await getSamGovOpportunities()
        if (opportunities.length) {
          setRecords(rankRfpRecords(opportunities.map(toRfpRecord)))
        }
      } catch (error) {
        setFindError(error instanceof Error ? error.message : 'Failed to load saved RFP records from MongoDB.')
      } finally {
        setIsLoadingRecords(false)
      }
    }

    void loadRecords()
  }, [])

  const visibleRecords = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    if (!query) {
      return records
    }

    return records.filter((record) =>
      [record.title, record.agency, record.solicitationNumber, record.dueDate, record.stage, record.owner]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [records, searchText])

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedRecordKeys.includes(record.key)),
    [records, selectedRecordKeys],
  )

  const columns: ColumnsType<RfpRecord> = useMemo(
    () => [
      {
        title: 'Opportunity',
        dataIndex: 'title',
        key: 'title',
        width: 420,
        render: (_, record) => (
          <Space direction="vertical" size={4} className="rfp-opportunity-cell">
            <Link to={`/rfp-response-agent/${encodeURIComponent(record.key)}`} className="rfp-opportunity-link">
              <Text strong>{record.title}</Text>
            </Link>
            <Text type="secondary" className="rfp-agency-text">{record.agency}</Text>
          </Space>
        ),
      },
      {
        title: 'Solicitation',
        dataIndex: 'solicitationNumber',
        key: 'solicitationNumber',
        width: 150,
        render: (value: string) => <Text className="rfp-mono-cell">{formatSolicitation(value)}</Text>,
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        width: 140,
        render: (value: string) => {
          const due = formatDueDate(value)

          return (
            <span className="rfp-date-cell">
              <Text>{due.date}</Text>
              {due.time ? <Text type="secondary">{due.time}</Text> : null}
            </span>
          )
        },
      },
      {
        title: 'Stage',
        dataIndex: 'stage',
        key: 'stage',
        width: 110,
        render: (stage: RfpRecord['stage']) => {
          const color = stage === 'Approved' ? 'green' : stage === 'Review' ? 'gold' : stage === 'Drafting' ? 'blue' : 'default'
          return <Tag color={color}>{stage}</Tag>
        },
      },
      {
        title: 'Owner',
        dataIndex: 'owner',
        key: 'owner',
        width: 110,
      },
      {
        title: 'Action',
        key: 'action',
        width: 150,
        render: (_, record) => (
          <Link to={`/rfp-response-agent/${encodeURIComponent(record.key)}`}>
            <Button type="primary" className="rfp-open-button">Open Workspace</Button>
          </Link>
        ),
      },
    ],
    [],
  )

  const findNewRfp = async () => {
    setIsFinding(true)
    setFindError('')

    try {
      const result = await findFirstSamGovWithBrowser({
        instructions:
          'Find active or inactive SAM.gov RFPs, RFQs, solicitations, RFIs, sources sought, or special notices for body-worn cameras, BWC, digital evidence, or evidence management.',
        excludeNoticeIds: records.flatMap((record) => [record.solicitationNumber, record.title, record.key]),
      })

      setLastSearchText(result.searchPlan?.searchText || result.keyword || '')

      if (!result.opportunity) {
        setFindError('OpenClaw did not find another matching RFP beyond the records already in this CRM.')
        return
      }

      const nextRecord = toRfpRecord(result.opportunity)
      setRecords((current) => {
        const exists = current.some(
          (record) =>
            record.key === nextRecord.key ||
            record.solicitationNumber.toLowerCase() === nextRecord.solicitationNumber.toLowerCase(),
        )

        return exists ? current : rankRfpRecords([nextRecord, ...current])
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to find a new RFP.'
      setFindError(
        /unauthorized/i.test(message)
          ? 'The backend rejected the SAM.gov search request before it could run. Refresh the page and make sure the backend is restarted with the latest local route change.'
          : message,
      )
    } finally {
      setIsFinding(false)
    }
  }

  const deleteSelectedRecords = async () => {
    if (!selectedRecords.length) {
      return
    }

    setIsDeleting(true)
    setFindError('')

    try {
      const results = await Promise.allSettled(
        selectedRecords.map((record) => deleteSamGovOpportunity(record.solicitationNumber || record.key)),
      )
      const deletedKeys = selectedRecords
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((record) => record.key)

      setRecords((current) => current.filter((record) => !deletedKeys.includes(record.key)))
      setSelectedRecordKeys((current) => current.filter((key) => !deletedKeys.includes(key)))

      const failedCount = results.length - deletedKeys.length
      if (failedCount) {
        setFindError(`${failedCount} selected RFP${failedCount === 1 ? '' : 's'} could not be deleted.`)
      }
    } catch (error) {
      setFindError(error instanceof Error ? error.message : 'Failed to delete selected RFPs.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="page rfp-crm-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">RFP Response CRM</h1>
          <p className="page-subtitle">
            Track extracted opportunities from discovery through proposal drafting and boss approval.
          </p>
        </div>
        <Space wrap>
          <Button>Import SAM.gov Extract</Button>
          <Button type="primary" onClick={() => void findNewRfp()} loading={isFinding}>
            Find New RFPs
          </Button>
        </Space>
      </div>

      {findError ? <Alert type="warning" showIcon message="No new RFP added" description={findError} /> : null}
      {lastSearchText ? <Alert type="info" showIcon message="Latest SAM.gov search" description={lastSearchText} /> : null}

      <div className="rfp-crm-stats">
        <Card className="section-card">
          <Text type="secondary">Total RFPs</Text>
          <Title level={3}>{records.length}</Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">In Drafting</Text>
          <Title level={3}>{records.filter((record) => record.stage === 'Drafting').length}</Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Needs Review</Text>
          <Title level={3}>{records.filter((record) => record.stage === 'Review').length}</Title>
        </Card>
      </div>

      <Card className="section-card" title="RFP Pipeline">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div className="rfp-crm-toolbar">
            <Input.Search
              placeholder="Search RFP title, agency, solicitation number"
              allowClear
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            {selectedRecordKeys.length ? (
              <Space wrap className="rfp-selection-actions">
                <Tag color="blue">{selectedRecordKeys.length} selected</Tag>
                <Popconfirm
                  title="Delete selected RFPs?"
                  description="This removes the selected records from the RFP pipeline."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                  onConfirm={() => void deleteSelectedRecords()}
                >
                  <Button danger loading={isDeleting}>Delete</Button>
                </Popconfirm>
              </Space>
            ) : null}
          </div>
          {isLoadingRecords ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <Table
              columns={columns}
              dataSource={visibleRecords}
              pagination={false}
              rowClassName="rfp-crm-row"
              rowSelection={{
                selectedRowKeys: selectedRecordKeys,
                onChange: (keys) => setSelectedRecordKeys(keys.map(String)),
              }}
              tableLayout="fixed"
              scroll={{ x: 1080 }}
            />
          )}
        </Space>
      </Card>

    </div>
  )
}
