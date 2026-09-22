import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Modal, Popconfirm, Space, Spin, Switch, Tooltip, Typography, message, theme } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarConnectUrl,
  getCalendarEvents,
  getCalendarStatus,
  updateCalendarEvent,
  type CalendarEvent,
  type GmailStatus,
} from '../lib/api'

const { Text, Title } = Typography

/** The Google Calendar page-with-a-date mark, drawn inline so there is nothing to load. */
export const CalendarGlyph = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
    <path
      d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 5v11h14V8H5z"
      fill="currentColor"
    />
    <path d="M8 1.5v4M16 1.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 11h4v4h-4z" fill="currentColor" />
  </svg>
)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Local calendar days, as YYYY-MM-DD.
 *
 * Everything in this panel keys off these strings rather than Date objects,
 * because "which square does this event go in" is a question about the
 * person's own day and not about an instant. `dateOnly` builds the Date from
 * the parts on purpose: `new Date('2026-09-22')` is parsed as UTC midnight
 * and lands on the 21st for anyone west of Greenwich.
 */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dateOnly = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const addDays = (d: Date, n: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '')

const longDay = (key: string) =>
  dateOnly(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

/**
 * When an event runs, in one line.
 *
 * A conference booked across three days must say so rather than naming the
 * Thursday it started on, which means undoing Google's exclusive all-day end
 * here too.
 */
const spanLabel = (event: CalendarEvent) => {
  if (event.allDay) {
    const first = event.start.slice(0, 10)
    const last = dayKey(addDays(dateOnly(event.end || event.start), -1))
    return last > first ? `All day · ${longDay(first)} – ${longDay(last)}` : `All day · ${longDay(first)}`
  }
  const first = dayKey(new Date(event.start))
  const last = dayKey(new Date(event.end || event.start))
  return first === last
    ? `${longDay(first)} · ${timeOf(event.start)} – ${timeOf(event.end)}`
    : `${longDay(first)}, ${timeOf(event.start)} – ${longDay(last)}, ${timeOf(event.end)}`
}

/**
 * Every square an event occupies.
 *
 * Google gives an all-day event an exclusive end - a single day on the 22nd
 * ends on the 23rd - so the walk stops before it. A timed event that ends
 * exactly at midnight is likewise finished with the day before, not starting
 * the next one.
 */
const daysCovered = (event: CalendarEvent): string[] => {
  const out: string[] = []
  if (event.allDay) {
    const start = dateOnly(event.start)
    const endExclusive = dateOnly(event.end || event.start)
    for (let d = start; d < endExclusive && out.length < 400; d = addDays(d, 1)) out.push(dayKey(d))
    return out.length ? out : [dayKey(start)]
  }
  const start = new Date(event.start)
  const end = new Date(event.end || event.start)
  if (Number.isNaN(start.getTime())) return []
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end && out.length < 400; d = addDays(d, 1)) {
    out.push(dayKey(d))
  }
  const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0
  if (endsAtMidnight && out.length > 1) out.pop()
  return out
}

/** What the create/edit form holds. Dates and times are the values of native inputs. */
type EventForm = {
  id: string
  summary: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  location: string
  guests: string
  description: string
}

const blankForm = (day: string): EventForm => {
  const now = new Date()
  const hour = String(Math.min(now.getHours() + 1, 22)).padStart(2, '0')
  return {
    id: '',
    summary: '',
    allDay: false,
    startDate: day,
    startTime: `${hour}:00`,
    endDate: day,
    endTime: `${String(Math.min(Number(hour) + 1, 23)).padStart(2, '0')}:00`,
    location: '',
    guests: '',
    description: '',
  }
}

const formFor = (event: CalendarEvent): EventForm => {
  if (event.allDay) {
    // Back from the exclusive end to the last day the person actually picked.
    const lastDay = dayKey(addDays(dateOnly(event.end || event.start), -1))
    return {
      id: event.id,
      summary: event.summary,
      allDay: true,
      startDate: event.start.slice(0, 10),
      startTime: '09:00',
      endDate: lastDay < event.start.slice(0, 10) ? event.start.slice(0, 10) : lastDay,
      endTime: '10:00',
      location: event.location,
      guests: event.attendees.map((a) => a.email).join(', '),
      description: event.description,
    }
  }
  const start = new Date(event.start)
  const end = new Date(event.end || event.start)
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return {
    id: event.id,
    summary: event.summary,
    allDay: false,
    startDate: dayKey(start),
    startTime: hhmm(start),
    endDate: dayKey(end),
    endTime: hhmm(end),
    location: event.location,
    guests: event.attendees.map((a) => a.email).join(', '),
    description: event.description,
  }
}

