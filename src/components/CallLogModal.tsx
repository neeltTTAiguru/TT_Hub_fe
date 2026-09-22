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
  previewEmailTemplate,
  sendAgencyEmail,
  type AgencyCall,
  type AgencyOutreach,
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
 * The outcomes that book themselves a second attempt.
 *
 * Neither is a finished call: nobody was reached and somebody has to come
 * back to this agency. Both colour the pin pink (see CALL_LATER_OUTCOMES in
 * AgencyMap) and both propose a ring-back in the call-back owner's diary,
 * because coming back to it is whoever owns outbound's job rather than the
 * job of whoever happened to dial. The stored outcome is untouched either
 * way, so the call report still tells a voicemail from a deferral.
 */
const VOICEMAIL_OUTCOME = 'Left voicemail'
const CALL_LATER_OUTCOMES = [VOICEMAIL_OUTCOME, 'Call later']

/** How long after the call to offer the call-back. */
const CALL_BACK_WEEKS = 2

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
 * When to offer to ring back: two weeks after the call, same time of day.
 *
 * Measured from the call rather than from now, because a call typed up the
 * next morning still happened when it happened. Same time of day because the
 * hour an agency was rung is the best guess anyone has about when somebody
 * will be at that desk again. Two weeks out is always the same weekday, so a
 * weekend only comes up if the call itself was at the weekend - nudged to the
 * Monday, since nobody is ringing a chief on a Sunday.
 */
