import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  getCommandBoard,
  runDailyResearchNow,
  getEmailTemplate,
  saveDailySchedule,
  saveEmailTemplate,
  saveHubMember,
  type AssignableRun,
  type CommandBoard as Board,
  type DailySchedule,
  type EmailTemplate,
  type HubMember,
} from '../lib/api'

const { Text, Title } = Typography

const SIZE_OPTIONS = [
  { value: null, label: 'Any size' },
  { value: 10, label: '10 or fewer' },
  { value: 25, label: '25 or fewer' },
  { value: 50, label: '50 or fewer' },
  { value: 100, label: '100 or fewer' },
]

const CAMERA_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'not_yes', label: 'No cameras or unknown' },
  { value: 'unknown', label: 'Unknown only' },
  { value: 'yes', label: 'Has cameras' },
  { value: 'no', label: 'No cameras' },
]

const STATUS_COLOUR: Record<string, string> = {
  running: 'processing',
  stopping: 'processing',
  done: 'success',
  failed: 'error',
  stopped: 'default',
  pending: 'default',
  starting: 'processing',
  skipped: 'warning',
}

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '')

const runLabel = (run: AssignableRun) =>
  `${run.filtersLabel || run.brief || 'All agencies'} - ${run.completed}/${run.total} - ${day(run.startedAt)}`

const blank = (email: string): HubMember => ({
  email,
  name: '',
  lastSeenAt: null,
  fullAccess: false,
  assignedRunIds: [],
  limitToAssignedRuns: false,
  dailyResearch: 0,
  gmail: { connected: false, address: '' },
  scope: { states: [], agencyTypes: [], maxOfficers: null, camera: 'any' },
  notes: '',
  updatedBy: '',
  updatedAt: null,
})

