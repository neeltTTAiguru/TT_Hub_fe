import { useEffect, useState } from 'react'
import { Button, Input, Modal, Space, Typography, message } from 'antd'
import { findAgencyEmail, previewEmailTemplate, sendAgencyEmail, type EmailSource } from '../lib/api'

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
  // The address lookup. With nothing on file the composer asks PromptLoop to
  // read the agency's website - up to a minute - and says where the address
  // came from, so a generic inbox is seen for what it is before sending.
  const [finding, setFinding] = useState(false)
  const [source, setSource] = useState<EmailSource | null>(null)
  const [lookupNote, setLookupNote] = useState('')

  const lookUp = (force = false) => {
    if (!ori) return
    setFinding(true)
    setLookupNote('')
    findAgencyEmail(ori, force)
      .then((found) => {
        if (found.found && found.email) {
          setDraft((d) => (d ? { ...d, to: d.to.trim() ? d.to : found.email } : d))
          setSource(found.source ? found : null)
        } else {
          setLookupNote(found.reason || 'No published address was found.')
        }
      })
      .catch((err: unknown) => setLookupNote(err instanceof Error ? err.message : 'The address lookup failed.'))
      .finally(() => setFinding(false))
  }

  useEffect(() => {
    if (!open || !ori) return
    let cancelled = false
    previewEmailTemplate('voicemail-followup', ori)
      .then((next) => {
        if (cancelled) return
        setSource(next.toSource ?? null)
        setLookupNote('')
        setDraft({
          to: next.to,
          subject: next.subject,
          body: next.body,
          configured: next.configured,
          connected: next.connected,
          templated: Boolean(next.subject || next.body),
        })
        setError('')
        // Nothing on file: find it, so the email is ready to send.
        if (!next.to && next.connected) lookUp()
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open the composer.')
      })
    return () => {
      cancelled = true
    }
    // lookUp is recreated each render and reads only ori; open/ori are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            placeholder={finding ? 'Finding their address...' : 'someone@agency.gov'}
            disabled={finding}
            value={draft.to}
            onChange={(event) => {
              patch({ to: event.target.value })
              setSource(null)
            }}
          />
          {finding ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Searching {agencyName}'s website with PromptLoop for who to write to - this can take up to a minute.
            </Text>
          ) : source ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Found by PromptLoop: {[source.owner, source.tier, source.confidence ? `${source.confidence} confidence` : '']
                .filter(Boolean)
                .join(' · ')}
              {source.sourceUrl ? (
                <>
                  {' · '}
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    where it was found
                  </a>
                </>
              ) : null}
            </Text>
          ) : lookupNote ? (
            <Space size={8} wrap>
              <Text type="warning" style={{ fontSize: 12 }}>
                {lookupNote} Type an address in, or
              </Text>
              <Button size="small" onClick={() => lookUp(true)}>
                Search again
              </Button>
            </Space>
          ) : null}
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
