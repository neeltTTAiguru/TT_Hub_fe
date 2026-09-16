import { useEffect, useState } from 'react'
import { Button, Card, Input, List, Modal, Space, Spin, Tag, Typography, message } from 'antd'
import {
  composeGmail,
  disconnectGmail,
  getGmailConnectUrl,
  getGmailInbox,
  getGmailMessage,
  getGmailStatus,
  replyToGmailMessage,
  type GmailMessage,
  type GmailMessageSummary,
  type GmailStatus,
} from '../lib/api'

const { Text, Title } = Typography

/** The Gmail "M", drawn inline so there is nothing to load. */
export const GmailGlyph = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M2 6.5v11A1.5 1.5 0 0 0 3.5 19H6V10l6 4.5 6-4.5v9h2.5a1.5 1.5 0 0 0 1.5-1.5v-11c0-1.2-1.4-1.9-2.4-1.2L12 10.5 4.4 5.3C3.4 4.6 2 5.3 2 6.5z" fill="currentColor" />
  </svg>
)

const sender = (from: string) => from.replace(/<.*>/, '').replace(/"/g, '').trim() || from
const when = (date: string) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString()
}

/**
 * The person's own inbox, as a page of the hub.
 *
 * Read and reply, nothing else: no archive, no delete, no labels. It is here
 * so a reply from an agency is one click from the map the call was logged
 * on, not so anyone lives in it. Connecting is theirs to do - the hub never
 * has a mailbox of its own. Also where the consent flow lands the browser,
 * with ?gmail=connected|denied|failed, read once and cleared.
 */
