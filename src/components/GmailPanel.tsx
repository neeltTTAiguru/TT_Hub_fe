import { useEffect, useRef, useState } from 'react'
import { AutoComplete, Button, Card, Input, Modal, Space, Spin, Tooltip, Typography, message } from 'antd'
import {
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  SendOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import {
  composeGmail,
  disconnectGmail,
  getGmailConnectUrl,
  getGmailInbox,
  getGmailMessage,
  getGmailStatus,
  replyToGmailMessage,
  suggestGmailContacts,
  type GmailContact,
  type GmailFolder,
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

// Gmail's own rule: a time for today, "Sep 16" for this year, a date otherwise.
const when = (date: string) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (now.toDateString() === d.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (now.getFullYear() === d.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

const PAGE = 50

const FOLDERS: Array<{ key: GmailFolder; label: string; icon: React.ReactNode }> = [
  { key: 'inbox', label: 'Inbox', icon: <InboxOutlined /> },
  { key: 'starred', label: 'Starred', icon: <StarOutlined /> },
  { key: 'sent', label: 'Sent', icon: <SendOutlined /> },
  { key: 'drafts', label: 'Drafts', icon: <FileTextOutlined /> },
]

/**
 * The person's own inbox, laid out the way Gmail lays it out.
 *
 * A rail of folders and Compose on the left; on the right a toolbar with
 * refresh and "1-50 of N", then one row per email - sender, subject, snippet,
 * date - with unread in bold. Open a row and the message takes the list's
 * place, with the reply box under it.
 *
 * Read and reply, nothing else: the connection is read + send only, so there
 * is no archive, delete, mark-read or star-toggling here. Drawing those
 * controls without the permission to act on them would be worse than not
 * having them. Connecting is theirs to do - the hub never has a mailbox of
 * its own. Also where the consent flow lands the browser, with
 * ?gmail=connected|denied|failed, read once and cleared.
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

  const [folder, setFolder] = useState<GmailFolder>('inbox')
  const [messages, setMessages] = useState<GmailMessageSummary[]>([])
  const [total, setTotal] = useState(0)
  // Gmail pages forward with tokens only. To go back, remember the token each
  // page was fetched with; page N's "previous" is the token that fetched N-1.
  const [tokens, setTokens] = useState<string[]>([''])
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

  // Who the To field offers as you type: the team, people this mailbox has
  // written to or heard from, agency contacts on file. Debounced - a request
  // per keystroke would be one Gmail scan per letter of "todd".
  const [suggestions, setSuggestions] = useState<GmailContact[]>([])
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggest = (value: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    const q = value.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    suggestTimer.current = setTimeout(() => {
      suggestGmailContacts(q)
        .then((people) => setSuggestions(people))
        .catch(() => setSuggestions([]))
    }, 200)
  }
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

  const load = (opts: { folder?: GmailFolder; q?: string; pageToken?: string; tokens?: string[] } = {}) => {
    const f = opts.folder ?? folder
    const q = opts.q ?? query
    const pageToken = opts.pageToken ?? ''
    setLoading(true)
    setReading(null)
    getGmailInbox({ q, pageToken, folder: f })
      .then((page) => {
        setMessages(page.messages)
        setTotal(page.total)
        setNextPage(page.nextPageToken)
        setTokens(opts.tokens ?? [''])
        setLoaded(true)
      })
      .catch((err: unknown) => message.error(err instanceof Error ? err.message : 'Could not load your mail.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!status?.connected) return
    let cancelled = false
    getGmailInbox({ folder: 'inbox' })
      .then((page) => {
        if (cancelled) return
        setMessages(page.messages)
        setTotal(page.total)
        setNextPage(page.nextPageToken)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : 'Could not load your inbox.')
      })
    return () => {
      cancelled = true
    }
  }, [status?.connected])

  const openFolder = (next: GmailFolder) => {
    setFolder(next)
    setQuery('')
    load({ folder: next, q: '' })
  }
  const search = (value: string) => {
    setQuery(value)
    load({ q: value })
  }
  const goNext = () => load({ pageToken: nextPage, tokens: [...tokens, nextPage] })
  const goPrev = () => {
    if (tokens.length < 2) return
    const back = tokens.slice(0, -1)
    load({ pageToken: back[back.length - 1], tokens: back })
  }

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

  // "1-50 of 1,091", from the page's place in the token trail.
  const first = (tokens.length - 1) * PAGE + 1
  const last = first + messages.length - 1
  const range = messages.length ? `${first}–${last} of ${Math.max(total, last).toLocaleString()}` : ''

  // In Sent the person worth showing is who it went to, not who sent it.
  const who = (item: GmailMessageSummary) => (folder === 'sent' ? `To: ${sender(item.to || '')}` : sender(item.from))

  const rail = (
    <Space direction="vertical" size={4} style={{ width: 170, flex: '0 0 170px' }}>
      <Button type="primary" icon={<EditOutlined />} block onClick={() => setComposing(true)} style={{ marginBottom: 8 }}>
        Compose
      </Button>
      {FOLDERS.map((f) => (
        <Button
          key={f.key}
          type={folder === f.key ? 'primary' : 'text'}
          ghost={folder === f.key}
          icon={f.icon}
          block
          style={{ justifyContent: 'flex-start' }}
          onClick={() => openFolder(f.key)}
        >
          {f.label}
        </Button>
      ))}
    </Space>
  )

  const toolbar = (
    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
      <Space size={6}>
        <Tooltip title="Refresh">
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => load({ tokens: [''] })} />
        </Tooltip>
        <Input.Search
          allowClear
          size="small"
          placeholder="Search mail (from:, subject:, newer_than:7d)"
          style={{ width: 320 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={search}
        />
      </Space>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {range}
        </Text>
        <Tooltip title="Newer">
          <Button size="small" type="text" icon={<LeftOutlined />} disabled={tokens.length < 2 || loading} onClick={goPrev} />
        </Tooltip>
        <Tooltip title="Older">
          <Button size="small" type="text" icon={<RightOutlined />} disabled={!nextPage || loading} onClick={goNext} />
        </Tooltip>
      </Space>
    </Space>
  )

  const list = (
    <div>
      {messages.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => openMessage(item.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') openMessage(item.id)
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 180px minmax(0, 1fr) 72px',
            gap: 12,
            alignItems: 'center',
            padding: '8px 4px',
            cursor: 'pointer',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            fontWeight: item.unread ? 600 : 400,
          }}
        >
          <span aria-label={item.starred ? 'Starred' : ''} style={{ lineHeight: 0 }}>
            {item.starred ? <StarFilled style={{ color: '#f5b400' }} /> : <StarOutlined style={{ opacity: 0.35 }} />}
          </span>
          <Text ellipsis style={{ fontSize: 13, fontWeight: 'inherit' }}>
            {who(item)}
          </Text>
          <Text ellipsis style={{ fontSize: 13, fontWeight: 'inherit' }}>
            {item.subject || '(no subject)'}
            {item.snippet ? (
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                {' '}
                - {item.snippet}
              </Text>
            ) : null}
          </Text>
          <Text style={{ fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 'inherit' }}>
            {when(item.date)}
          </Text>
        </div>
      ))}
      {!messages.length && loaded ? (
        <Text type="secondary" style={{ display: 'block', padding: 16 }}>
          Nothing here.
        </Text>
      ) : null}
    </div>
  )

  const reader = reading ? (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Button size="small" icon={<LeftOutlined />} onClick={() => setReading(null)}>
        Back
      </Button>
      <div>
        <Title level={5} style={{ margin: 0 }}>
          {reading.subject || '(no subject)'}
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {reading.from} · to {reading.to || 'me'} · {when(reading.date)}
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
  ) : null

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
          <Button size="small" loading={busy} onClick={disconnect}>
            Disconnect
          </Button>
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
          <Space.Compact style={{ width: '100%' }}>
            <span className="ant-input-group-addon" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 11px' }}>
              To
            </span>
            <AutoComplete
              style={{ flex: 1 }}
              value={compose.to}
              placeholder="someone@example.com"
              options={suggestions.map((p) => ({
                value: p.email,
                label: (
                  <Space size={6}>
                    <Text>{p.name || p.email}</Text>
                    {p.name ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {p.email}
                      </Text>
                    ) : null}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      · {p.source}
                    </Text>
                  </Space>
                ),
              }))}
              onSearch={suggest}
              onChange={(value) => setCompose((c) => ({ ...c, to: value }))}
              onSelect={(value: string) => setCompose((c) => ({ ...c, to: value }))}
            />
          </Space.Compact>
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
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {rail}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {reader ? null : toolbar}
              {!loaded && !messages.length ? <Spin /> : reader ?? list}
            </Space>
          </div>
        </div>
      )}
    </Card>
  )
}
