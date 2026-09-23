import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  addAgencyCall,
  clearAgencyCallLog,
  deleteAgencyCall,
  getAgencyCallLog,
  getCalendarStatus,
  getLeAgency,
  type AgencyCall,
  type AgencyOutreach,
  type AgencySdr,
  type BwcContractAnswer,
  type CallBackOwner,
  type GmailStatus,
} from '../lib/api'

const { Text } = Typography

/**
 * What happened on the call.
 *
 * A short list rather than free text, because this is the one field worth
 * counting - "how many agencies did we actually get a human on" is a question
 * a territory gets managed by, and it cannot be asked of prose. Everything
 * that made the call worth making still goes in the notes.
 */
const OUTCOMES = [
  'Spoke with decision maker',
  'Spoke with gatekeeper',
  'Left voicemail',
  'No answer',
  'Call back scheduled',
  'Asked for information by email',
  'Not interested',
  'Wrong number / bad line',
  'Call later',
]

/**
 * The one outcome that comes with a date: a call-back the agency agreed to.
 *
 * A voicemail or a "Call later" has none - the pin turns pink, the agency
 * goes on the Friday call-back list, and whoever rings it next logs the next
 * outcome. Nothing is put in a diary for them.
 */
const DATED_OUTCOMES = ['Call back scheduled']

/** Who picked up, as the roles an SDR actually meets on these calls. */
const ROLES = [
  'Chief / Sheriff',
  'Assistant / Deputy Chief',
  'Captain / Lieutenant',
  'Sergeant',
  'Admin / Gatekeeper',
  'Dispatcher',
  'Other',
]

/** Kyle's TMAN-P, asked in his words - kept in step with SdrFormModal. */
const TMANP: Array<{ key: keyof AgencySdr; letter: string; label: string; question: string }> = [
  { key: 'timeline', letter: 'T', label: 'Timeline', question: 'Assuming you find the correct solution, when would you want a new BWC implemented?' },
  { key: 'money', letter: 'M', label: 'Money', question: 'When does your budget cycle come around, will this project align with your budget?' },
  { key: 'authority', letter: 'A', label: 'Authority', question: 'Who else needs to be involved in this project?' },
  { key: 'needs', letter: 'N', label: 'Needs', question: 'How many cameras would be needed?' },
  { key: 'pain', letter: 'P', label: 'Pain', question: 'What would you say is the reason you are looking at new body cameras?' },
]

const EMPTY_SDR: AgencySdr = { timeline: '', money: '', authority: '', needs: '', pain: '', notes: '' }
const EMPTY_BWC: BwcContractAnswer = { status: '', vendor: '', termLeft: '' }

const BWC_VENDORS = ['Axon', 'Motorola Solutions', 'WatchGuard', 'Getac', 'Utility', 'Digital Ally', 'Reveal', 'Wolfcom', 'Panasonic / i-PRO']
const BWC_TERMS: Array<{ value: BwcContractAnswer['termLeft']; label: string }> = [
  { value: '<1', label: '<1 Year' },
  { value: '1-2', label: '1-2 Years' },
  { value: '2-4', label: '2-4 Years' },
  { value: '5+', label: '5+ Years' },
]

/** Outcomes worth spotting in a list at a glance. */
const OUTCOME_COLOR: Record<string, string> = {
  'Spoke with decision maker': 'green',
  'Call back scheduled': 'blue',
  'Call later': 'magenta',
  'Not interested': 'red',
  'Wrong number / bad line': 'red',
}

type CallDraft = {
  clientCallId: string
  calledAt: string
  contactName: string
  contactTitle: string
  phone: string
  outcome: string
  followUpAt: string
  notes: string
}

/** `datetime-local` wants a local ISO string with no zone and no seconds. */
function localNow() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

/**
 * The summary the map colours by, derived from the log we were just handed.
 *
 * The server sends one back; this is the fallback for an older response, and
 * deriving it rather than assuming "now" matters because a call can be logged
 * with yesterday's date, and deleting the newest entry moves the date back.
 */
const summarise = (calls: AgencyCall[]): AgencyOutreach => ({
  callCount: calls.length,
  lastCalledAt: calls[0]?.calledAt ?? null,
  lastOutcome: calls[0]?.outcome ?? '',
  lastLoggedBy: calls[0]?.loggedBy ?? '',
})

const emptyDraft = (): CallDraft => ({
  clientCallId: crypto.randomUUID(),
  calledAt: localNow(),
  contactName: '',
  contactTitle: '',
  phone: '',
  outcome: '',
  followUpAt: '',
  notes: '',
})

