import { useEffect, useState } from 'react'
import { Button, Card, Checkbox, Space, Table, Tag, Tooltip, Typography } from 'antd'
import {
  getResearchRunFindings,
  type AssignableRun,
  type CallLaterList,
  type CallLaterListRow,
  type ResearchRunFindingRow,
  type ResearchRunFindings,
} from '../lib/api'

const { Text, Title } = Typography

const CAMERA_COLOUR: Record<string, string> = {
  Yes: 'red',
  No: 'green',
  Planned: 'orange',
  Unknown: 'gold',
  'Not researched': 'default',
}

/** What the map knows about calls to one agency. Absent means never called. */
export type LeadCallState = {
  callCount: number
  lastCalledAt: string | null
  lastOutcome: string
  callLater: boolean
}

const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

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
  callLaterLists = [],
  callState,
  onLocate,
  onCallResult,
}: {
  runs: AssignableRun[]
  /**
   * The Friday call-later lists sent to this person. Each is that Friday's
   * entry on the board, in place of a morning's research.
   */
  callLaterLists?: CallLaterList[]
  /** Call state by ORI, live from the map. */
  callState: Map<string, LeadCallState>
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

  // One block per morning: a top-up is a second run on the same day and
  // belongs with the first, not under its own heading.
  const days = new Map<string, AssignableRun[]>()
  for (const run of [...runs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))) {
    const key = run.startedAt ? new Date(run.startedAt).toDateString() : 'undated'
    days.set(key, [...(days.get(key) ?? []), run])
  }
  // Research mornings and Friday lists share one timeline, newest first.
  type Entry = { at: string; runs: AssignableRun[]; list?: undefined } | { at: string; list: CallLaterList; runs?: undefined }
  const ordered: Entry[] = [
    ...[...days.values()].map((dayRuns) => ({ at: dayRuns[0].startedAt || '', runs: dayRuns })),
    ...callLaterLists.map((list) => ({ at: list.at, list })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  // One morning on screen at a time, newest first, with arrows to step back.
  // A list of every morning stacked up would be a wall after a fortnight.
  const [dayIndex, setDayIndex] = useState(0)
  // Done leads stay listed - a person wants to see what they got through -
  // but sink to the bottom, and can be hidden to leave just the work left.
  const [hideDone, setHideDone] = useState(false)
  const idx = Math.min(dayIndex, Math.max(ordered.length - 1, 0))
  const current = ordered[idx]

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
      title: 'Status',
      key: 'status',
      width: 170,
      render: (_: unknown, row: ResearchRunFindingRow) => {
        const state = callState.get(row.ori)
        if (!state) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              To do
            </Text>
          )
        }
        return (
          <Space direction="vertical" size={0}>
            <Tag color={state.callLater ? 'magenta' : 'green'} style={{ marginInlineEnd: 0 }}>
              {state.callLater ? 'Call later' : 'Done'}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {[
                state.callCount > 1 ? `${state.callCount} calls` : 'Called',
                shortDate(state.lastCalledAt),
                state.lastOutcome && !state.callLater ? state.lastOutcome : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Space>
        )
      },
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

  // A call-later row is done once somebody logs a call after the list went
  // out - they all had a call before it, which is why they are on it.
  const calledSince = (row: CallLaterListRow, list: CallLaterList) => {
    const state = callState.get(row.ori)
    return Boolean(state?.lastCalledAt && new Date(state.lastCalledAt) > new Date(list.at))
  }

  const callLaterColumns = (list: CallLaterList) => [
    {
      title: 'Agency',
      key: 'agency',
      render: (_: unknown, row: CallLaterListRow) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            {row.agency}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[row.county ? `${row.county} County` : '', row.state].filter(Boolean).join(' · ')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Ask for',
      key: 'contact',
      render: (_: unknown, row: CallLaterListRow) =>
        row.contact ? (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>{row.contact}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.contactTitle}
            </Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Not known
          </Text>
        ),
    },
    {
      title: 'Reach them',
      key: 'reach',
      render: (_: unknown, row: CallLaterListRow) => (
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
      title: 'Last call',
      key: 'last',
      width: 220,
      render: (_: unknown, row: CallLaterListRow) => (
        <Space direction="vertical" size={0}>
          <Tag color="magenta" style={{ marginInlineEnd: 0 }}>
            {row.outcome || 'Call later'}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[
              shortDate(row.calledAt),
              row.loggedBy.includes('@') ? row.loggedBy.split('@')[0] : '',
              row.followUpAt ? `due ${shortDate(row.followUpAt)}` : '',
              row.callCount > 1 ? `${row.callCount} calls` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {row.notes ? (
            <Tooltip title={row.notes}>
              <Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 200 }}>
                "{row.notes}"
              </Text>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 170,
      render: (_: unknown, row: CallLaterListRow) => {
        const state = callState.get(row.ori)
        if (!state || !calledSince(row, list)) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              To call back
            </Text>
          )
        }
        return (
          <Space direction="vertical" size={0}>
            <Tag color={state.callLater ? 'magenta' : 'green'} style={{ marginInlineEnd: 0 }}>
              {state.callLater ? 'Call later' : 'Done'}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {['Called', shortDate(state.lastCalledAt), state.lastOutcome && !state.callLater ? state.lastOutcome : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Space>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: CallLaterListRow) => (
        <Space size={6}>
          <Button size="small" onClick={() => onLocate(row.ori)}>
            Show on map
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => onCallResult(row.ori, row.agency, row.phone, row.contact, row.contactTitle)}
          >
            Call Result
          </Button>
        </Space>
      ),
    },
  ]

  if (!current) return null

  const stepper = (
    <Space size={8} align="center">
      <Button size="small" disabled={idx >= ordered.length - 1} onClick={() => setDayIndex(idx + 1)}>
        ← Earlier
      </Button>
      <Text strong style={{ fontSize: 15 }}>
        {dateOf(current.at || null)}
      </Text>
      {current.list ? (
        <Tag color="magenta" style={{ marginInlineEnd: 0 }}>
          Call-backs
        </Tag>
      ) : null}
      {current.runs?.some((run) => run.coveringFor) ? (
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          Covering: {[...new Set(current.runs.map((run) => run.coveringFor).filter(Boolean))].map((who) => `${who}'s leads`).join(' · ')}
        </Tag>
      ) : null}
      <Button size="small" disabled={idx <= 0} onClick={() => setDayIndex(idx - 1)}>
        {idx === 1 ? 'Latest →' : 'Later →'}
      </Button>
    </Space>
  )

  if (current.list) {
    const list = current.list
    const done = (row: CallLaterListRow) => calledSince(row, list)
    const doneCount = list.rows.filter(done).length
    const listRows = [...list.rows.filter((row) => !done(row)), ...(hideDone ? [] : list.rows.filter(done))]
    return (
      <Card className="section-card">
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <Title level={5} style={{ marginBottom: 4 }}>
              Your leads
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              This week's call-backs: the {list.rows.length} pink pins that had waited longest when the list went
              out{list.total > list.rows.length ? ` (of ${list.total} waiting)` : ''}. The list stays as it is all
              week; each one is done once a new call is logged.
            </Text>
          </div>
          <Space wrap size={10} align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            {stepper}
            <Space size={12} align="center">
              <Text type="secondary" style={{ fontSize: 12 }}>
                {list.rows.length} call-backs · {doneCount} done · {list.rows.length - doneCount} to do
                {ordered.length > 1 ? ` · ${idx + 1} of ${ordered.length}` : ''}
              </Text>
              <Checkbox checked={hideDone} onChange={(event) => setHideDone(event.target.checked)}>
                <Text style={{ fontSize: 12 }}>Hide done</Text>
              </Checkbox>
            </Space>
          </Space>
          <Table
            size="small"
            rowKey="ori"
            columns={callLaterColumns(list)}
            dataSource={listRows}
            rowClassName={(row) => (done(row) ? 'lead-done' : '')}
            pagination={listRows.length > 25 ? { pageSize: 25, size: 'small' } : false}
            scroll={{ x: 800 }}
          />
        </Space>
      </Card>
    )
  }

  const currentRuns = current.runs
  const loaded = currentRuns.every((run) => findings[run.id])
  // A lead is an agency not yet running cameras: an unknown - nothing
  // published either way - or a purchase only planned, which is the call to
  // make before the order goes out. A yes is ruled out; a no is on the map
  // but not here.
  const leads = currentRuns
    .flatMap((run) => findings[run.id]?.rows ?? [])
    .filter((row) => row.cameras === 'Unknown' || row.cameras === 'Planned')
  const isDone = (row: ResearchRunFindingRow) => callState.has(row.ori)
  const doneCount = leads.filter(isDone).length
  // Work left first, done underneath, each in the run's own order.
  const rows = [...leads.filter((row) => !isDone(row)), ...(hideDone ? [] : leads.filter(isDone))]
  const running = currentRuns.some((run) => run.status === 'running')

  return (
    <Card className="section-card">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <Title level={5} style={{ marginBottom: 4 }}>
            Your leads
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Agencies the traveller researched for you that are not running cameras yet - unknown,
            or a purchase only planned. Every one is also a pin on the map above.
          </Text>
        </div>

        <Space wrap size={10} align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          {stepper}
          <Space size={12} align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>
              {loaded ? `${leads.length} leads · ${doneCount} done · ${leads.length - doneCount} to do` : 'Loading...'}
              {running ? ' · still researching' : ''}
              {ordered.length > 1 ? ` · morning ${idx + 1} of ${ordered.length}` : ''}
            </Text>
            <Checkbox checked={hideDone} onChange={(event) => setHideDone(event.target.checked)}>
              <Text style={{ fontSize: 12 }}>Hide done</Text>
            </Checkbox>
          </Space>
        </Space>

        <Table
          size="small"
          rowKey="ori"
          columns={columns}
          dataSource={rows}
          rowClassName={(row) => (isDone(row) ? 'lead-done' : '')}
          loading={!loaded}
          pagination={rows.length > 25 ? { pageSize: 25, size: 'small' } : false}
          scroll={{ x: 800 }}
        />
      </Space>
    </Card>
  )
}
