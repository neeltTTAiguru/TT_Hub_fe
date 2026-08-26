import { useCallback, useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Badge, Button, Card, Collapse, Input, Modal, Popconfirm, Select, Space, Typography, message } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import brainLogo from '../assets/agent-logos/brain.svg'
import {
  deleteBrainPage,
  getBrainPages,
  getGbrainHealth,
  saveBrainMemory,
  type BrainPage,
  type GbrainHealth,
} from '../lib/api'

const { Text } = Typography

// One brain. Sections were removed on 2026-08-26: `allowed_agents` scoping meant
// every company-wide page (20 of the 25 then stored, including the whole T500
// specification and the RFP baseline) was dropped before any agent chat saw it.
const EMPTY_DRAFT = { title: '', content: '', sensitivity: 'internal' as 'internal' | 'public' }

type BadgeStatus = 'success' | 'error' | 'warning' | 'default'

const HEALTH_LABEL: Record<GbrainHealth['status'], { text: string; badge: BadgeStatus }> = {
  ok: { text: 'Connected', badge: 'success' },
  unauthorized: { text: 'Token rejected', badge: 'error' },
  down: { text: 'Unreachable', badge: 'error' },
  disabled: { text: 'Disabled', badge: 'default' },
}

export default function TrustedTechAssistant() {
  const { isAuthenticated } = useAuth0()
  const [pages, setPages] = useState<BrainPage[]>([])
  const [health, setHealth] = useState<GbrainHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  // Slug of the page being edited. Set => the save updates that page in place
  // instead of minting a new one.
  const [editingSlug, setEditingSlug] = useState('')

  const loadHealth = useCallback(() => {
    getGbrainHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  const loadPages = useCallback(() => {
    if (!isAuthenticated) {
      setPages([])
      return
    }
    setLoading(true)
    getBrainPages()
      .then((result) => setPages(result.memories))
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    loadHealth()
    loadPages()
  }, [loadHealth, loadPages])

  // Memory retrieval fails soft, so a dead brain looks identical to a healthy one
  // from the chat. Re-probe on a timer rather than only on page load.
  useEffect(() => {
    const timer = setInterval(loadHealth, 30000)
    return () => clearInterval(timer)
  }, [loadHealth])

  const refresh = useCallback(() => {
    loadHealth()
    loadPages()
  }, [loadHealth, loadPages])

  const openAdd = () => {
    setEditingSlug('')
    setDraft(EMPTY_DRAFT)
    setAddOpen(true)
  }

  const openEdit = (page: BrainPage) => {
    setEditingSlug(page.slug)
    setDraft({
      title: page.title,
      content: page.content,
      sensitivity: page.sensitivity === 'public' ? 'public' : 'internal',
    })
    setAddOpen(true)
  }

  const addPage = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      message.warning('A page needs a title and content.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveBrainMemory({
        title: draft.title.trim(),
        content: draft.content.trim(),
        // One brain: every page is readable by every agent unless a future
        // scope is set deliberately.
        section: 'company',
        sensitivity: draft.sensitivity,
        // Overwrites the same GBrain page rather than creating a near-duplicate.
        ...(editingSlug ? { targetSlug: editingSlug } : {}),
      })
      message.success(editingSlug ? `Updated ${saved.slug}` : `Saved ${saved.slug}`)
      setDraft(EMPTY_DRAFT)
      setEditingSlug('')
      setAddOpen(false)
      refresh()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not save that page.')
    } finally {
      setSaving(false)
    }
  }

  const removePage = async (page: BrainPage) => {
    try {
      const result = await deleteBrainPage(page.slug)
      message.success(`Deleted ${result.title} — recoverable for ${result.recoverableHours}h`)
      refresh()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not delete that page.')
    }
  }

  // Primes the chat with what is actually in the brain, so Brain answers from
  // the same pages the list shows.
  const buildChatContext = () => {
    const lines = [
      "You are Brain, answering from Trusted Technology's approved GBrain memory. Every page is one brain, readable by every agent.",
    ]
    if (pages.length) {
      lines.push('Pages currently stored:')
      for (const page of pages.slice(0, 40)) lines.push(`- ${page.title}: ${page.summary}`)
    } else {
      lines.push('No pages are stored in the brain yet.')
    }
    return lines.join('\n').slice(0, 8000)
  }

  const status = health ? HEALTH_LABEL[health.status] : null
  // Show ONE number, and make it the one the user can act on: the pages they can
  // actually see and delete. get_stats counts every page in GBrain including
  // those filtered out by sensitivity, department or agent scope, so showing the
  // raw total next to a shorter list just reads as a bug. The total is kept in
  // the tooltip -- a gap between the two is still worth being able to check,
  // since that gap is exactly what hid 20 of 25 pages before 2026-08-26.
  const visibleCount = pages.length
  const storedCount = health?.pageCount ?? null
  const hiddenCount = storedCount === null ? 0 : Math.max(0, storedCount - visibleCount)

  const monitor = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 28px',
        alignItems: 'center',
        padding: '12px 16px',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
      }}
    >
      <Space size={8}>
        <Badge status={status?.badge ?? 'processing'} />
        <Text strong>{status?.text ?? 'Checking…'}</Text>
      </Space>
      <Space size={6}>
        <Text type="secondary" style={{ fontSize: 12 }}>Pages</Text>
        <Text
          strong
          title={hiddenCount
            ? `${visibleCount} readable by you · ${hiddenCount} filtered out by sensitivity, department or agent scope`
            : undefined}
        >
          {loading && !visibleCount ? '—' : visibleCount}
        </Text>
      </Space>
      <Space size={6}>
        <Text type="secondary" style={{ fontSize: 12 }}>Transport</Text>
        <Text>{health?.transport ?? '—'}</Text>
      </Space>
      <Space size={6}>
        <Text type="secondary" style={{ fontSize: 12 }}>Checked</Text>
        <Text>{health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : '—'}</Text>
      </Space>
      <Space size={8} style={{ marginLeft: 'auto' }}>
        <Button size="small" onClick={refresh} loading={loading}>Refresh</Button>
        <Button size="small" type="primary" onClick={openAdd}>Add page</Button>
      </Space>
    </div>
  )

  const library = (
    <div
      style={{
        maxHeight: 460,
        overflowY: 'auto',
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        paddingRight: 4,
      }}
    >
      {pages.map((page) => (
        <Card
          key={page.slug}
          size="small"
          hoverable
          onClick={() => openEdit(page)}
          style={{ cursor: 'pointer' }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong>{page.title}</Text>
              <Popconfirm
                title="Delete this page?"
                description="Recoverable for 72 hours."
                okText="Delete"
                cancelText="Cancel"
                onConfirm={() => removePage(page)}
              >
                <Button
                  size="small"
                  danger
                  type="text"
                  // The card opens the editor, so the delete control must not
                  // bubble up into it.
                  onClick={(event) => event.stopPropagation()}
                >
                  Delete
                </Button>
              </Popconfirm>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {page.slug}
              {page.sensitivity !== 'internal' ? ` · ${page.sensitivity}` : ''}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {page.summary.slice(0, 160)}
              {page.summary.length > 160 ? '…' : ''}
            </Text>
          </Space>
        </Card>
      ))}
      {!pages.length && !loading ? <Text type="secondary">No pages stored yet.</Text> : null}
    </div>
  )

  const brainPanel = (
    <Card className="section-card" title="The Brain">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {monitor}

        {health && health.status !== 'ok' && health.status !== 'disabled' ? (
          <Text type="danger">
            {health.error || 'The brain is not reachable — agents will answer with no memory.'}
          </Text>
        ) : null}

        <Text type="secondary">
          One brain. Every page is readable by every agent, subject to its sensitivity. Deleting is a soft
          delete — GBrain keeps the page recoverable for 72 hours.
        </Text>

        <Collapse
          items={[{
            key: 'library',
            label: <Text strong>Library · {pages.length} page{pages.length === 1 ? '' : 's'}</Text>,
            children: library,
          }]}
        />
      </Space>

      <Modal
        title={editingSlug ? 'Edit page' : 'Add a page to the Brain'}
        open={addOpen}
        onCancel={() => { setAddOpen(false); setEditingSlug('') }}
        onOk={addPage}
        okText={editingSlug ? 'Save changes' : 'Save page'}
        confirmLoading={saving}
        width={720}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {editingSlug ? (
            <Text type="secondary" style={{ fontSize: 12 }}>{editingSlug}</Text>
          ) : null}
          <Input
            placeholder="Title — phrase it like the question someone would ask"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Input.TextArea
            rows={14}
            placeholder="One fact per page. Say when it was true."
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
          />
          <Select
            value={draft.sensitivity}
            onChange={(value) => setDraft({ ...draft, sensitivity: value })}
            options={[
              { value: 'internal', label: 'Internal' },
              { value: 'public', label: 'Public' },
            ]}
            style={{ width: 160 }}
          />
        </Space>
      </Modal>
    </Card>
  )

  return (
    <AgentChatWorkspace
      agentId="trusted-tech-assistant"
      title="Brain"
      subtitle="Search Trusted Tech’s approved GBrain memory, reason with company context, and save knowledge worth remembering."
      intro={loading ? 'Loading the brain…' : "You're talking to the whole brain."}
      emptyPrompt="Ask Brain anything about Trusted Technology…"
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="Talk to Brain"
      assistantLabel="Brain"
      agentLogo={brainLogo}
      backendLabel="Hermes + GBrain"
      enableBrainMemorySave
      memorySection="company"
      onMemorySaved={refresh}
      renderBeforeChat={brainPanel}
      buildMessageContext={buildChatContext}
      draftKey="brain"
    />
  )
}