const hourLabel = (hour: number, minute: number) => {
  const h12 = hour % 12 || 12
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

/**
 * The command board: each restricted account, what its map is limited to, and the
 * morning research done for it.
 *
 * One row per person, edited in place and saved as you change it. Sits under
 * the map for full-access accounts. Every limit set here is enforced by the
 * server on the map feed, so a filter someone cannot see here is not merely
 * hidden from them.
 */
export default function CommandBoard({
  states,
  onViewRun,
}: {
  states: string[]
  /** Open a run's findings - the same panel the runs menu uses. */
  onViewRun: (runId: string) => void
}) {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [runningNow, setRunningNow] = useState(false)
  const [tick, setTick] = useState(0)

  // The voicemail follow-up, as it will be sent from each person's Gmail.
  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  useEffect(() => {
    let cancelled = false
    getEmailTemplate('voicemail-followup')
      .then((next) => {
        if (!cancelled) setTemplate(next)
      })
      .catch(() => {
        if (!cancelled) setTemplate(null)
      })
    return () => {
      cancelled = true
    }
  }, [])
  // The latest edit, kept in a ref from the handler so the save timer never
  // reads a stale closure.
  const templateRef = useRef<EmailTemplate | null>(null)
  const templateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTemplate = (change: Partial<Pick<EmailTemplate, 'subject' | 'body'>>) => {
    const next = template ? { ...template, ...change } : null
    if (!next) return
    templateRef.current = next
    setTemplate(next)
    if (templateTimer.current) clearTimeout(templateTimer.current)
    templateTimer.current = setTimeout(() => {
      const current = templateRef.current
      if (!current) return
      setTemplateSaving(true)
      saveEmailTemplate('voicemail-followup', { subject: current.subject, body: current.body })
        .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not save the template.'))
        .finally(() => setTemplateSaving(false))
    }, 800)
  }

  useEffect(() => {
    let cancelled = false
    getCommandBoard()
      .then((next) => {
        if (!cancelled) setBoard(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the command board.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const reload = () => {
    setLoading(true)
    setTick((n) => n + 1)
  }

  // While a morning is in progress the board follows it, so the status bar
  // moves without anyone pressing Refresh.
  const inFlight = Boolean(
    board?.schedule.days[0] &&
      !board.schedule.days[0].finishedAt &&
      board.schedule.days[0].plan.some((entry) => ['pending', 'starting', 'running'].includes(entry.status)),
  )
  useEffect(() => {
    if (!inFlight) return
    const timer = setInterval(() => setTick((n) => n + 1), 20 * 1000)
    return () => clearInterval(timer)
  }, [inFlight])

  const runOptions = useMemo(
    () => (board?.runs ?? []).map((run) => ({ value: run.id, label: runLabel(run) })),
    [board?.runs],
  )
  const runsById = useMemo(
    () => new Map((board?.runs ?? []).map((run) => [run.id, run])),
    [board?.runs],
  )

  // Rows edit optimistically and save a beat later, so changing three things
  // in a row is one request rather than three racing ones.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const update = (email: string, change: (m: HubMember) => HubMember) => {
    setBoard((current) => {
      if (!current) return current
      const exists = current.members.some((m) => m.email === email)
      const members = exists
        ? current.members.map((m) => (m.email === email ? change(m) : m))
        : [...current.members, change(blank(email))]
      const next = members.find((m) => m.email === email)
      if (next) {
        clearTimeout(timers.current[email])
        timers.current[email] = setTimeout(() => {
          setSaving((s) => ({ ...s, [email]: true }))
          saveHubMember(email, {
            name: next.name,
            assignedRunIds: next.assignedRunIds,
            limitToAssignedRuns: next.limitToAssignedRuns,
            dailyResearch: next.dailyResearch,
            scope: next.scope,
            notes: next.notes,
          })
            .catch((err: unknown) => {
              message.error(err instanceof Error ? err.message : `Could not save ${email}.`)
            })
            .finally(() => setSaving((s) => ({ ...s, [email]: false })))
        }, 600)
      }
      return { ...current, members }
    })
  }

  const scheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateSchedule = (change: Partial<DailySchedule>, immediate = false) => {
    setBoard((current) => (current ? { ...current, schedule: { ...current.schedule, ...change } } : current))
    if (scheduleTimer.current) clearTimeout(scheduleTimer.current)
    scheduleTimer.current = setTimeout(
      () => {
        saveDailySchedule(change)
          .then((saved) =>
            setBoard((current) => (current ? { ...current, schedule: { ...current.schedule, ...saved } } : current)),
          )
          .catch((err: unknown) => {
            message.error(err instanceof Error ? err.message : 'Could not save the schedule.')
          })
      },
      immediate ? 0 : 600,
    )
  }

  const runNow = () => {
    setRunningNow(true)
    runDailyResearchNow()
      .then((result) => {
        message.success(`Started today's research (${result.date}). The traveller works through each person in turn.`)
        reload()
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not start.')
      })
      .finally(() => setRunningNow(false))
  }

  const add = () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@')) {
      message.warning('Enter an email address.')
      return
    }
    setNewEmail('')
    update(email, (m) => m)
  }

  const restricted = (board?.members ?? []).filter((m) => !m.fullAccess)
  const admins = (board?.members ?? []).filter((m) => m.fullAccess)
  const schedule = board?.schedule
  const dailyTotal = restricted.reduce((n, m) => n + (m.dailyResearch || 0), 0)

  const columns = [
    {
      title: 'Person',
      key: 'person',
      width: 200,
      render: (_: unknown, m: HubMember) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            {m.name || m.email}
          </Text>
          {m.name ? (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {m.email}
            </Text>
          ) : null}
          <Text type="secondary" style={{ fontSize: 11 }}>
            {saving[m.email]
              ? 'Saving...'
              : m.lastSeenAt
                ? `Signed in ${day(m.lastSeenAt)}`
                : 'Not signed in since the board went up'}
          </Text>
          <Text type={m.gmail.connected ? 'success' : 'secondary'} style={{ fontSize: 11 }}>
            {m.gmail.connected ? `Gmail: ${m.gmail.address}` : 'Gmail not connected'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Daily research',
      key: 'daily',
      width: 110,
      render: (_: unknown, m: HubMember) => (
        <InputNumber
          size="small"
          min={0}
          max={500}
          precision={0}
          style={{ width: 90 }}
          value={m.dailyResearch}
          onChange={(value) => update(m.email, (x) => ({ ...x, dailyResearch: value ?? 0 }))}
        />
      ),
    },
    {
      title: 'Map scope',
      key: 'scope',
      width: 330,
      render: (_: unknown, m: HubMember) => (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space size={4} style={{ width: '100%' }}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              size="small"
              maxTagCount="responsive"
              style={{ width: 150 }}
              placeholder="All states"
              value={m.scope.states}
              onChange={(value) => update(m.email, (x) => ({ ...x, scope: { ...x.scope, states: value } }))}
              options={states.map((code) => ({ value: code, label: code }))}
            />
            <Select
              mode="multiple"
              allowClear
              size="small"
              maxTagCount="responsive"
              style={{ width: 160 }}
              placeholder="All types"
              value={m.scope.agencyTypes}
              onChange={(value) => update(m.email, (x) => ({ ...x, scope: { ...x.scope, agencyTypes: value } }))}
              options={(board?.agencyTypes ?? []).map((type) => ({ value: type, label: type }))}
            />
          </Space>
          <Space size={4}>
            <Select
              size="small"
              style={{ width: 150 }}
              value={m.scope.maxOfficers}
              onChange={(value) => update(m.email, (x) => ({ ...x, scope: { ...x.scope, maxOfficers: value } }))}
              options={SIZE_OPTIONS}
            />
            <Select
              size="small"
              style={{ width: 160 }}
              value={m.scope.camera}
              onChange={(value) => update(m.email, (x) => ({ ...x, scope: { ...x.scope, camera: value } }))}
              options={CAMERA_OPTIONS}
            />
          </Space>
        </Space>
      ),
    },
    {
      title: 'Their research runs',
      key: 'runs',
      render: (_: unknown, m: HubMember) => {
        const theirs = m.assignedRunIds
          .map((id) => runsById.get(id))
          .filter((run): run is AssignableRun => Boolean(run))
          .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {theirs.length ? (
              theirs.slice(0, 8).map((run) => (
                <Space key={run.id} size={6} wrap>
                  <Text style={{ fontSize: 12 }}>{day(run.startedAt)}</Text>
                  <Tag color={STATUS_COLOUR[run.status] || 'default'} style={{ marginInlineEnd: 0 }}>
                    {run.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {run.completed}/{run.total}
                    {run.foundCameras ? ` · ${run.foundCameras} cameras` : ''}
                    {run.foundEmails ? ` · ${run.foundEmails} emails` : ''}
                    {run.assignedTo ? '' : ' · assigned by hand'}
                  </Text>
                  <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onViewRun(run.id)}>
                    View
                  </Button>
                </Space>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                None yet
              </Text>
            )}
            {theirs.length > 8 ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                and {theirs.length - 8} more
              </Text>
            ) : null}
            <Space size={4} wrap>
              <Select
                mode="multiple"
                allowClear
                size="small"
                maxTagCount={0}
                style={{ width: 170 }}
                placeholder="Assign a run by hand"
                value={m.assignedRunIds}
                onChange={(value) => update(m.email, (x) => ({ ...x, assignedRunIds: value }))}
                options={runOptions}
                optionFilterProp="label"
              />
              <Checkbox
                checked={m.limitToAssignedRuns}
                onChange={(event) => update(m.email, (x) => ({ ...x, limitToAssignedRuns: event.target.checked }))}
              >
                <Text style={{ fontSize: 11 }}>Map shows only these</Text>
              </Checkbox>
            </Space>
          </Space>
        )
      },
    },
  ]

  return (
    <Card className="section-card">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <Title level={5} style={{ marginBottom: 4 }}>
            Command board
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Each person without full access: what their map is limited to, and the research done
            for them. They get no filter controls - their map is their scope plus everything
            researched for them, nothing else. Changes save as you make them and apply on their
            next reload.
          </Text>
        </div>

        {error ? <Text type="danger">{error}</Text> : null}

        {schedule ? (
          <Card size="small" className="section-card">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap size={12} align="center">
                <Switch
                  checked={schedule.enabled}
                  onChange={(enabled) => updateSchedule({ enabled }, true)}
                />
                <Text strong>Morning research</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Every day at
                </Text>
                <Select
                  size="small"
                  style={{ width: 110 }}
                  value={schedule.hour}
                  onChange={(hour) => updateSchedule({ hour }, true)}
                  options={Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: hourLabel(hour, 0) }))}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Pacific · {dailyTotal} agencies a day across {restricted.filter((m) => m.dailyResearch > 0).length}{' '}
                  people
                  {schedule.enabled && schedule.nextFireAt
                    ? ` · next ${new Date(schedule.nextFireAt).toLocaleString()}`
                    : ' · off'}
                </Text>
                <Popconfirm
                  title="Run today's research now?"
                  description={`Researches ${dailyTotal} agencies right away, one person at a time. Today will not run again at the hour.`}
                  onConfirm={runNow}
                >
                  <Button size="small" loading={runningNow} disabled={!dailyTotal}>
                    Run today now
                  </Button>
                </Popconfirm>
              </Space>

              <Space wrap size={8} align="center">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Picks are random, never researched, from:
                </Text>
                <Select
                  size="small"
                  style={{ width: 200 }}
                  value={schedule.pick.camera}
                  onChange={(value) => updateSchedule({ pick: { ...schedule.pick, camera: value } })}
                  options={[
                    { value: 'unknown', label: 'Camera status unknown' },
                    { value: 'not_yes', label: 'No cameras or unknown' },
                    { value: 'any', label: 'Any camera status' },
                  ]}
                />
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  size="small"
                  maxTagCount="responsive"
                  style={{ width: 180 }}
                  placeholder="All states"
                  value={schedule.pick.states}
                  onChange={(value) => updateSchedule({ pick: { ...schedule.pick, states: value } })}
                  options={states.map((code) => ({ value: code, label: code }))}
                />
                <Select
                  size="small"
                  style={{ width: 130 }}
                  value={schedule.pick.maxOfficers}
                  onChange={(value) => updateSchedule({ pick: { ...schedule.pick, maxOfficers: value } })}
                  options={SIZE_OPTIONS}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {schedule.pool.toLocaleString()} left to draw from
                  {dailyTotal ? ` - about ${Math.floor(schedule.pool / dailyTotal)} days` : ''}
                </Text>
              </Space>

              <Space wrap size={8} align="center">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  When each person's run finishes, email them their leads from:
                </Text>
                <Select
                  size="small"
                  allowClear
                  placeholder="Nobody - no email"
                  style={{ width: 280 }}
                  value={schedule.notifyFrom || undefined}
                  onChange={(value) => updateSchedule({ notifyFrom: value || '' }, true)}
                  options={(board?.members ?? [])
                    .filter((m) => m.gmail.connected)
                    .map((m) => ({ value: m.email, label: `${m.name || m.email} (${m.gmail.address})` }))}
                />
                {schedule.notifyFrom && !board?.members.find((m) => m.email === schedule.notifyFrom)?.gmail.connected ? (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    {schedule.notifyFrom} has no Gmail connected, so no email goes out.
                  </Text>
                ) : null}
              </Space>

              {(() => {
                const today = schedule.days[0]
                const nameOf = (email: string) =>
                  restricted.find((m) => m.email === email)?.name || email.split('@')[0]
                const localToday = new Date().toLocaleDateString('en-CA', { timeZone: schedule.timezone })
                if (!today || today.date !== localToday) {
                  return (
                    <Space direction="vertical" size={2}>
                      <Text style={{ fontSize: 12 }}>
                        <Text strong style={{ fontSize: 12 }}>Today:</Text> not started
                        {schedule.enabled && schedule.nextFireAt
                          ? ` - runs ${new Date(schedule.nextFireAt).toLocaleString()}`
                          : schedule.enabled
                            ? ''
                            : ' - the schedule is off'}
                      </Text>
                      {today ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Last morning {today.date}:{' '}
                          {today.plan.map((e) => `${nameOf(e.email)} ${e.queued || e.count} ${e.status}`).join(' · ') || 'nobody had a daily number'}
                        </Text>
                      ) : null}
                    </Space>
                  )
                }
                const total = today.plan.reduce((n, e) => n + (e.queued || e.count), 0)
                const done = today.plan.reduce((n, e) => {
                  const run = e.runId ? runsById.get(e.runId) : undefined
                  if (run) return n + run.completed + run.failed
                  return n + (['done', 'skipped', 'failed'].includes(e.status) ? e.queued || 0 : 0)
                }, 0)
                const finished = Boolean(today.finishedAt)
                return (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text style={{ fontSize: 12 }}>
                      <Text strong style={{ fontSize: 12 }}>Today{today.trigger === 'manual' ? ' (run by hand)' : ''}:</Text>{' '}
                      {finished ? 'finished' : 'in progress'} - {done} of {total} agencies
                    </Text>
                    <Progress
                      percent={total ? Math.round((done / total) * 100) : 0}
                      status={finished ? 'success' : 'active'}
                      size="small"
                      style={{ maxWidth: 520, marginBottom: 0 }}
                    />
                    <Space wrap size={12}>
                      {today.plan.map((e) => {
                        const run = e.runId ? runsById.get(e.runId) : undefined
                        const progress = run ? `${run.completed + run.failed}/${run.total}` : `${e.queued || e.count}`
                        return (
                          <Space key={e.email} size={6}>
                            <Text style={{ fontSize: 12 }}>{nameOf(e.email)}</Text>
                            <Tag color={STATUS_COLOUR[e.status] || 'default'} style={{ marginInlineEnd: 0 }}>
                              {e.status}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 12 }} title={e.notified || ''}>
                              {progress}
                              {e.note ? ` - ${e.note}` : ''}
                              {e.notified ? (e.notified.startsWith('Emailed') ? ' · emailed' : ' · not emailed') : ''}
                            </Text>
                            {e.runId ? (
                              <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onViewRun(e.runId)}>
                                View
                              </Button>
                            ) : null}
                          </Space>
                        )
                      })}
                    </Space>
                    {schedule.days.slice(1, 4).map((d) => (
                      <Text key={d.date} type="secondary" style={{ fontSize: 12 }}>
                        {d.date}: {d.plan.map((e) => `${nameOf(e.email)} ${e.queued || e.count} ${e.status}`).join(' · ') || 'nobody had a daily number'}
                      </Text>
                    ))}
                  </Space>
                )
              })()}
            </Space>
          </Card>
        ) : null}

        <Table
          size="small"
          rowKey="email"
          loading={loading}
          columns={columns}
          dataSource={restricted}
          pagination={false}
          scroll={{ x: 1300 }}
          locale={{ emptyText: 'Nobody without full access has used the hub yet.' }}
        />

        <Space wrap>
          <Input
            size="small"
            placeholder="Add someone by email"
            style={{ width: 260 }}
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            onPressEnter={add}
          />
          <Button size="small" onClick={add}>
            Add
          </Button>
          <Button size="small" onClick={reload}>
            Refresh
          </Button>
          <Button size="small" onClick={() => setTemplateOpen(true)}>
            Edit follow-up email
          </Button>
          {admins.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Full access: {admins.map((m) => m.email).join(', ')}
            </Text>
          ) : null}
        </Space>
      </Space>

      <Modal
        title="Follow-up email"
        open={templateOpen}
        onCancel={() => setTemplateOpen(false)}
        footer={null}
        width={680}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            What "Send follow-up email" on a pin sends, from that person's own Gmail to the
            agency's address. Saves as you type.{templateSaving ? ' Saving...' : ''}
          </Text>
          <Input
            placeholder="Subject"
            value={template?.subject ?? ''}
            disabled={!template}
            onChange={(event) => updateTemplate({ subject: event.target.value })}
          />
          <Input.TextArea
            rows={10}
            placeholder="Hi {{greeting_name}},&#10;&#10;I left you a voicemail earlier today..."
            value={template?.body ?? ''}
            disabled={!template}
            onChange={(event) => updateTemplate({ body: event.target.value })}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Placeholders:{' '}
            {(template?.placeholders ?? []).map(([key, help]) => (
              <span key={key} title={help} style={{ marginInlineEnd: 8, whiteSpace: 'nowrap' }}>
                <code>{`{{${key}}}`}</code>
              </span>
            ))}
          </Text>
        </Space>
      </Modal>
    </Card>
  )
}
