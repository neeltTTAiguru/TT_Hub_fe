import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
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
  type AgencyCall,
  type AgencyOutreach,
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
]

/** Outcomes worth spotting in a list at a glance. */
const OUTCOME_COLOR: Record<string, string> = {
  'Spoke with decision maker': 'green',
  'Call back scheduled': 'blue',
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
    })
      .then((result) => {
        setCalls(result.calls || [])
        setDraft({ ...emptyDraft(), phone: phone || '' })
        onChanged?.(ori, result.outreach ?? summarise(result.calls || []))
        message.success('Call logged.')
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
              Call back on
            </Text>
            <Input
              type="date"
              style={{ width: 260 }}
              value={draft.followUpAt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, followUpAt: event.target.value }))
              }
            />
          </div>
        </Space>

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
      </Space>
    </Modal>
  )
}