/**
 * The person's own Google Calendar, on the connection they made for Gmail.
 *
 * A month grid with the events in their squares; click a day to read it, an
 * event to open it, and Create to add one. Edits and cancellations go back to
 * Google and the guests are told, which is the whole reason this is not a
 * read-only wall chart.
 *
 * One calendar - their primary. The scope the hub holds can work with events
 * but cannot enumerate a person's other calendars, which is a deliberate
 * limit rather than an omission.
 */
export default function CalendarPanel() {
  const { token } = theme.useToken()
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCalendarStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    // The consent callback lands here when Connect was pressed on this page.
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('gmail')
    if (outcome) {
      const reason = params.get('reason') || ''
      if (outcome === 'connected') message.success(`Google connected${reason ? ` as ${reason}` : ''}.`)
      else if (outcome === 'denied') message.warning('Calendar was not connected - access was declined.')
      else message.error(`Calendar could not be connected. ${reason}`)
      params.delete('gmail')
      params.delete('reason')
      window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`)
    }
    return () => {
      cancelled = true
    }
  }, [])

  const today = dayKey(new Date())
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [reading, setReading] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm | null>(null)
  const [saving, setSaving] = useState(false)

  // The grid runs from the Sunday on or before the 1st to the Saturday on or
  // after the last, so the fetch window is the grid rather than the month -
  // otherwise the greyed-out edges are always empty.
  const gridStart = useMemo(() => addDays(cursor, -cursor.getDay()), [cursor])
  const gridDays = useMemo(() => {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const cells = Math.ceil((monthEnd.getDate() + cursor.getDay()) / 7) * 7
    return Array.from({ length: cells }, (_, i) => addDays(gridStart, i))
  }, [cursor, gridStart])

  const refresh = useCallback(() => {
    if (!status?.connected || !status.calendar) return
    const from = gridStart
    const to = addDays(gridStart, gridDays.length)
    setLoading(true)
    getCalendarEvents({ timeMin: from.toISOString(), timeMax: to.toISOString() })
      .then((page) => {
        setEvents(page.events)
        setLoaded(true)
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not load your calendar.'))
      .finally(() => setLoading(false))
  }, [status?.connected, status?.calendar, gridStart, gridDays.length])

  useEffect(() => {
    refresh()
  }, [refresh])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      for (const key of daysCovered(event)) {
        const list = map.get(key)
        if (list) list.push(event)
        else map.set(key, [event])
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
        return a.start.localeCompare(b.start)
      })
    }
    return map
  }, [events])

  const connect = () => {
    setBusy(true)
    getCalendarConnectUrl()
      .then(({ url }) => window.location.assign(url))
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not start the Google sign-in.')
        setBusy(false)
      })
  }

  const save = () => {
    if (!form) return
    const guests = form.guests
      .split(/[,;\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    const input = {
      summary: form.summary.trim(),
      description: form.description,
      location: form.location,
      allDay: form.allDay,
      start: form.allDay ? form.startDate : `${form.startDate}T${form.startTime}`,
      end: form.allDay ? form.endDate : `${form.endDate}T${form.endTime}`,
      attendees: guests,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    setSaving(true)
    const done = form.id ? updateCalendarEvent(form.id, input) : createCalendarEvent(input)
    done
      .then((saved) => {
        message.success(form.id ? 'Event updated.' : 'Event added to your calendar.')
        setForm(null)
        setReading((current) => (current && current.id === saved.id ? saved : current))
        refresh()
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not save the event.'))
      .finally(() => setSaving(false))
  }

  const remove = (event: CalendarEvent) => {
    deleteCalendarEvent(event.id)
      .then(() => {
        message.success('Event cancelled.')
        setReading(null)
        refresh()
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not cancel the event.'))
  }

  const chip = (event: CalendarEvent, key: string) => (
    <div
      key={`${key}:${event.id}`}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        setReading(event)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setReading(event)
      }}
      title={`${event.allDay ? 'All day' : timeOf(event.start)} · ${event.summary || '(no title)'}`}
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'baseline',
        padding: '1px 4px',
        marginBottom: 2,
        borderRadius: token.borderRadiusSM,
        background: event.allDay ? token.colorPrimary : token.colorFillSecondary,
        color: event.allDay ? token.colorTextLightSolid : token.colorText,
        fontSize: 11,
        lineHeight: '15px',
        cursor: 'pointer',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      {!event.allDay ? <span style={{ opacity: 0.7, flex: '0 0 auto' }}>{timeOf(event.start)}</span> : null}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.summary || '(no title)'}</span>
    </div>
  )

  const grid = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {WEEKDAYS.map((name) => (
          <Text key={name} type="secondary" style={{ fontSize: 11, textAlign: 'center', padding: '4px 0' }}>
            {name.toUpperCase()}
          </Text>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {gridDays.map((day) => {
          const key = dayKey(day)
          const inMonth = day.getMonth() === cursor.getMonth()
          const list = byDay.get(key) || []
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => setOpenDay(key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setOpenDay(key)
              }}
              style={{
                minHeight: 96,
                padding: 4,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                opacity: inMonth ? 1 : 0.45,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: 2 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: key === today ? 600 : 400,
                    background: key === today ? token.colorPrimary : 'transparent',
                    color: key === today ? token.colorTextLightSolid : undefined,
                  }}
                >
                  {day.getDate()}
                </span>
              </div>
              {list.slice(0, 3).map((event) => chip(event, key))}
              {list.length > 3 ? (
                <Text type="secondary" style={{ fontSize: 11, paddingLeft: 4 }}>
                  +{list.length - 3} more
                </Text>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )

  const dayView = openDay ? (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space>
        <Button size="small" icon={<LeftOutlined />} onClick={() => setOpenDay(null)}>
          Back to month
        </Button>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setForm(blankForm(openDay))}>
          New event
        </Button>
      </Space>
      <Title level={5} style={{ margin: 0 }}>
        {longDay(openDay)}
      </Title>
      {(byDay.get(openDay) || []).map((event) => (
        <div
          key={event.id}
          role="button"
          tabIndex={0}
          onClick={() => setReading(event)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setReading(event)
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '120px minmax(0, 1fr)',
            gap: 12,
            padding: '8px 4px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            cursor: 'pointer',
          }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            {event.allDay ? 'All day' : `${timeOf(event.start)} – ${timeOf(event.end)}`}
          </Text>
          <div style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 13 }}>{event.summary || '(no title)'}</Text>
            {event.location ? (
              <Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
                {event.location}
              </Text>
            ) : null}
          </div>
        </div>
      ))}
      {!(byDay.get(openDay) || []).length ? (
        <Text type="secondary">Nothing scheduled.</Text>
      ) : null}
    </Space>
  ) : null

  const toolbar = (
    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
      <Space size={6}>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setForm(blankForm(openDay || today))}>
          Create
        </Button>
        <Tooltip title="Refresh">
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={refresh} />
        </Tooltip>
        <Button
          size="small"
          onClick={() => {
            const now = new Date()
            setCursor(new Date(now.getFullYear(), now.getMonth(), 1))
            setOpenDay(null)
          }}
        >
          Today
        </Button>
      </Space>
      <Space size={4}>
        <Tooltip title="Previous month">
          <Button
            size="small"
            type="text"
            icon={<LeftOutlined />}
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          />
        </Tooltip>
        <Text style={{ fontSize: 13, minWidth: 130, textAlign: 'center', display: 'inline-block' }}>
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </Text>
        <Tooltip title="Next month">
          <Button
            size="small"
            type="text"
            icon={<RightOutlined />}
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          />
        </Tooltip>
      </Space>
    </Space>
  )

  return (
    <Card
      className="section-card"
      title={
        <Space size={8} align="center">
          <CalendarGlyph />
          <Title level={5} style={{ margin: 0 }}>
            {status?.connected && status.calendar ? status.address : 'Calendar'}
          </Title>
        </Space>
      }
    >
      <Modal
        title={reading?.summary || '(no title)'}
        open={Boolean(reading)}
        onCancel={() => setReading(null)}
        width={520}
        footer={
          reading?.canEdit
            ? [
                <Popconfirm
                  key="delete"
                  title="Cancel this event?"
                  description="Guests are told it is off."
                  okText="Cancel event"
                  cancelText="Keep"
                  onConfirm={() => reading && remove(reading)}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Cancel event
                  </Button>
                </Popconfirm>,
                <Button
                  key="edit"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    if (!reading) return
                    setForm(formFor(reading))
                    setReading(null)
                  }}
                >
                  Edit
                </Button>,
              ]
            : [
                <Button key="close" onClick={() => setReading(null)}>
                  Close
                </Button>,
              ]
        }
      >
        {reading ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text>{spanLabel(reading)}</Text>
            {reading.location ? (
              <Text type="secondary">
                <EnvironmentOutlined /> {reading.location}
              </Text>
            ) : null}
            {reading.hangoutLink ? (
              <a href={reading.hangoutLink} target="_blank" rel="noreferrer">
                <LinkOutlined /> Join the video call
              </a>
            ) : null}
            {reading.attendees.length ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <TeamOutlined />{' '}
                {reading.attendees.map((a) => `${a.name || a.email}${a.response === 'accepted' ? ' ✓' : ''}`).join(', ')}
              </Text>
            ) : null}
            {reading.description ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: '40vh', overflow: 'auto' }}>
                {reading.description.replace(/<[^>]+>/g, '')}
              </div>
            ) : null}
            {!reading.canEdit ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Organised by {reading.organizer || 'someone else'}, so it is read-only here.
              </Text>
            ) : null}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={form?.id ? 'Edit event' : 'New event'}
        open={Boolean(form)}
        onCancel={() => setForm(null)}
        width={560}
        footer={[
          <Button key="cancel" onClick={() => setForm(null)}>
            Cancel
          </Button>,
          <Button key="save" type="primary" loading={saving} disabled={!form?.summary.trim()} onClick={save}>
            {form?.id ? 'Save' : 'Create'}
          </Button>,
        ]}
      >
        {form ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Input
              placeholder="Add a title"
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
            <Space>
              <Switch checked={form.allDay} onChange={(allDay) => setForm({ ...form, allDay })} size="small" />
              <Text>All day</Text>
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                type="date"
                value={form.startDate}
                onChange={(event) => {
                  const startDate = event.target.value
                  // Keep the end from drifting behind the start when the start moves.
                  setForm({ ...form, startDate, endDate: form.endDate < startDate ? startDate : form.endDate })
                }}
              />
              {!form.allDay ? (
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              ) : null}
            </Space.Compact>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
              {!form.allDay ? (
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                />
              ) : null}
            </Space.Compact>
            <Input
              addonBefore="Where"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
            <Input
              addonBefore="Guests"
              placeholder="someone@example.com, someone.else@example.com"
              value={form.guests}
              onChange={(event) => setForm({ ...form, guests: event.target.value })}
            />
            <Input.TextArea
              rows={4}
              placeholder="Notes"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Guests are invited by Google from {status?.address}.
            </Text>
          </Space>
        ) : null}
      </Modal>

      {!status ? (
        <Spin />
      ) : !status.configured ? (
        <Text type="secondary">
          Google is not set up on the server yet. An administrator needs to add the Google credentials.
        </Text>
      ) : !status.connected ? (
        <Space direction="vertical" size={12}>
          <Text>
            Connect your Google account to see and manage your own calendar here. It is the same connection the Gmail
            page uses, so connecting once covers both.
          </Text>
          <Button type="primary" loading={busy} onClick={connect}>
            Connect Google
          </Button>
        </Space>
      ) : !status.calendar ? (
        <Space direction="vertical" size={12}>
          <Text>
            Your Google account is connected for Gmail but was linked before Calendar was added, so the hub cannot see
            your calendar yet. Reconnecting grants it - your Gmail keeps working throughout.
          </Text>
          <Button type="primary" loading={busy} onClick={connect}>
            Reconnect for Calendar
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {dayView ? null : toolbar}
          {!loaded && !events.length && loading ? <Spin /> : dayView ?? grid}
        </Space>
      )}
    </Card>
  )
}
