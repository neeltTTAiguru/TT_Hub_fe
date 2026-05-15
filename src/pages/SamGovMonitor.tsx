import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, List, Space, Tag, Typography } from 'antd'
import {
  getSamGovOpportunities,
  searchSamGovWithBrowser,
  type Opportunity,
} from '../lib/api'

const { Text, Title } = Typography

function splitTerms(value: string) {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
}

export default function SamGovMonitor() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [keywords, setKeywords] = useState('body-worn camera, BWC, digital evidence, evidence management')
  const [isRunning, setIsRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setOpportunities(await getSamGovOpportunities())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load saved SAM.gov opportunities.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const runMonitor = async () => {
    setIsRunning(true)
    setError('')
    setNotice('')

    try {
      const result = await searchSamGovWithBrowser({
        daysBack: 30,
        keywords: splitTerms(keywords),
        noticeTypes: ['solicitation', 'sources-sought', 'special-notice', 'combined-synopsis-solicitation'],
      })

      setOpportunities(result.opportunities)
      setNotice(`SAM.gov monitor scanned ${result.keywords.length} keyword set${result.keywords.length === 1 ? '' : 's'} and saved ${result.opportunities.length} opportunities.`)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run SAM.gov monitor.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">SAM.gov Monitor</h1>
          <p className="page-subtitle">
            Monitor SAM.gov for public safety, body camera, and digital evidence opportunities.
          </p>
        </div>
        <Button type="primary" onClick={() => void runMonitor()} loading={isRunning}>
          Run Monitor
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message="SAM.gov monitor failed" description={error} /> : null}
      {notice ? <Alert type="success" showIcon message="SAM.gov monitor complete" description={notice} /> : null}

      <Card className="section-card" title="Monitor Search">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">
            Runs a browser-backed SAM.gov scan and saves matching opportunities into the RFP opportunity store.
          </Text>
          <div className="rfp-instruction-search">
            <Input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="Keywords, comma separated"
            />
            <Button type="primary" onClick={() => void runMonitor()} loading={isRunning}>
              Search SAM.gov
            </Button>
          </div>
        </Space>
      </Card>

      <Card className="section-card" title="Saved SAM.gov Opportunities">
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
                  <a href={opportunity.uiLink} target="_blank" rel="noreferrer">
                    View on SAM.gov
                  </a>
                ) : null}
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