export default function GmailPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    getGmailStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('gmail')
    if (outcome) {
      const reason = params.get('reason') || ''
      if (outcome === 'connected') message.success(`Gmail connected${reason ? ` as ${reason}` : ''}.`)
      else if (outcome === 'denied') message.warning('Gmail was not connected - access was declined.')
      else message.error(`Gmail could not be connected. ${reason}`)
      params.delete('gmail')
      params.delete('reason')
      window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`)
    }
    return () => {
      cancelled = true
    }
  }, [])
  const [messages, setMessages] = useState<GmailMessageSummary[]>([])
  const [nextPage, setNextPage] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reading, setReading] = useState<GmailMessage | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)

  // A fresh email to anyone. Distinct from the pin's composer, which is tied
  // to an agency and logged on it; this one is just mail.
  const [composing, setComposing] = useState(false)
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' })
  const [composeSending, setComposeSending] = useState(false)
  const sendCompose = () => {
    setComposeSending(true)
    composeGmail({ to: compose.to.trim(), subject: compose.subject.trim(), body: compose.body.trim() })
      .then((sent) => {
        message.success(`Sent to ${sent.to}.`)
        setComposing(false)
        setCompose({ to: '', subject: '', body: '' })
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not send.'))
      .finally(() => setComposeSending(false))
  }

  const load = (q = query, pageToken = '') => {
    setLoading(true)
    getGmailInbox({ q, pageToken })
      .then((page) => {
        setMessages((current) => (pageToken ? [...current, ...page.messages] : page.messages))
        setNextPage(page.nextPageToken)
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not load your inbox.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!status?.connected) return
    let cancelled = false
    getGmailInbox({})
      .then((page) => {
        if (cancelled) return
        setMessages(page.messages)
        setNextPage(page.nextPageToken)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : 'Could not load your inbox.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status?.connected])

  const connect = () => {
    setBusy(true)
    getGmailConnectUrl()
      .then(({ url }) => {
        // Same tab: Google sends the browser back to the map when done.
        window.location.assign(url)
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not start the Google sign-in.')
        setBusy(false)
      })
  }

  const disconnect = () => {
    setBusy(true)
    disconnectGmail()
      .then(() => getGmailStatus())
      .then((next) => {
        setStatus(next)
        setMessages([])
        setReading(null)
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not disconnect.'))
      .finally(() => setBusy(false))
  }

  const openMessage = (id: string) => {
    setReading(null)
    setReply('')
    getGmailMessage(id)
      .then(setReading)
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not open that email.'))
  }

  const send = () => {
    if (!reading || !reply.trim()) return
    setSending(true)
    replyToGmailMessage(reading.id, reply.trim())
      .then(() => {
        message.success(`Reply sent to ${sender(reading.from)}.`)
        setReply('')
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not send the reply.'))
      .finally(() => setSending(false))
  }

  return (
    <Card
      className="section-card"
      title={
        <Space size={8} align="center">
          <GmailGlyph />
          <Title level={5} style={{ margin: 0 }}>
            {status?.connected ? status.address : 'Gmail'}
          </Title>
        </Space>
      }
      extra={
        status?.connected ? (
          <Space size={8}>
            <Button size="small" type="primary" onClick={() => setComposing(true)}>
              Compose
            </Button>
            <Button size="small" loading={busy} onClick={disconnect}>
              Disconnect
            </Button>
          </Space>
        ) : null
      }
    >
      <Modal
        title="New email"
        open={composing}
        onCancel={() => setComposing(false)}
        width={680}
        footer={[
          <Button key="cancel" onClick={() => setComposing(false)}>
            Cancel
          </Button>,
          <Button
            key="send"
            type="primary"
            loading={composeSending}
            disabled={!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()}
            onClick={sendCompose}
          >
            Send
          </Button>,
        ]}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input
            addonBefore="To"
            placeholder="someone@example.com"
            value={compose.to}
            onChange={(event) => setCompose((c) => ({ ...c, to: event.target.value }))}
          />
          <Input
            addonBefore="Subject"
            value={compose.subject}
            onChange={(event) => setCompose((c) => ({ ...c, subject: event.target.value }))}
          />
          <Input.TextArea
            rows={12}
            placeholder="Write your email..."
            value={compose.body}
            onChange={(event) => setCompose((c) => ({ ...c, body: event.target.value }))}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Sent from {status?.address}.
          </Text>
        </Space>
      </Modal>
      {!status ? (
        <Spin />
      ) : !status.configured ? (
        <Text type="secondary">
          Gmail is not set up on the server yet. An administrator needs to add the Google
          credentials.
        </Text>
      ) : !status.connected ? (
        <Space direction="vertical" size={12}>
          <Text>
            Connect your own Gmail to send follow-up emails to agencies from the map and read
            replies here. The hub can send as you and read your inbox; it cannot delete or move
            anything.
          </Text>
          {status.lastError ? <Text type="danger">{status.lastError}</Text> : null}
          <Button type="primary" loading={busy} onClick={connect}>
            Connect Gmail
          </Button>
        </Space>
      ) : reading ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Button size="small" onClick={() => setReading(null)}>
            Back to inbox
          </Button>
          <div>
            <Text strong style={{ display: 'block' }}>
              {reading.subject || '(no subject)'}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {reading.from} · {when(reading.date)}
            </Text>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: '55vh', overflow: 'auto' }}>
            {reading.body || '(no readable text in this email)'}
          </div>
          <Input.TextArea
            rows={4}
            placeholder={`Reply to ${sender(reading.from)}`}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <Button type="primary" loading={sending} disabled={!reply.trim()} onClick={send}>
            Send reply
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Input.Search
            allowClear
            placeholder="Search your inbox (Gmail syntax works: from:, subject:, newer_than:7d)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onSearch={(value) => load(value)}
          />
          {!loaded && !messages.length ? (
            <Spin />
          ) : (
            <List
              size="small"
              dataSource={messages}
              locale={{ emptyText: 'Nothing here.' }}
              renderItem={(item) => (
                <List.Item style={{ cursor: 'pointer', paddingInline: 0 }} onClick={() => openMessage(item.id)}>
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong={item.unread} style={{ fontSize: 13 }}>
                        {sender(item.from)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                        {when(item.date)}
                      </Text>
                    </Space>
                    <Text strong={item.unread} style={{ fontSize: 13 }}>
                      {item.subject || '(no subject)'}
                      {item.unread ? <Tag style={{ marginInlineStart: 6 }}>new</Tag> : null}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                      {item.snippet}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
          {nextPage ? (
            <Button size="small" loading={loading} onClick={() => load(query, nextPage)}>
              Older
            </Button>
          ) : null}
        </Space>
      )}
    </Card>
  )
}
