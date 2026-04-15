import { useEffect, useState } from 'react'
import { Alert, Button, Card, List, Space, Tag, Typography } from 'antd'
import { getResearchRuns, getSamGovOpportunities, syncSamGovMonitor, type Opportunity, type ResearchRun } from '../lib/api'
import ChatMessageContent from '../components/ChatMessageContent'

const { Link, Text, Title } = Typography

export default function SamGovMonitor() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [latestRun, setLatestRun] = useState<ResearchRun | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const load = async () => {
    try {
      const [results, runs] = await Promise.all([getSamGovOpportunities(), getResearchRuns()])
      setOpportunities(results)
      setLatestRun(runs.find((run) => run.requestedBy === 'sam-gov-monitor') ?? null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Failed to load SAM.gov opportunities.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncError('')

    try {
      const result = await syncSamGovMonitor()
      setOpportunities(result.opportunities)
      setLatestRun(result.researchRun)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Failed to run the SAM.gov monitor.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">SAM.gov Monitor</h1>
        <p className="page-subtitle">
          Continuous procurement monitoring for relevant opportunities, agency demand, and market shifts.
        </p>
      </div>

      <Card
        className="section-card"
        title="SAM.gov Body-Worn Camera Monitor"
        extra={
          <Button type="primary" onClick={() => void handleSync()} loading={isSyncing}>
            Run monitor
          </Button>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">
            Runs a body-worn camera related SAM.gov scan, stores opportunities in the hub, and creates a short monitor report.
          </Text>

          {syncError ? <Alert type="error" showIcon message="SAM.gov monitor failed" description={syncError} /> : null}

          {latestRun ? (
            <Card type="inner" title="Latest Monitor Report">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Text type="secondary">{new Date(latestRun.updatedAt).toLocaleString()}</Text>
                <div>
                  <Text strong>Summary</Text>
                  <div style={{ marginTop: 8 }}>
                    <ChatMessageContent content={latestRun.reportSummary || 'No report summary was saved.'} />
                  </div>
                </div>
                {latestRun.findings.length ? (
                  <div>
                    <Text strong>Top Findings</Text>
                    <Space direction="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
                      {latestRun.findings.map((finding, index) => (
                        <Card key={`${latestRun._id}-finding-${index}`} type="inner">
                          <div style={{ marginBottom: 8 }}>
                            <ChatMessageContent content={finding.summary} />
                          </div>
                          {finding.implication ? (
                            <Text type="secondary">{finding.implication}</Text>
                          ) : null}
                        </Card>
                      ))}
                    </Space>
                  </div>
                ) : null}
              </Space>
            </Card>
          ) : null}

          <List
            locale={{ emptyText: 'No SAM.gov opportunities saved yet. Run the monitor to populate this view.' }}
            dataSource={opportunities}
            renderItem={(opportunity) => (
              <List.Item>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap>
                    <Title level={5} style={{ margin: 0 }}>
                      {opportunity.title}
                    </Title>
                    <Tag>{opportunity.noticeType || 'Notice'}</Tag>
                    {opportunity.setAside ? <Tag color="blue">{opportunity.setAside}</Tag> : null}
                  </Space>
                  <Text>{opportunity.agency || 'Agency not listed'}</Text>
                  <Text type="secondary">
                    Posted {opportunity.postedDate || 'Unknown'} | Deadline {opportunity.responseDeadline || 'Unknown'} | Keyword{' '}
                    {opportunity.sourceKeyword || 'Unknown'}
                  </Text>
                  {opportunity.uiLink ? (
                    <Link href={opportunity.uiLink} target="_blank" rel="noreferrer">
                      View on SAM.gov
                    </Link>
                  ) : null}
                </Space>
              </List.Item>
            )}
          />
        </Space>
      </Card>
    </div>
  )
}
