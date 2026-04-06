import { Alert, Card, Col, Progress, Row, Skeleton, Statistic, Tag, Typography } from 'antd'
import { useHubData } from '../hooks/useHubData'

const { Paragraph, Text, Title } = Typography

export default function HubOverview() {
  const { agents, companyContext, competitors, researchRuns, isLoading, error } = useHubData()
  const activeAgentCount = agents.filter((agent) => agent.status === 'active').length
  const latestRuns = researchRuns.slice(0, 3)

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Trusted Tech Hub</h1>
        <p className="page-subtitle">
          A central operating layer for company knowledge, research, and AI workflows.
        </p>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to load hub data" description={error} /> : null}

      {isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}

      {!isLoading ? (
        <>
          <div className="stat-grid">
            <Card className="section-card">
              <Statistic title="Active products" value={companyContext?.activeProducts.length ?? 0} />
            </Card>
            <Card className="section-card">
              <Statistic title="Research runs" value={researchRuns.length} />
            </Card>
            <Card className="section-card">
              <Statistic title="Tracked competitors" value={competitors.length} />
            </Card>
            <Card className="section-card">
              <Statistic title="Active agents" value={activeAgentCount} />
            </Card>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={15}>
              <Card className="section-card" title="Hub Mission">
                <Paragraph>
                  {companyContext?.companySummary ||
                    'Trusted Tech Hub centralizes company context, research, and operational workflows.'}
                </Paragraph>
                <Paragraph style={{ marginBottom: 0 }}>
                  {companyContext?.mission ||
                    'The first live product area is Market Researcher, with future expansion into knowledge and operations.'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} xl={9}>
              <Card className="section-card" title="Build Progress">
                <Text type="secondary">Market Research foundation</Text>
                <Progress percent={Math.min(100, 30 + researchRuns.length * 5 + activeAgentCount * 10)} strokeColor="var(--app-primary)" />
                <Text type="secondary">
                  Backend, plugin bridge, and disk-backed agent metadata are now connected.
                </Text>
              </Card>
            </Col>
          </Row>

          <Card className="section-card" title="Available Agents">
            <div className="hub-grid">
              {agents.map((agent) => (
                <Card key={agent.id} className="hub-panel" bordered={false}>
                  <div className="hub-panel-header">
                    <strong>{agent.name}</strong>
                    <Tag color={agent.status === 'active' ? 'green' : 'default'}>
                      {agent.status}
                    </Tag>
                  </div>
                  <p className="panel-copy">{agent.summary}</p>
                  <Text type="secondary">
                    Plugin tools: {agent.plugin.tools.length} | Skill outputs: {agent.outputShape.length}
                  </Text>
                </Card>
              ))}
            </div>
          </Card>

          <Card className="section-card" title="Latest Runs">
            {latestRuns.length ? (
              latestRuns.map((run) => (
                <Card key={run._id} type="inner" style={{ marginBottom: 12 }}>
                  <Title level={5} style={{ marginTop: 0 }}>
                    {run.title}
                  </Title>
                  <Paragraph>{run.objective}</Paragraph>
                  <Tag color={run.status === 'completed' ? 'green' : run.status === 'in_progress' ? 'processing' : 'default'}>
                    {run.status}
                  </Tag>
                </Card>
              ))
            ) : (
              <Text type="secondary">No research runs yet. Launch the first one from Market Researcher.</Text>
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
