import { useEffect, useState } from 'react'
import { Button, Input, Modal, Space, Typography, message } from 'antd'
import { previewEmailTemplate, sendAgencyEmail } from '../lib/api'

const { Text } = Typography

type Draft = {
  to: string
  subject: string
  body: string
  configured: boolean
  connected: boolean
  /** Whether a template was on file to start from. */
  templated: boolean
}

/**
 * Compose an email to an agency from its pin, sent from the person's own
 * Gmail and logged on the agency's call log.
 *
 * Opens with the follow-up template filled in for this agency and this
 * sender when one is written, or blank when not - either way every field
 * can be edited. The address starts as the agency's own; a chief's direct
 * address from a voicemail greeting is the usual reason to change it.
 */
export default function FollowUpEmailModal({
  ori,
  agencyName,
  open,
  onClose,
  onSent,
}: {
  ori: string | null
  agencyName: string
  open: boolean
  onClose: () => void
  /** Fires after a send so the map can refresh the pin's call count. */
  onSent?: (ori: string) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !ori) return
    let cancelled = false
    previewEmailTemplate('voicemail-followup', ori)
      .then((next) => {
        if (cancelled) return
        setDraft({
          to: next.to,
          subject: next.subject,
          body: next.body,
          configured: next.configured,
          connected: next.connected,
          templated: Boolean(next.subject || next.body),
        })
        setError('')
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open the composer.')
      })
    return () => {
      cancelled = true
    }
  }, [open, ori])

  const blocked = !draft
    ? ''
    : !draft.configured
      ? 'Gmail is not set up on the server yet.'
      : !draft.connected
        ? 'Connect your Gmail first - Gmail in the sidebar.'
        : ''

  const patch = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d))
  const canSend = Boolean(draft && !blocked && draft.to.trim() && draft.subject.trim() && draft.body.trim())

  const send = () => {
    if (!ori || !draft || !canSend) return
    setSending(true)
    sendAgencyEmail({ ori, to: draft.to.trim(), subject: draft.subject.trim(), body: draft.body.trim() })
      .then((sent) => {
        message.success(`Sent to ${sent.to}.`)
        onSent?.(ori)
        onClose()
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not send.'))
      .finally(() => setSending(false))
  }

  return (
    <Modal
      title={`Email - ${agencyName}`}
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="send" type="primary" loading={sending} disabled={!canSend} onClick={send}>
          Send from my Gmail
        </Button>,
      ]}
    >
      {error ? (
        <Text type="danger">{error}</Text>
      ) : !draft ? (
        <Text type="secondary">Loading...</Text>
      ) : blocked ? (
        <Text type="secondary">{blocked}</Text>
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input
            addonBefore="To"
            placeholder="someone@agency.gov"
            value={draft.to}
            onChange={(event) => patch({ to: event.target.value })}
          />
          <Input
            addonBefore="Subject"
            placeholder="Subject"
            value={draft.subject}
            onChange={(event) => patch({ subject: event.target.value })}
          />
          <Input.TextArea
            rows={12}
            placeholder="Write your email..."
            value={draft.body}
            onChange={(event) => patch({ body: event.target.value })}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {draft.templated
              ? 'Started from the follow-up template - edit anything before it goes. '
              : 'No follow-up template is written yet (command board), so this starts blank. '}
            Goes out from your own Gmail and is logged on this agency.
          </Text>
        </Space>
      )}
    </Modal>
  )
}
