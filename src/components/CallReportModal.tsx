import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Divider,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Typography,
  message,
} from 'antd'
import {
  downloadCallReportPdf,
  getCallReport,
  type CallReport,
  type LeAgencyQuery,
} from '../lib/api'

const { Text } = Typography

/** A local `YYYY-MM-DD`, which is what the date inputs and the server both want. */
function isoDay(date: Date) {
  const local = new Date(date)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

function daysAgo(count: number) {
  const date = new Date()
  date.setDate(date.getDate() - count)
  return isoDay(date)
}

/**
 * The windows anybody actually asks for.
 *
 * "Last 7 days" rather than a pair of dates, because the question is almost
 * always "how did the week go" and typing two dates to ask it is friction on
 * the one report a manager might run every Friday.
 */
const PRESETS: { value: string; label: string; range: () => { from: string; to: string } }[] = [
  { value: 'today', label: 'Today', range: () => ({ from: isoDay(new Date()), to: isoDay(new Date()) }) },
  { value: '7', label: 'Last 7 days', range: () => ({ from: daysAgo(6), to: isoDay(new Date()) }) },
  { value: '30', label: 'Last 30 days', range: () => ({ from: daysAgo(29), to: isoDay(new Date()) }) },
  {
    value: 'month',
    label: 'This month',
    range: () => {
      const start = new Date()
      start.setDate(1)
      return { from: isoDay(start), to: isoDay(new Date()) }
    },
  },
]

const formatDay = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * Call activity across the territory, as a PDF.
 *
 * The per-agency call log answers "what happened at this department". This
 * answers "what happened this week" - how many calls went out, how many of them
 * reached a human, and what those humans said - which is the question the
 * territory actually gets managed by.
 *
 * The figures shown here are counted in Mongo and are the same ones the PDF
 * prints; Hermes only writes the words around them, and only when the PDF is
 * asked for, because he reads every call note in the period to do it.
 */
export default function CallReportModal({
  open,
  onClose,
  filters,
}: {
  open: boolean
  onClose: () => void
  /** The map's current filters, so the report covers what the user is looking at. */
  filters: LeAgencyQuery
}) {
  const [preset, setPreset] = useState('7')
  const [range, setRange] = useState(() => PRESETS[1].range())
  const [scoped, setScoped] = useState(true)
  const [report, setReport] = useState<CallReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

  const scope = useMemo(() => (scoped ? filters : {}), [scoped, filters])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    getCallReport(range, scope)
      .then((result) => {
        if (!cancelled) setReport(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setReport(null)
        setError(err instanceof Error ? err.message : 'Could not count the calls.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, range, scope])

  const applyPreset = (value: string) => {
    setPreset(value)
    const found = PRESETS.find((item) => item.value === value)
    if (found) setRange(found.range())
  }

  const setEdge = (edge: 'from' | 'to', value: string) => {
    if (!value) return
    setPreset('custom')
    setRange((current) => ({ ...current, [edge]: value }))
  }

  const download = () => {
    setBuilding(true)
    downloadCallReportPdf(range, scope)
      .then(() => message.success('Report downloaded.'))
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not build the report.')
      })
      .finally(() => setBuilding(false))
  }

  const totals = report?.totals
  const busiest = Math.max(1, ...(report?.byDay || []).map((day) => day.calls))
  const invertedRange = range.from > range.to

  return (
    <Modal
      title="Call activity report"
      open={open}
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="pdf"
          type="primary"
          loading={building}
          disabled={!totals?.calls || invertedRange}
          onClick={download}
        >
          {building ? 'Hermes is writing it' : 'Download PDF'}
        </Button>,
      ]}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Every call logged against these agencies between these dates. The PDF adds a written
          summary from Hermes, drawn from what the SDRs typed after each call.
        </Text>

        <Space size={10} wrap>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Period
            </Text>
            <Select
              style={{ width: 160 }}
              value={preset}
              onChange={applyPreset}
              options={[
                ...PRESETS.map((item) => ({ value: item.value, label: item.label })),
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              From
            </Text>
            <Input
              type="date"
              style={{ width: 170 }}
              value={range.from}
              onChange={(event) => setEdge('from', event.target.value)}
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              To
            </Text>
            <Input
              type="date"
              style={{ width: 170 }}
              value={range.to}
              onChange={(event) => setEdge('to', event.target.value)}
            />
          </div>
        </Space>

        <Checkbox checked={scoped} onChange={(event) => setScoped(event.target.checked)}>
          Only the agencies the map is filtered to
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            {/* The server's own description of the filter, so this and the PDF
                cannot disagree about what the report covers. */}
            {scoped ? report?.scopeLabel || 'All agencies' : 'Every agency in the database'}
          </Text>
        </Checkbox>

        {invertedRange ? (
          <Alert type="warning" showIcon message="The start date is after the end date." />
        ) : null}
        {error ? <Alert type="warning" showIcon message={error} /> : null}

        {loading ? (
          <Spin />
        ) : totals && totals.calls ? (
          <>
            <Row gutter={12}>
              <Col span={6}>
                <Statistic title="Calls logged" value={totals.calls} />
              </Col>
              <Col span={6}>
                <Statistic title="Agencies rung" value={totals.agenciesCalled} />
              </Col>
              <Col span={6}>
                <Statistic title="Reached a person" value={totals.conversations} />
              </Col>
              <Col span={6}>
                <Statistic title="Decision makers" value={totals.decisionMakers} />
              </Col>
            </Row>

            <Text type="secondary" style={{ fontSize: 12 }}>
              {totals.connectRate}% of calls reached somebody. {totals.callsPerDay} calls a day
              across {totals.days} {totals.days === 1 ? 'day' : 'days'}, {totals.firstContacts}{' '}
              {totals.firstContacts === 1 ? 'agency' : 'agencies'} rung for the first time.
            </Text>

            <Divider style={{ margin: '2px 0' }}>Calls per day</Divider>
            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
              {(report?.byDay || []).map((day) => (
                <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, width: 58, flex: 'none' }}>
                    {formatDay(day.date)}
                  </Text>
                  <div
                    style={{
                      height: 9,
                      borderRadius: 3,
                      width: `${(day.calls / busiest) * 70}%`,
                      minWidth: day.calls ? 3 : 0,
                      background: '#7fc4e8',
                    }}
                  />
                  <Text style={{ fontSize: 12 }}>{day.calls || ''}</Text>
                </div>
              ))}
            </div>

            <Divider style={{ margin: '2px 0' }}>How the calls went</Divider>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {(report?.byOutcome || []).map((row) => (
                <div key={row.outcome} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12 }}>{row.outcome}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {row.calls} {row.calls === 1 ? 'call' : 'calls'} -{' '}
                    {Math.round((row.calls / totals.calls) * 100)}%
                  </Text>
                </div>
              ))}
            </Space>

            {report?.followUps.length ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {report.followUps.length} call-{report.followUps.length === 1 ? 'back' : 'backs'}{' '}
                booked on these calls. They are listed in the PDF.
              </Text>
            ) : null}
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No calls were logged against these agencies in this period."
          />
        )}
      </Space>
    </Modal>
  )
}