const formatWhen = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''

const formatDay = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''

/**
 * Every call made to one agency, and the form for adding the next one.
 *
 * A log rather than a record on purpose: agencies get rung repeatedly, and an
 * SDR picking an account up needs "rang Tuesday, chief is out until the budget
 * vote" far more than they need the latest call in isolation. Shared per
 * agency, like the qualification - two people working a territory see the same
 * history.
 */
export default function CallLogModal({
  ori,
  agencyName,
  phone,
  chiefName,
  open,
  onClose,
  onChanged,
  onSdrSaved,
}: {
  ori: string | null
  agencyName: string
  phone?: string
  chiefName?: string
  chiefTitle?: string
  open: boolean
  onClose: () => void
  /** Fires with the new summary so the map can recolour the pin and update its card. */
  onChanged?: (ori: string, outreach: AgencyOutreach) => void
  /** Fires when a save carried the TMAN-P, with whether any of it is filled. */
  onSdrSaved?: (ori: string, filled: boolean) => void
}) {
  const [calls, setCalls] = useState<AgencyCall[]>([])
  const [draft, setDraft] = useState<CallDraft>(emptyDraft)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  // The qualification and camera contract on file, shared per agency. Sent
  // back only when touched this time: an untouched TMAN-P re-sent on every
  // voicemail would re-stamp who qualified it and push HubSpot again.
  const [sdr, setSdr] = useState<AgencySdr>(EMPTY_SDR)
  const [sdrDirty, setSdrDirty] = useState(false)
  const [bwc, setBwc] = useState<BwcContractAnswer>(EMPTY_BWC)
  const [bwcDirty, setBwcDirty] = useState(false)
  // The two answer cards. Each edits a copy: Done keeps it for Save call,
  // Cancel throws it away. Nothing reaches HubSpot until Save call.
  const [sdrCard, setSdrCard] = useState<AgencySdr | null>(null)
  const [bwcCard, setBwcCard] = useState<BwcContractAnswer | null>(null)
  const sdrFilled = TMANP.some((q) => String(sdr[q.key] || '').trim())
  useEffect(() => {
    if (!open || !ori) return
    let cancelled = false
    setSdr(EMPTY_SDR)
    setBwc(EMPTY_BWC)
    setSdrDirty(false)
    setBwcDirty(false)
    getLeAgency(ori)
      .then((agency) => {
        if (cancelled) return
        const record = agency as unknown as { sdr?: AgencySdr; bwcContract?: BwcContractAnswer }
        setSdr({ ...EMPTY_SDR, ...(record.sdr || {}) })
        setBwc({ ...EMPTY_BWC, ...(record.bwcContract || {}) })
      })
      .catch(() => {
        /* a blank form is the honest fallback; the call can still be logged */
      })
    return () => {
      cancelled = true
    }
  }, [open, ori])

  // The diary entry. Whether this person's Google connection covers Calendar
  // is asked once when the modal opens, because the answer decides whether
  // the tick box can be offered at all.
  const [calendarStatus, setCalendarStatus] = useState<(GmailStatus & { callBack: CallBackOwner }) | null>(null)
  const [addToCalendar, setAddToCalendar] = useState(false)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getCalendarStatus()
      .then((next) => {
        if (!cancelled) setCalendarStatus(next)
      })
      .catch(() => {
        if (!cancelled) setCalendarStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const isDated = DATED_OUTCOMES.includes(draft.outcome)

  // An outcome with no date takes any date back off the card, so a call-back
  // picked for a voicemail cannot ride along on a "Not interested".
  useEffect(() => {
    if (!isDated) setDraft((current) => (current.followUpAt ? { ...current, followUpAt: '' } : current))
  }, [isDated])

  // An agreed call-back is an appointment this person made, so it goes in
  // their own diary.
  const bookingFor: { label: string; ready: boolean; detail: string } = {
    label: 'Put the call-back on my calendar',
    ready: Boolean(calendarStatus?.calendar),
    detail: !calendarStatus
      ? 'Checking your Google connection...'
      : !calendarStatus.configured
        ? 'Google is not set up on the server yet.'
        : !calendarStatus.connected
          ? 'Connect your Google account (Gmail in the sidebar) to book call-backs in your own calendar.'
          : !calendarStatus.calendar
            ? 'Your Google account was connected before Calendar was added. Reconnect it on the Calendar page.'
            : `Half an hour in ${calendarStatus.address}, with the number and your notes on it.`,
  }

  // An agreed call-back with no time is a call-back nobody makes.
  const needsCallBack = isDated && !draft.followUpAt

  // A call-back with a time goes in the diary unless they say otherwise.
  // Clearing the time takes it back out - there is nothing left to book.
  useEffect(() => {
    if (!draft.followUpAt) setAddToCalendar(false)
    else if (bookingFor.ready) setAddToCalendar(true)
  }, [draft.followUpAt, bookingFor.ready])

  // Prefill what the card already knows. The number on the card is the number
  // they just dialled, and retyping it is a chance to typo it.
  useEffect(() => {
    if (!open || !ori) return
    let cancelled = false
    setError('')
    setDraft({ ...emptyDraft(), phone: phone || '' })
    setLoading(true)
    getAgencyCallLog(ori)
      .then((result) => {
        if (!cancelled) setCalls(result.calls || [])
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCalls([])
          setError(err instanceof Error ? err.message : 'Could not load the call log.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, ori, phone])

  // The server refuses an entry that records nothing but a timestamp; say so
  // here rather than letting the SDR find out by pressing save.
  const canSave = useMemo(
    () => Boolean(draft.outcome || draft.notes.trim() || draft.contactName.trim() || draft.contactTitle),
    [draft],
  )

  const save = () => {
    if (!ori || !canSave) return
    setSaving(true)
    addAgencyCall(ori, {
      ...draft,
      calledAt: draft.calledAt ? new Date(draft.calledAt).toISOString() : undefined,
      followUpAt: draft.followUpAt ? new Date(draft.followUpAt).toISOString() : null,
      addToCalendar: addToCalendar && Boolean(draft.followUpAt),
      ...(sdrDirty ? { sdr } : {}),
      ...(bwcDirty && bwc.status ? { bwc } : {}),
    })
      .then(async (result) => {
        setCalls(result.calls || [])
        setDraft({ ...emptyDraft(), phone: phone || '' })
        onChanged?.(ori, result.outreach ?? summarise(result.calls || []))
        message.success('Call logged.')
        if (sdrDirty) onSdrSaved?.(ori, TMANP.some((q) => String(sdr[q.key] || '').trim()))
        setSdrDirty(false)
        setBwcDirty(false)
        // What landed in HubSpot for the agency, said plainly - and each step
        // that did not, so nobody goes looking for a deal that was never made.
        const synced = result.hubspotAgency
        if (synced) {
          const landed = [
            synced.dealId ? 'deal' : '',
            synced.companyId ? 'company' : '',
            synced.contactId ? 'contact' : '',
          ].filter(Boolean)
          if (landed.length) message.success(`HubSpot updated: ${landed.join(', ')}.`)
          if (synced.taskId && synced.dueAt) {
            message.success(`Renewal reminder set in HubSpot for ${formatDay(synced.dueAt)}.`)
          }
          if (synced.closed) message.info('The old renewal reminder in HubSpot was closed.')
          for (const problem of synced.errors) message.warning(`HubSpot: ${problem}`, 8)
        }
        // The call is saved whatever the diary did, so a failure here is said
        // out loud rather than swallowed or turned into a failed save.
        if (result.calendar && 'error' in result.calendar) {
          message.warning(`Call logged, but the call-back did not reach your calendar: ${result.calendar.error}`)
        } else if (result.calendar?.id) {
          message.success(`Call-back added to your calendar for ${formatWhen(result.calendar.at)}.`)
        }
        setAddToCalendar(false)
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not save that call.')
      })
      .finally(() => setSaving(false))
  }

  const clearAll = () => {
    if (!ori) return
    setClearing(true)
    clearAgencyCallLog(ori)
      .then((result) => {
        setCalls(result.calls || [])
        onChanged?.(ori, result.outreach ?? summarise([]))
        message.success('Call log cleared. The pin is back to its camera colour.')
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not clear the log.')
      })
      .finally(() => setClearing(false))
  }

  const remove = (callId: string) => {
    if (!ori) return
    deleteAgencyCall(ori, callId)
      .then((result) => {
        setCalls(result.calls || [])
        onChanged?.(ori, result.outreach ?? summarise(result.calls || []))
        message.success('Call removed.')
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not remove that call.')
      })
  }

  return (
    <Modal
      title={agencyName ? `Call result - ${agencyName}` : 'Call result'}
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        // Left of Close on purpose: it is the one destructive control here, and
        // it belongs nowhere near the primary action an SDR presses every day.
        calls.length ? (
          <Popconfirm
            key="clear"
            title="Delete the whole call log?"
            description={`All ${calls.length} ${
              calls.length === 1 ? 'call is' : 'calls are'
            } removed and the pin goes back to its camera colour. This cannot be undone.`}
            okText="Delete everything"
            okButtonProps={{ danger: true }}
            cancelText="Keep the log"
            onConfirm={clearAll}
          >
            <Button danger loading={clearing} style={{ float: 'left' }}>
              Clear log
            </Button>
          </Popconfirm>
        ) : null,
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="save" type="primary" loading={saving} disabled={!canSave} onClick={save}>
          Save call
        </Button>,
      ]}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Shared with everyone working this territory. Saving a call marks the agency as reached
          out to, and its pin turns light blue on the map.
        </Text>

        {error ? <Alert type="warning" showIcon message={error} /> : null}

        {loading ? (
          <Spin />
        ) : calls.length ? (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Text strong>
              {calls.length} {calls.length === 1 ? 'call' : 'calls'} on file
            </Text>
            {calls.map((call) => (
              <div
                key={call._id}
                style={{
                  borderLeft: '3px solid #7fc4e8',
                  paddingLeft: 10,
                }}
              >
                <Space size={8} wrap align="center">
                  <Text strong style={{ fontSize: 13 }}>
                    {formatWhen(call.calledAt)}
                  </Text>
                  {call.outcome ? (
                    <Tag color={OUTCOME_COLOR[call.outcome]}>{call.outcome}</Tag>
                  ) : null}
                  <Popconfirm
                    title="Remove this call?"
                    description="The agency stops counting as reached out to if this was the only call."
                    okText="Remove"
                    cancelText="Keep"
                    onConfirm={() => remove(call._id)}
                  >
                    <Button type="link" size="small" danger style={{ padding: 0 }}>
                      Remove
                    </Button>
                  </Popconfirm>
                </Space>
                {call.contactName ? (
                  <Text style={{ fontSize: 12, display: 'block' }}>
                    Spoke to {call.contactName}
                    {call.contactTitle ? `, ${call.contactTitle}` : ''}
                    {call.phone ? ` - ${call.phone}` : ''}
                  </Text>
                ) : null}
                {call.notes ? (
                  <Text style={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap' }}>
                    {call.notes}
                  </Text>
                ) : null}
                {call.followUpAt ? (
                  <Text type="warning" style={{ fontSize: 12, display: 'block' }}>
                    Follow up {formatDay(call.followUpAt)}
                  </Text>
                ) : null}
                {call.loggedBy ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Logged by {call.loggedBy}
                  </Text>
                ) : null}
              </div>
            ))}
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nobody has logged a call to this agency yet."
          />
        )}

        <Divider style={{ margin: '4px 0' }}>Log a call</Divider>

        <Space size={10} wrap style={{ width: '100%' }} align="start">
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Date
            </Text>
            <Input
              type="datetime-local"
              style={{ width: 220 }}
              value={draft.calledAt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, calledAt: event.target.value }))
              }
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Outcome
            </Text>
            <Select
              style={{ width: 260 }}
              placeholder="Pick the outcome"
              allowClear
              value={draft.outcome || undefined}
              options={OUTCOMES.map((outcome) => ({ value: outcome, label: outcome }))}
              onChange={(value) =>
                setDraft((current) => ({ ...current, outcome: value || '' }))
              }
            />
          </div>
        </Space>

        {/* Only an outcome that comes with a date asks for one. A deferral
            proposes its own two weeks out; an agreed call-back is asked for
            the time agreed. A time, not just a day: this goes in a diary. */}
        {isDated ? (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Call back at
            </Text>
            <Input
              type="datetime-local"
              status={needsCallBack ? 'warning' : undefined}
              style={{ width: 220 }}
              value={draft.followUpAt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, followUpAt: event.target.value }))
              }
            />
            {needsCallBack ? (
              <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                When did you agree to ring back? Put the time in and it goes in your calendar.
              </Text>
            ) : null}
          </div>
        ) : null}

        {draft.followUpAt ? (
          <div>
            <Checkbox
              checked={addToCalendar}
              disabled={!bookingFor.ready}
              onChange={(event) => setAddToCalendar(event.target.checked)}
            >
              <Text strong>{bookingFor.label}</Text>
            </Checkbox>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              {bookingFor.detail}
            </Text>
          </div>
        ) : null}

        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Who
          </Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ width: 220 }}
              placeholder="Role"
              allowClear
              value={draft.contactTitle || undefined}
              options={ROLES.map((role) => ({ value: role, label: role }))}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  contactTitle: value || '',
                  // The chief is on the card already; picking the role should
                  // not mean typing the name the map is showing.
                  contactName:
                    value === 'Chief / Sheriff' && !current.contactName && chiefName ? chiefName : current.contactName,
                }))
              }
            />
            <Input
              placeholder="Name"
              value={draft.contactName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, contactName: event.target.value }))
              }
            />
          </Space.Compact>
        </div>

        <Space size={10} wrap>
          <Button type={sdrFilled ? 'primary' : 'default'} onClick={() => setSdrCard({ ...sdr })}>
            TMAN-P{sdrDirty ? ' ✓' : ''}
          </Button>
          <Button type={bwc.status ? 'primary' : 'default'} onClick={() => setBwcCard({ ...bwc })}>
            BWC Info{bwcDirty ? ' ✓' : ''}
          </Button>
          {sdrDirty || bwcDirty ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Goes to HubSpot when you save the call.
            </Text>
          ) : null}
        </Space>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            Notes
          </Text>
          <Input.TextArea
            rows={2}
            value={draft.notes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="What they told you, in their words."
          />
        </div>

      </Space>

      <Modal
        title={agencyName ? `TMAN-P - ${agencyName}` : 'TMAN-P'}
        open={Boolean(sdrCard)}
        onCancel={() => setSdrCard(null)}
        onOk={() => {
          if (sdrCard) {
            setSdr(sdrCard)
            setSdrDirty(true)
          }
          setSdrCard(null)
        }}
        okText="Done"
        width={560}
      >
        {sdrCard ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Shared per agency. When you save the call, answers here create a deal in HubSpot. (Every saved call
              already creates or updates the company and contact.)
              {sdr.filledAt
                ? ` Last qualified ${formatDay(sdr.filledAt)}${sdr.filledBy?.includes('@') ? ` by ${sdr.filledBy}` : ''}.`
                : ''}
            </Text>
            {TMANP.map((item) => (
              <div key={item.key}>
                <Space size={8} align="baseline" style={{ marginBottom: 4 }}>
                  <Text strong>{item.letter}</Text>
                  <Text strong>{item.label}</Text>
                </Space>
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder={item.question}
                  value={(sdrCard[item.key] as string) || ''}
                  onChange={(event) => setSdrCard((current) => (current ? { ...current, [item.key]: event.target.value } : current))}
                />
              </div>
            ))}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={agencyName ? `BWC Info - ${agencyName}` : 'BWC Info'}
        open={Boolean(bwcCard)}
        onCancel={() => setBwcCard(null)}
        onOk={() => {
          if (bwcCard) {
            setBwc(bwcCard)
            setBwcDirty(true)
          }
          setBwcCard(null)
        }}
        okText="Done"
        okButtonProps={{ disabled: !bwcCard?.status }}
        width={480}
      >
        {bwcCard ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Radio.Group
              value={bwcCard.status || undefined}
              onChange={(event) =>
                setBwcCard((current) =>
                  current ? { ...current, status: event.target.value as BwcContractAnswer['status'] } : current,
                )
              }
              options={[
                { value: 'none', label: 'No contract' },
                { value: 'under_contract', label: 'Under contract' },
              ]}
            />
            {bwcCard.status === 'under_contract' ? (
              <Space size={10} wrap style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Vendor
                  </Text>
                  <Select
                    style={{ width: 220 }}
                    showSearch
                    allowClear
                    placeholder="Who supplies them"
                    value={bwcCard.vendor || undefined}
                    options={[...new Set([...BWC_VENDORS, ...(bwcCard.vendor ? [bwcCard.vendor] : []), 'Other'])].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                    onChange={(value) => setBwcCard((current) => (current ? { ...current, vendor: value || '' } : current))}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Term left
                  </Text>
                  <Select
                    style={{ width: 160 }}
                    allowClear
                    placeholder="How long is left"
                    value={bwcCard.termLeft || undefined}
                    options={BWC_TERMS}
                    onChange={(value) => setBwcCard((current) => (current ? { ...current, termLeft: value || '' } : current))}
                  />
                </div>
              </Space>
            ) : null}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {bwcCard.status === 'none'
                ? 'Recorded on the company in HubSpot as no contract when you save the call.'
                : bwcCard.status === 'under_contract' && bwcCard.termLeft
                  ? 'When you save the call, this goes on the company in HubSpot with a reminder to call them as a future prospect before the contract renews.'
                  : 'Recorded on the company in HubSpot when you save the call.'}
            </Text>
          </Space>
        ) : null}
      </Modal>
    </Modal>
  )
}
