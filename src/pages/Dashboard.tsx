import { Card, Divider, Statistic } from 'antd'

export default function Dashboard() {
  return (
    <div className="page">
      <div>
        <h1 className="page-title">Pipeline overview</h1>
        <p className="page-subtitle">
          A quick pulse on revenue, renewals, and account activity.
        </p>
      </div>

      <div className="stat-grid">
        <Card className="section-card">
          <Statistic title="Active deals" value={38} />
        </Card>
        <Card className="section-card">
          <Statistic title="Revenue at risk" value={128000} prefix="$" />
        </Card>
        <Card className="section-card">
          <Statistic title="New leads" value={12} />
        </Card>
        <Card className="section-card">
          <Statistic title="Renewals this month" value={7} />
        </Card>
      </div>

      <Card className="section-card" title="Priority accounts">
        <p>
          Focus on accounts with expiring contracts and follow-ups scheduled in
          the next two weeks.
        </p>
        <Divider />
        <div className="table-shell">
          <p>
            Keep this area for your upcoming deals list or a lightweight table.
          </p>
        </div>
      </Card>
    </div>
  )
}
