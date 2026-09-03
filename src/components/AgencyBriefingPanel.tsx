import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Space, Spin, Tag, Typography } from 'antd'
import { getAgencyBriefing, type AgencyBriefing, type BriefingSourcedItem } from '../lib/api'

const { Paragraph, Text, Title } = Typography

const BWC_LABEL: Record<string, { text: string; color: string }> = {
  yes: { text: 'Runs body cameras', color: 'green' },
  no: { text: 'No body camera program', color: 'red' },
  unknown: { text: 'Body camera status unknown', color: 'default' },
}

function SourcedList({ items, empty }: { items: BriefingSourcedItem[]; empty: string }) {
  if (!items.length) {
    return <Text type="secondary">{empty}</Text>
  }
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {items.map((item, index) => (
        <div key={`${item.url}:${index}`}>
          <Text>{item.text}</Text>
          <div>
            {item.date ? (
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                {item.date}
              </Text>
            ) : null}
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                source
              </a>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                no source cited
              </Text>
            )}
          </div>
        </div>
      ))}
    </Space>
  )
}

export default function AgencyBriefingPanel({
  ori,
  agencyName,
  open,
  onClose,
  onResearched,
}: {
  ori: string | null
  agencyName: string
  open: boolean
  onClose: () => void
  // Fired when a briefing settles the camera question, so the pin behind the
  // panel updates the moment you read the answer rather than on the next poll.
  onResearched?: (ori: string, bwcStatus: string, vendor: string) => void
}) {
  const [briefing, setBriefing] = useState<AgencyBriefing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = (refresh = false) => {
    if (!ori) return
    setLoading(true)
    setError('')
    getAgencyBriefing(ori, { refresh })
      .then((next) => {
        setBriefing(next)
        // The backend has already written this to the agency; telling the map
        // directly saves it waiting up to 30 seconds for the activity poll to
        // notice, which is how long the pin sat unchanged behind an open panel
        // that was plainly saying "runs body cameras".
        const found = next?.research?.bwcStatus
        if (found?.hasProgram === 'yes' && found.confidence !== 'low' && found.sourceUrl) {
          onResearched?.(ori, 'yes', found.vendor || '')
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the briefing.'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !ori) return
    setBriefing(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ori])

  const facts = briefing?.facts
  const research = briefing?.research
  const bwc = research?.bwcStatus

  return (
    <Drawer
      title={agencyName || 'Agency briefing'}
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
      extra={
        <Button size="small" onClick={() => load(true)} loading={loading} disabled={!ori}>
          Refresh
        </Button>
      }
    >
      {loading && !briefing ? (
        <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: 60 }}>
          <Spin />
          <Text type="secondary">Researching this agency across the web...</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Body cameras, budget, grants and news. Usually 15-40 seconds.
          </Text>
        </Space>
      ) : null}

      {error ? <Alert type="error" showIcon message="Research failed" description={error} /> : null}

      {briefing ? (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {/* Straight from our own data, never model-generated. */}
          <div>
            <Title level={5} style={{ marginTop: 0 }}>
              On record
            </Title>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Sworn officers">
                {facts?.swornOfficers ?? 'Not reported'}
                {facts?.dataYear ? ` (${facts.dataYear})` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Population served">
                {facts?.populationServed ? facts.populationServed.toLocaleString() : 'Unknown'}
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                {facts?.agencyType || 'Unknown'}
                {facts?.county ? ` - ${facts.county} County` : ''}
                {facts?.state ? `, ${facts.state}` : ''}
              </Descriptions.Item>
              {facts?.trend ? (
                <Descriptions.Item label="Headcount trend">
                  {facts.trend.fromOfficers} to {facts.trend.toOfficers} sworn (
                  {facts.trend.fromYear}-{facts.trend.toYear}
                  {facts.trend.change !== 0
                    ? `, ${facts.trend.change > 0 ? '+' : ''}${facts.trend.change}`
                    : ', flat'}
                  )
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Pipeline">
                {facts?.crm ? `${facts.crm.stage}${facts.crm.owner ? ` - ${facts.crm.owner}` : ''}` : 'Never contacted'}
              </Descriptions.Item>
            </Descriptions>
          </div>

          {research?.failedTopics?.length ? (
            <Alert
              type="warning"
              showIcon
              message="This briefing is incomplete"
              description={`Some research did not complete: ${research.failedTopics.join('; ')}. Try Refresh.`}
            />
          ) : null}

          {research?.summary ? (
            <div>
              <Title level={5}>Briefing</Title>
              <Paragraph style={{ marginBottom: 0 }}>{research.summary}</Paragraph>
            </div>
          ) : null}

          <div>
            <Title level={5}>
              Body cameras{' '}
              {bwc ? (
                <>
                  <Tag color={BWC_LABEL[bwc.hasProgram]?.color}>
                    {BWC_LABEL[bwc.hasProgram]?.text}
                  </Tag>
                  <Tag>{bwc.confidence} confidence</Tag>
                </>
              ) : null}
            </Title>
            {bwc?.vendor ? (
              <Paragraph style={{ marginBottom: 4 }}>
                <Text strong>Vendor: </Text>
                {bwc.vendor}
              </Paragraph>
            ) : null}
            <Paragraph type={bwc?.details ? undefined : 'secondary'} style={{ marginBottom: 0 }}>
              {bwc?.details || 'Nothing published was found either way.'}
            </Paragraph>
          </div>

          <div>
            <Title level={5}>
              Budget {research?.budget.fiscalYear ? <Tag>{research.budget.fiscalYear}</Tag> : null}
            </Title>
            <Paragraph type={research?.budget.summary ? undefined : 'secondary'}>
              {research?.budget.summary || 'No published budget detail found.'}
            </Paragraph>
            <SourcedList items={research?.budget.signals ?? []} empty="No budget votes or line items found." />
          </div>

          <div>
            <Title level={5}>Grants</Title>
            <SourcedList items={research?.grants ?? []} empty="No grant awards found." />
          </div>

          <div>
            <Title level={5}>Recent news</Title>
            <SourcedList items={research?.news ?? []} empty="No recent coverage found." />
          </div>

          {research?.outreachAngle ? (
            <div>
              <Title level={5}>Outreach angle</Title>
              <Paragraph style={{ marginBottom: 0 }}>{research.outreachAngle}</Paragraph>
            </div>
          ) : null}

          {research?.openQuestions?.length ? (
            <div>
              <Title level={5}>Worth asking directly</Title>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {research.openQuestions.map((question) => (
                  <li key={question}>
                    <Text>{question}</Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <Title level={5}>Sources</Title>
            {briefing.sources.length ? (
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                {briefing.sources.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    {url.length > 78 ? `${url.slice(0, 78)}...` : url}
                  </a>
                ))}
              </Space>
            ) : (
              <Empty description="No sources cited" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Researched from public web sources
            {briefing.searchCount ? ` across ${briefing.searchCount} searches` : ''}
            {briefing.generatedAt ? ` on ${new Date(briefing.generatedAt).toLocaleDateString()}` : ''}
            {briefing.cached ? ' (cached - use Refresh to re-run)' : ''}. Everything above the
            briefing line comes from FBI data; everything below it was found on the web and may be
            incomplete. Verify anything you plan to quote.
          </Text>
        </Space>
      ) : null}
    </Drawer>
  )
}
