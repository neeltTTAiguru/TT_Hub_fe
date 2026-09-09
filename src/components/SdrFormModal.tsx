import { useEffect, useState } from 'react'
import { Alert, Input, Modal, Space, Typography, message } from 'antd'
import {
  getLeAgency,
  saveAgencySdr,
  type AgencySdr,
  type HubSpotSyncResult,
} from '../lib/api'

const { Text } = Typography

/**
 * Kyle's TMAN-P qualification, asked in his words.
 *
 * The prompts are the questions an SDR actually says on the phone, not field
 * labels - "when does your budget cycle come around" gets a usable answer where
 * "Money" gets a shrug. The letter stays visible so the framework is still
 * legible at a glance.
 */
const QUESTIONS: Array<{ key: keyof AgencySdr; letter: string; label: string; question: string }> = [
  {
    key: 'timeline',
    letter: 'T',
    label: 'Timeline',
    question: 'Assuming you find the correct solution, when would you want a new BWC implemented?',
  },
  {
    key: 'money',
    letter: 'M',
    label: 'Money',
    question: 'When does your budget cycle come around, will this project align with your budget?',
  },
  {
    key: 'authority',
    letter: 'A',
    label: 'Authority',
    question: 'Who else needs to be involved in this project?',
  },
  {
    key: 'needs',
    letter: 'N',
    label: 'Needs',
    question: 'How many cameras would be needed?',
  },
  {
    key: 'pain',
    letter: 'P',
    label: 'Pain',
    question: 'What would you say is the reason you are looking at new body cameras?',
  },
]

const EMPTY: AgencySdr = {
  timeline: '',
  money: '',
  authority: '',
  needs: '',
  pain: '',
  notes: '',
}

export default function SdrFormModal({
  ori,
  agencyName,
  open,
  onClose,
  onSaved,
}: {
  ori: string | null
  agencyName: string
  open: boolean
  onClose: () => void
  onSaved?: (ori: string, filled: boolean) => void
}) {
  const [form, setForm] = useState<AgencySdr>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filledAt, setFilledAt] = useState<string | null>(null)
  const [filledBy, setFilledBy] = useState('')
  const [hubspot, setHubspot] = useState<HubSpotSyncResult | null>(null)

  // Load whatever is already on file. The form is shared, so someone else may
  // have already had this call - opening a blank form over their answers and
  // saving would wipe them.
  useEffect(() => {
    if (!open || !ori) return
    let cancelled = false
    setHubspot(null)
    setLoading(true)
    getLeAgency(ori)
      .then((agency) => {
        if (cancelled) return
        const sdr = (agency as unknown as { sdr?: AgencySdr }).sdr
        setForm({ ...EMPTY, ...(sdr || {}) })
        setFilledAt(sdr?.filledAt ?? null)
        setFilledBy(sdr?.filledBy ?? '')
      })
      .catch(() => {
        if (!cancelled) setForm(EMPTY)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, ori])

  const save = () => {
    if (!ori) return
    setSaving(true)
    saveAgencySdr(ori, form)
      .then((result) => {
        onSaved?.(ori, Object.values(result.sdr || {}).some(Boolean))
        // A failed sync is shown rather than closed over: the form is saved
        // either way, but "it went to HubSpot" must never be assumed.
        if (result.hubspot?.error) {
          setHubspot(result.hubspot)
          message.warning('Saved, but HubSpot was not updated.')
          return
        }
        // Say what actually landed. "Logged to HubSpot" over a save that only
        // reached the company is the kind of small lie that costs someone an
        // afternoon looking for a note on a contact that never got one.
        const sync = result.hubspot
        const where = sync?.contactId ? 'company and contact' : sync?.companyId ? 'company' : ''
        message.success(
          where
            ? `Saved. Logged to the ${where} in HubSpot${sync?.noteId ? ', with the full form on the timeline' : ''}.`
            : 'Qualification saved.',
        )
        onClose()
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not save.')
      })
      .finally(() => setSaving(false))
  }

  return (
    <Modal
      title={agencyName ? `SDR form - ${agencyName}` : 'SDR form'}
      open={open}
      onCancel={onClose}
      onOk={save}
      okText="Save to HubSpot"
      confirmLoading={saving}
      width={620}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Saving creates or updates the agency as a company in HubSpot, and its chief as a contact.
          Every answer below is written to its own field on the company, and the whole form is
          logged as a note on the company and contact timeline. Saving again updates those same
          records rather than making new ones.
        </Text>

        {hubspot?.error ? (
          <Alert
            type="warning"
            showIcon
            message="Saved here, but not pushed to HubSpot"
            description={hubspot.error}
          />
        ) : null}

        {filledAt ? (
          <Alert
            type="info"
            showIcon
            message={`Already qualified ${new Date(filledAt).toLocaleDateString()}${
              filledBy ? ` by ${filledBy}` : ''
            }`}
            description="These answers are shared, so anyone working this territory sees them. Edit rather than start again."
          />
        ) : null}

        {QUESTIONS.map((item) => (
          <div key={item.key}>
            <Space size={8} align="baseline" style={{ marginBottom: 4 }}>
              <Text strong style={{ fontSize: 15 }}>
                {item.letter}
              </Text>
              <Text strong>{item.label}</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
              &ldquo;{item.question}&rdquo;
            </Text>
            <Input.TextArea
              rows={2}
              disabled={loading}
              value={(form[item.key] as string) || ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, [item.key]: event.target.value }))
              }
              placeholder="What they actually said"
            />
          </div>
        ))}

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            Anything else
          </Text>
          <Input.TextArea
            rows={2}
            disabled={loading}
            value={form.notes || ''}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Gatekeeper's name, best time to call back, a competitor they mentioned"
          />
        </div>
      </Space>
    </Modal>
  )
}
