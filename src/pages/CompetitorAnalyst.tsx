import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, Input, Modal, Select, Space, Spin, Tag, Typography, message } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import { PUBLIC_SAFETY_COMPETITORS } from '../data/publicSafetyCompetitors'
import {
  getCompetitorSectionMemories,
  saveCompetitorMemory,
  type CompetitorSectionMemory,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

// The spec line items we want captured for every BWC model line item. Battery
// life, resolution, storage, etc. — the "specs on each specific camera" the
// competitor section should retain.
const SPEC_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'battery', label: 'Battery life', placeholder: 'e.g. 12h+ recording, swappable' },
  { key: 'resolution', label: 'Video resolution', placeholder: 'e.g. 1080p / 4K, 30fps' },
  { key: 'storage', label: 'Onboard storage', placeholder: 'e.g. 64GB / 128GB' },
  { key: 'fov', label: 'Field of view', placeholder: 'e.g. 142° diagonal' },
  { key: 'prerecord', label: 'Pre-record buffer', placeholder: 'e.g. 30s / 2 min' },
  { key: 'durability', label: 'Durability / IP rating', placeholder: 'e.g. IP67, MIL-STD-810' },
  { key: 'weight', label: 'Weight / size', placeholder: 'e.g. 128g' },
  { key: 'lowlight', label: 'Low-light / night', placeholder: 'e.g. IR, low-lux mode' },
  { key: 'connectivity', label: 'Connectivity', placeholder: 'e.g. Wi‑Fi, LTE, Bluetooth' },
  { key: 'activation', label: 'Activation', placeholder: 'e.g. holster/gunshot/manual' },
  { key: 'management', label: 'Evidence / DEMS', placeholder: 'e.g. Evidence.com, cloud DEMS' },
  { key: 'price', label: 'Price / licensing', placeholder: 'e.g. bundle $X/officer/mo' },
]

type SpecValues = Record<string, string>

const EMPTY_SPECS: SpecValues = {}

function competitorName(slug: string) {
  return PUBLIC_SAFETY_COMPETITORS.find((entry) => entry.slug === slug)?.name ?? slug
}

function competitorWebsite(slug: string) {
  return PUBLIC_SAFETY_COMPETITORS.find((entry) => entry.slug === slug)?.website ?? ''
}

function buildSpecSheet(name: string, model: string, specs: SpecValues, notes: string) {
  const lines: string[] = [`# ${model}`, '', `**Company:** ${name}`, `**Product line:** ${model}`, '']
  const filled = SPEC_FIELDS.filter((field) => specs[field.key]?.trim())
  if (filled.length) {
    lines.push('## Specifications', '')
    for (const field of filled) {
      lines.push(`- **${field.label}:** ${specs[field.key].trim()}`)
    }
    lines.push('')
  }
  if (notes.trim()) {
    lines.push('## Notes', '', notes.trim())
  }
  return lines.join('\n').trim()
}

