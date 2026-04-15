import { Alert, Card, Empty, Skeleton, Space, Tag, Typography } from 'antd'
import { useHubData } from '../hooks/useHubData'

const { Link, Paragraph, Text, Title } = Typography

function toCompanyLabel(url?: string) {
  if (!url) {
    return 'Unknown company'
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    const [root] = hostname.split('.')

    if (!root) {
      return hostname
    }

    return root
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  } catch {
    return url
  }
}

export default function Reports() {
  const { researchRuns, isLoading, error } = useHubData()
  const reports = researchRuns.filter((run) =>
    run.findings.some((finding) =>
      finding.sources.some((source) => source.sourceType === 'browser-capture' || source.sourceType === 'sam-gov'),
    ),
  )

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Saved browser research summaries, source links, and findings for captured companies.
        </p>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to load reports" description={error} /> : null}

      {isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}

      {!isLoading && !reports.length ? (
        <Card className="section-card">
          <Empty description="No saved reports yet." />
        </Card>
      ) : null}

      {!isLoading && reports.length
        ? reports.map((run) => {
            const primarySource = run.findings.flatMap((finding) => finding.sources)[0]
            const companyLabel = toCompanyLabel(primarySource?.url)
            const reportType =
              primarySource?.sourceType === 'sam-gov' ? 'SAM.gov Monitor' : 'Browser Research'

            return (
              <Card key={run._id} className="section-card" style={{ marginBottom: 16 }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space wrap>
                    <Title level={4} style={{ margin: 0 }}>
                      {companyLabel}
                    </Title>
                    <Tag color={primarySource?.sourceType === 'sam-gov' ? 'blue' : 'gold'}>{reportType}</Tag>
                    <Tag color={run.status === 'completed' ? 'green' : run.status === 'in_progress' ? 'processing' : 'default'}>
                      {run.status}
                    </Tag>
                    <Text type="secondary">{new Date(run.updatedAt).toLocaleString()}</Text>
                  </Space>

                  <div>
                    <Text strong>Report</Text>
                    <Paragraph style={{ marginBottom: 0 }}>
                      {run.reportSummary || 'No report summary was saved for this run.'}
                    </Paragraph>
                  </div>

                  <div>
                    <Text strong>Objective</Text>
                    <Paragraph style={{ marginBottom: 0 }}>{run.objective}</Paragraph>
                  </div>

                  <div>
                    <Text strong>Findings</Text>
                    <Space direction="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
                      {run.findings.map((finding, index) => (
                        <Card key={`${run._id}-finding-${index}`} type="inner">
                          <Paragraph style={{ marginBottom: 8 }}>{finding.summary}</Paragraph>
                          {finding.implication ? (
                            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                              {finding.implication}
                            </Paragraph>
                          ) : null}
                          <Tag>{finding.confidence}</Tag>
                        </Card>
                      ))}
                    </Space>
                  </div>

                  {primarySource?.url ? (
                    <div>
                      <Text strong>Source link</Text>
                      <Paragraph style={{ marginBottom: 0 }}>
                        <Link href={primarySource.url} target="_blank" rel="noreferrer">
                          {primarySource.label || primarySource.url}
                        </Link>
                      </Paragraph>
                    </div>
                  ) : null}
                </Space>
              </Card>
            )
          })
        : null}
    </div>
  )
}