function defaultCallBack(calledAt: string) {
  const call = calledAt ? new Date(calledAt) : new Date()
  const when = new Date(Number.isNaN(call.getTime()) ? Date.now() : call.getTime())
  when.setDate(when.getDate() + CALL_BACK_WEEKS * 7)
  if (when.getDay() === 6) when.setDate(when.getDate() + 2)
  if (when.getDay() === 0) when.setDate(when.getDate() + 1)
  when.setMinutes(when.getMinutes() - when.getTimezoneOffset())
  return when.toISOString().slice(0, 16)
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
  chiefTitle,
  open,
  onClose,
  onChanged,
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
}) {
  const [calls, setCalls] = useState<AgencyCall[]>([])
  const [draft, setDraft] = useState<CallDraft>(emptyDraft)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  // The follow-up email, offered when the outcome is a voicemail. The
  // template is fetched filled-in for this agency and this sender, shown so
  // what goes out is what they read, and sent from their own Gmail after the
  // call is saved. Their Gmail must be connected, and the agency must have an
  // address on file - the section says which is missing rather than hiding.
  const [followUp, setFollowUp] = useState<{
    subject: string
    body: string
    to: string
    configured: boolean
    connected: boolean
  } | null>(null)
  const [sendFollowUp, setSendFollowUp] = useState(false)

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

  // Sending the voicemail follow-up email only makes sense after a voicemail.
  const wantsFollowUp = draft.outcome === VOICEMAIL_OUTCOME
  // Both deferrals propose a ring-back; every other outcome asks for one.
  const isDeferral = CALL_LATER_OUTCOMES.includes(draft.outcome)

  /**
   * A voicemail proposes its own call-back, so the common case is one click.
   *
   * Only when the field is empty: an SAE who was told "try Thursday" has
   * better information than this default and must not have it overwritten.
   */
  useEffect(() => {
    if (!isDeferral) return
    setDraft((current) =>
      current.followUpAt ? current : { ...current, followUpAt: defaultCallBack(current.calledAt) },
    )
  }, [isDeferral])

  /**
   * Whose diary this particular call-back is for, which the server decides
   * the same way.
   *
   * A voicemail's ring-back is the call-back owner's work whoever left it, so
   * it goes on their calendar - the label has to say so, because it is
   * usually not the person looking at the screen. Any other follow-up is an
   * appointment this person made and stays in their own diary.
   */
  const bookingFor: { label: string; ready: boolean; detail: string } = isDeferral
    ? {
        label: calendarStatus ? `Put the call-back on ${calendarStatus.callBack.name}'s calendar` : 'Put the call-back on the call-back owner\'s calendar',
        ready: Boolean(calendarStatus?.callBack.ready),
        detail: calendarStatus
          ? calendarStatus.callBack.ready
            ? `Half an hour in ${calendarStatus.callBack.email}, with the number, your notes and your name on it. Coming back to this agency is ${calendarStatus.callBack.name}'s job, not yours.`
            : `${calendarStatus.callBack.name} has not connected Google to the hub yet, so there is nowhere to book it.`
          : 'Checking the call-back calendar...',
      }
    : {
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

  /**
   * Whether to ask for a call-back time.
   *
   * Only for outcomes that could have one and do not: a deferral proposes its
   * own, and there is no ringing back an agency that said no or gave a dead
   * number.
   */
  const needsCallBack =
    Boolean(draft.outcome) &&
    !isDeferral &&
    !draft.followUpAt &&
    !['Not interested', 'Wrong number / bad line'].includes(draft.outcome)

  // A call-back with a time goes in the diary unless they say otherwise.
  // Clearing the time takes it back out - there is nothing left to book.
  useEffect(() => {
    if (!draft.followUpAt) setAddToCalendar(false)
    else if (bookingFor.ready) setAddToCalendar(true)
  }, [draft.followUpAt, bookingFor.ready])
  useEffect(() => {
    if (!open || !ori || !wantsFollowUp) return
    let cancelled = false
    previewEmailTemplate('voicemail-followup', ori)
      .then((preview) => {
        if (cancelled) return
        setFollowUp({
          subject: preview.subject,
          body: preview.body,
          to: preview.to,
          configured: preview.configured,
          connected: preview.connected,
        })
        setSendFollowUp(Boolean(preview.connected && preview.to && preview.subject && preview.body))
      })
      .catch(() => {
        if (!cancelled) setFollowUp(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, ori, wantsFollowUp])

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
    () => Boolean(draft.outcome || draft.notes.trim() || draft.contactName.trim()),
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
    })
      .then(async (result) => {
        setCalls(result.calls || [])
        setDraft({ ...emptyDraft(), phone: phone || '' })
        onChanged?.(ori, result.outreach ?? summarise(result.calls || []))
        message.success('Call logged.')
        // The call is saved whatever the diary did, so a failure here is said
        // out loud rather than swallowed or turned into a failed save.
        if (result.calendar && 'error' in result.calendar) {
          message.warning(`Call logged, but the call-back did not reach your calendar: ${result.calendar.error}`)
        } else if (result.calendar?.id) {
          message.success(`Call-back added to your calendar for ${formatWhen(result.calendar.at)}.`)
        }
        if (wantsFollowUp && sendFollowUp && followUp) {
          try {
            const sent = await sendAgencyEmail({ ori, subject: followUp.subject, body: followUp.body })
            message.success(`Follow-up email sent to ${sent.to}.`)
            const refreshed = await getAgencyCallLog(ori)
            setCalls(refreshed.calls || [])
            onChanged?.(ori, refreshed.outreach ?? summarise(refreshed.calls || []))
          } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'The call was logged but the email did not send.')
          }
        }
        setSendFollowUp(false)
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
      title={agencyName ? `Call log - ${agencyName}` : 'Call log'}
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

        <Space size={10} wrap style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              When you called
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
              How it went
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

        <Space size={10} wrap style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Who you spoke to
            </Text>
            <Input
              style={{ width: 220 }}
              placeholder={chiefName || 'Name'}
              value={draft.contactName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, contactName: event.target.value }))
              }
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Their role
            </Text>
            <Input
              style={{ width: 260 }}
              placeholder={chiefTitle || 'Chief, clerk, dispatcher...'}
              value={draft.contactTitle}
              onChange={(event) =>
                setDraft((current) => ({ ...current, contactTitle: event.target.value }))
              }
            />
          </div>
        </Space>

        <Space size={10} wrap style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Number dialled
            </Text>
            <Input
              style={{ width: 220 }}
              placeholder="Phone"
              value={draft.phone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Call back at
            </Text>
            {/* A time, not just a day: this is what goes in the diary, and
                "Thursday" is not a slot anyone can be reminded at. */}
            <Input
              type="datetime-local"
              status={needsCallBack ? 'warning' : undefined}
              style={{ width: 260 }}
              value={draft.followUpAt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, followUpAt: event.target.value }))
              }
            />
          </div>
        </Space>

        {/* A deferral fills this in for itself. Every other outcome has to be
            asked, because an empty field looks optional and a call-back
            nobody wrote down is a call-back nobody makes. */}
        {needsCallBack ? (
          <Text type="warning" style={{ fontSize: 12 }}>
            {draft.outcome === 'Call back scheduled'
              ? 'When did you agree to ring back? Put the time in and it goes in your calendar.'
              : 'Are you ringing them back? Put a time in and it goes in your calendar.'}
          </Text>
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
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            What was said
          </Text>
          <Input.TextArea
            rows={4}
            value={draft.notes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="What they told you, in their words. Who the gatekeeper is, when the budget lands, which vendor they mentioned, what to open with next time."
          />
        </div>

        {wantsFollowUp ? (
          <div>
            <Checkbox
              checked={sendFollowUp}
              disabled={!followUp || !followUp.connected || !followUp.to || !followUp.subject}
              onChange={(event) => setSendFollowUp(event.target.checked)}
            >
              <Text strong>Send the follow-up email when I save</Text>
            </Checkbox>
            {!followUp ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                Loading the template...
              </Text>
            ) : !followUp.configured ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                Gmail is not set up on the server yet.
              </Text>
            ) : !followUp.connected ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                Connect your Gmail (Gmail in the sidebar) to send this from your own address.
              </Text>
            ) : !followUp.to ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {agencyName} has no email address on file, so there is nowhere to send it.
              </Text>
            ) : !followUp.subject ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                No follow-up template has been written yet. An administrator sets it on the command board.
              </Text>
            ) : (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  To {followUp.to}
                </Text>
                <Input
                  style={{ marginTop: 4 }}
                  value={followUp.subject}
                  onChange={(event) => setFollowUp((f) => (f ? { ...f, subject: event.target.value } : f))}
                />
                <Input.TextArea
                  style={{ marginTop: 6 }}
                  rows={6}
                  value={followUp.body}
                  onChange={(event) => setFollowUp((f) => (f ? { ...f, body: event.target.value } : f))}
                />
              </div>
            )}
          </div>
        ) : null}
      </Space>
    </Modal>
  )
}