export default function CompetitorAnalyst() {
  const { isAuthenticated } = useAuth0()
  const [selected, setSelected] = useState<string>(PUBLIC_SAFETY_COMPETITORS[0]?.slug ?? '')
  const [modalOpen, setModalOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Structured BWC-model proposal.
  const [competitor, setCompetitor] = useState<string>(PUBLIC_SAFETY_COMPETITORS[0]?.slug ?? '')
  const [model, setModel] = useState('')
  const [specs, setSpecs] = useState<SpecValues>(EMPTY_SPECS)
  const [notes, setNotes] = useState('')
  const [sensitivity, setSensitivity] = useState<'internal' | 'public'>('internal')
  const [source, setSource] = useState('')

  // Memory loaded from the selected competitor's GBrain section.
  const [sectionMemories, setSectionMemories] = useState<CompetitorSectionMemory[]>([])
  const [sectionStatus, setSectionStatus] = useState<string>('')
  const [sectionLoading, setSectionLoading] = useState(false)

  const competitorOptions = useMemo(
    () => PUBLIC_SAFETY_COMPETITORS.map((entry) => ({ value: entry.slug, label: entry.name })),
    [],
  )

  // When a competitor is selected, load that section's memory from GBrain so the
  // chat (below) can be primed with what we already know about them.
  useEffect(() => {
    if (!isAuthenticated || !selected) {
      setSectionMemories([])
      setSectionStatus('')
      return
    }
    let cancelled = false
    setSectionLoading(true)
    setSectionMemories([])
    setSectionStatus('')
    getCompetitorSectionMemories(selected)
      .then((result) => {
        if (cancelled) return
        setSectionMemories(result.memories)
        setSectionStatus(result.status)
      })
      .catch(() => {
        if (cancelled) return
        setSectionStatus('unavailable')
      })
      .finally(() => {
        if (!cancelled) setSectionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, isAuthenticated])

  const resetForm = (slug: string) => {
    setCompetitor(slug)
    setModel('')
    setSpecs(EMPTY_SPECS)
    setNotes('')
    setSensitivity('internal')
    setSource('')
    setReviewing(false)
  }

  const openForSection = (slug: string) => {
    setSelected(slug)
    resetForm(slug)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setModalOpen(false)
    setReviewing(false)
  }

  const specCount = SPEC_FIELDS.filter((field) => specs[field.key]?.trim()).length
  const previewContent = buildSpecSheet(competitorName(competitor), model.trim() || '(model)', specs, notes)

  const review = () => {
    if (!competitor) {
      message.error('Choose which competitor section to save into.')
      return
    }
    if (model.trim().length < 2) {
      message.error('Enter the BWC model / product line name.')
      return
    }
    if (specCount === 0 && notes.trim().length < 10) {
      message.error('Add at least one spec or a note about this model.')
      return
    }
    setReviewing(true)
  }

  const confirmSave = async () => {
    setIsSaving(true)
    try {
      const saved = await saveCompetitorMemory({
        competitor,
        model: model.trim(),
        title: `${competitorName(competitor)} — ${model.trim()}`,
        content: buildSpecSheet(competitorName(competitor), model.trim(), specs, notes),
        sensitivity,
        source: source.trim() || undefined,
      })
      setModalOpen(false)
      setReviewing(false)
      message.success(`Saved ${model.trim()} into ${competitorName(competitor)}: ${saved.title}`)
      resetForm(competitor)
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : 'GBrain could not save this model.')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedName = competitorName(selected)

  // Scopes every chat message to the selected competitor and injects the loaded
  // GBrain section memory (collected automatically by the backend) so the chat
  // "talks to" that competitor using its memory.
  const buildChatContext = () => {
    const lines = [
      `You are the Competitor Analyst focused exclusively on the competitor "${selectedName}" (${competitorWebsite(selected)}).`,
      `Only discuss ${selectedName}'s body-worn camera portfolio and models. If the user asks about a different company, tell them to select that competitor's section.`,
    ]
    if (sectionMemories.length) {
      lines.push(`Approved ${selectedName} section memory loaded from GBrain (treat as evidence):`)
      for (const memory of sectionMemories.slice(0, 8)) {
        lines.push(`- ${memory.model || memory.title}: ${memory.summary}`)
      }
    } else {
      lines.push(`No memory is stored for ${selectedName} yet.`)
    }
    return lines.join('\n').slice(0, 6000)
  }

  const sectionPanel = (
    <aside className="chat-side-panel" style={{ minWidth: 240, maxWidth: 320 }}>
      <Card size="small" title={`${selectedName} — section memory`}>
        {sectionLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
            <Spin size="small" />
          </div>
        ) : sectionMemories.length ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {sectionMemories.length} model{sectionMemories.length === 1 ? '' : 's'} loaded from GBrain
            </Text>
            {sectionMemories.map((memory) => (
              <div key={memory.slug}>
                <Text strong>{memory.model || memory.title}</Text>
                <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }} ellipsis={{ rows: 3 }}>
                  {memory.summary}
                </Paragraph>
              </div>
            ))}
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {sectionStatus === 'disabled' || sectionStatus === 'unavailable'
              ? 'GBrain memory is unavailable right now.'
              : `No BWC models stored for ${selectedName} yet. Add one with “+ Add BWC model”.`}
          </Text>
        )}
      </Card>
    </aside>
  )

  const sectionsGrid = (
    <Card
      className="section-card"
      title="Competitor sections"
      extra={<Tag color="gold">{PUBLIC_SAFETY_COMPETITORS.length} Public Safety competitors</Tag>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Each competitor is a section of the Competitor Analyst's brain. A background collector visits every
          competitor's website on a schedule and fills each section with their body-worn camera models and specs
          (battery life, resolution, storage…). Select a competitor to talk to that section; you can also add a
          model manually.
        </Text>
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          }}
        >
          {PUBLIC_SAFETY_COMPETITORS.map((entry, index) => (
            <Card
              key={entry.slug}
              size="small"
              hoverable
              onClick={() => setSelected(entry.slug)}
              style={{
                borderColor: selected === entry.slug ? 'var(--app-primary)' : undefined,
                borderWidth: selected === entry.slug ? 2 : 1,
              }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text strong>
                  {index + 1}. {entry.name}
                </Text>
                <a href={entry.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {entry.website.replace(/^https?:\/\//, '')}
                </a>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0, height: 'auto' }}
                  disabled={!isAuthenticated}
                  onClick={(e) => {
                    e.stopPropagation()
                    openForSection(entry.slug)
                  }}
                >
                  + Add BWC model
                </Button>
              </Space>
            </Card>
          ))}
        </div>
        <div>
          <Button type="primary" disabled={!isAuthenticated} onClick={() => openForSection(selected)}>
            Add a BWC model to {competitorName(selected)}
          </Button>
          {!isAuthenticated ? (
            <Text type="secondary" style={{ marginLeft: 12 }}>
              Sign in to save competitor memory.
            </Text>
          ) : null}
        </div>
      </Space>
    </Card>
  )

  return (
    <>
      <AgentChatWorkspace
        key={selected}
        agentId="competitor-analyst"
        title="Competitor Analyst"
        subtitle="A Research Surfer that tracks Public Safety body-worn camera competitors. Each competitor is a section of its brain; each camera model is a spec page inside it."
        intro={
          sectionLoading
            ? `Loading ${selectedName}'s section memory from GBrain…`
            : sectionMemories.length
              ? `You're in the ${selectedName} section. I loaded ${sectionMemories.length} stored BWC model${sectionMemories.length === 1 ? '' : 's'} from GBrain — ask me about their cameras and specs.`
              : `You're in the ${selectedName} section. No BWC memory is stored for them yet — the background collector populates sections automatically, or add a model above.`
        }
        emptyPrompt={`Ask about ${selectedName}'s body-worn cameras…`}
        showAgentOverview={false}
        showThreadControls={false}
        showChatIntro={false}
        showBackendTag
        chatTitle={`Talk to ${selectedName}`}
        assistantLabel={selectedName}
        backendLabel="Hermes + GBrain"
        renderBeforeChat={sectionsGrid}
        buildMessageContext={buildChatContext}
        chatSidePanel={sectionPanel}
      />

      <Modal
        width={720}
        title={
          reviewing
            ? 'Confirm BWC model memory'
            : `Add a BWC model to ${competitorName(competitor)}`
        }
        open={modalOpen}
        onCancel={closeModal}
        closable={!isSaving}
        maskClosable={!isSaving}
        footer={
          reviewing
            ? [
                <Button key="back" onClick={() => setReviewing(false)} disabled={isSaving}>
                  Back
                </Button>,
                <Button key="confirm" type="primary" danger loading={isSaving} onClick={() => void confirmSave()}>
                  Confirm and save to GBrain
                </Button>,
              ]
            : [
                <Button key="cancel" onClick={closeModal}>
                  Cancel
                </Button>,
                <Button key="review" type="primary" onClick={review}>
                  Review model
                </Button>,
              ]
        }
      >
        {reviewing ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="This writes an approved model spec page to GBrain."
              description="Scoped to Competitor Analyst and tagged to the competitor and BWC model below."
            />
            <Space wrap>
              <Tag color="gold">{competitorName(competitor)}</Tag>
              <Tag color="geekblue">{model.trim()}</Tag>
              <Tag color={sensitivity === 'public' ? 'green' : 'blue'}>{sensitivity}</Tag>
              <Tag>{specCount} specs</Tag>
            </Space>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--app-surface, rgba(0,0,0,0.03))',
                border: '1px solid var(--app-border, rgba(0,0,0,0.1))',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              {previewContent}
            </div>
            {source.trim() ? (
              <div>
                <Text type="secondary">Source</Text>
                <Paragraph>{source.trim()}</Paragraph>
              </div>
            ) : null}
          </Space>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="Capture one camera model at a time."
              description="Fill in what you know — blank specs are skipped. Nothing is saved until you review and confirm. No passwords, keys, or tokens."
            />
            <Space wrap style={{ width: '100%' }}>
              <div>
                <Text strong>Competitor section</Text>
                <br />
                <Select
                  value={competitor}
                  style={{ width: 280 }}
                  options={competitorOptions}
                  showSearch
                  optionFilterProp="label"
                  onChange={(value) => setCompetitor(value)}
                />
              </div>
              <div>
                <Text strong>BWC model / product line</Text>
                <br />
                <Input
                  value={model}
                  maxLength={120}
                  style={{ width: 280 }}
                  placeholder="e.g. Axon Body 4"
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
            </Space>

            <div>
              <Text strong>Specs</Text>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  marginTop: 8,
                }}
              >
                {SPEC_FIELDS.map((field) => (
                  <div key={field.key}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {field.label}
                    </Text>
                    <Input
                      value={specs[field.key] ?? ''}
                      maxLength={200}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setSpecs((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ width: '100%' }}>
              <Text strong>Additional notes (positioning, differentiators, sources)</Text>
              <TextArea
                value={notes}
                maxLength={4000}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder="Anything else worth retaining about this model."
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <Space wrap>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Sensitivity
                </Text>
                <br />
                <Select
                  value={sensitivity}
                  style={{ width: 170 }}
                  options={[
                    { value: 'internal', label: 'Internal' },
                    { value: 'public', label: 'Public' },
                  ]}
                  onChange={(value) => setSensitivity(value as 'internal' | 'public')}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Source (optional)
                </Text>
                <br />
                <Input
                  value={source}
                  maxLength={500}
                  style={{ width: 320 }}
                  placeholder="Spec sheet URL, datasheet, press release"
                  onChange={(event) => setSource(event.target.value)}
                />
              </div>
            </Space>
          </Space>
        )}
      </Modal>
    </>
  )
}
