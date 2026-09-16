import { useEffect, useState } from 'react'
import { Button, Card, Space, Table, Tag, Typography } from 'antd'
import {
  getResearchRunFindings,
  type AssignableRun,
  type ResearchRunFindingRow,
  type ResearchRunFindings,
} from '../lib/api'

const { Text, Title } = Typography

const CAMERA_COLOUR: Record<string, string> = {
  Yes: 'red',
  No: 'green',
  Unknown: 'gold',
  'Not researched': 'default',
}

const dateOf = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Undated'

/**
 * The leads the traveller found for this person, under their map.
 *
 * One block per morning, newest first, the date on top and the agencies
 * under it with what was found: who to ask for, how to reach them, and
 * whether they already have cameras. Each row can put the pin on screen or
 * open the call log, so this is where a morning's work starts.
 */
export default function LeadsBoard({
  runs,
  onLocate,
  onCallResult,
}: {
  runs: AssignableRun[]
  /** Fly the map to this agency and open its pin. */
  onLocate: (ori: string) => void
  onCallResult: (ori: string, name: string, phone: string, chiefName: string, chiefTitle: string) => void
}) {
  const [findings, setFindings] = useState<Record<string, ResearchRunFindings>>({})

  useEffect(() => {
    let cancelled = false
    const missing = runs.filter((run) => !findings[run.id])
    if (!missing.length) return
    Promise.all(
      missing.map((run) =>
        getResearchRunFindings(run.id)
          .then((result) => [run.id, result] as const)
          .catch(() => null),
      ),
    ).then((loaded) => {
      if (cancelled) return
      setFindings((current) => {
        const next = { ...current }
        for (const item of loaded) if (item) next[item[0]] = item[1]
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // Only fetch what is new; findings of a finished run never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs])

  const ordered = [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))

  const columns = [
    {
      title: 'Agency',
      key: 'agency',
      render: (_: unknown, row: ResearchRunFindingRow) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            {row.agency}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[row.county ? `${row.county} County` : '', row.state, row.officers !== null ? `${row.officers} officers` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Decision maker',
      key: 'chief',
      render: (_: unknown, row: ResearchRunFindingRow) =>
        row.chief ? (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>{row.chief}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.chiefTitle}
            </Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Not found
          </Text>
        ),
    },
    {
      title: 'Reach them',
      key: 'reach',
      render: (_: unknown, row: ResearchRunFindingRow) => (
        <Space direction="vertical" size={0}>
          {row.phone ? (
            <a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`} style={{ fontSize: 13 }}>
              {row.phone}
            </a>
          ) : null}
          {row.email ? (
            <a href={`mailto:${row.email}`} style={{ fontSize: 12 }}>
              {row.email}
            </a>
          ) : null}
          {!row.phone && !row.email ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No contact found
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Cameras',
      key: 'cameras',
      width: 150,
      render: (_: unknown, row: ResearchRunFindingRow) => (
        <Space direction="vertical" size={0}>
          <Tag color={CAMERA_COLOUR[row.cameras] || 'default'} style={{ marginInlineEnd: 0 }}>
            {row.cameras}
          </Tag>
          {row.vendor ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.vendor}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: ResearchRunFindingRow) => (
        <Space size={6}>
          <Button size="small" onClick={() => onLocate(row.ori)}>
            Show on map
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => onCallResult(row.ori, row.agency, row.phone, row.chief, row.chiefTitle)}
          >
            Call Result
          </Button>
        </Space>
      ),
    },
  ]

  if (!ordered.length) return null

  return (
    <Card className="section-card">
      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <div>
          <Title level={5} style={{ marginBottom: 4 }}>
            Your leads
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            What the traveller found for you, newest morning first. Every one of these is also a
            pin on the map above.
          </Text>
        </div>
        {ordered.map((run) => {
          const result = findings[run.id]
          const rows = (result?.rows ?? []).filter((row) => row.cameras !== 'Not researched')
          return (
            <div key={run.id}>
              <Space wrap size={10} align="center" style={{ marginBottom: 8 }}>
                <Text strong>{dateOf(run.startedAt)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {result ? `${rows.length} leads` : 'Loading...'}
                  {run.status === 'running' ? ' · still researching' : ''}
                </Text>
              </Space>
              <Table
                size="small"
                rowKey="ori"
                columns={columns}
                dataSource={rows}
                loading={!result}
                pagination={rows.length > 25 ? { pageSize: 25, size: 'small' } : false}
                scroll={{ x: 800 }}
              />
            </div>
          )
        })}
      </Space>
    </Card>
  )
}
