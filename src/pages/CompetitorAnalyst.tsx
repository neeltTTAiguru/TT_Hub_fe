import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Alert, Button, Card, Input, Modal, Select, Space, Tag, Typography, message } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import competitorAnalystLogo from '../assets/agent-logos/competitor-analyst.svg'
import { PUBLIC_SAFETY_COMPETITORS } from '../data/publicSafetyCompetitors'
import {
  getCompetitorSectionMemories,
  researchCompetitorWebsite,
  saveCompetitorMemory,
  type CompetitorSectionMemory,
  type CompetitorWebsiteResearch,
  type ResearchedBwcModel,
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

// Map a backend-researched model onto the manual form's spec keys so a researched
// model can flow through the same buildSpecSheet / saveCompetitorMemory path.
const RESEARCH_SPEC_MAP: Array<[keyof ResearchedBwcModel, string]> = [
  ['batteryLife', 'battery'],
  ['resolution', 'resolution'],
  ['storage', 'storage'],
  ['fieldOfView', 'fov'],
  ['preRecord', 'prerecord'],
  ['durability', 'durability'],
  ['weight', 'weight'],
  ['lowLight', 'lowlight'],
  ['connectivity', 'connectivity'],
  ['activation', 'activation'],
  ['evidenceManagement', 'management'],
  ['price', 'price'],
]

function researchedSpecs(model: ResearchedBwcModel): SpecValues {
  const specs: SpecValues = {}
  for (const [from, to] of RESEARCH_SPEC_MAP) {
    const value = String(model[from] ?? '').trim()
    if (value) specs[to] = value
  }
  return specs
}

function researchedSpecCount(model: ResearchedBwcModel) {
  return Object.keys(researchedSpecs(model)).length
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
  const [sectionLoading, setSectionLoading] = useState(false)

  // Live web research for the selected competitor (web_search-driven extraction).
  const [researching, setResearching] = useState(false)
  const [research, setResearch] = useState<CompetitorWebsiteResearch | null>(null)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [savingModel, setSavingModel] = useState<string | null>(null)
  const [savedModels, setSavedModels] = useState<Set<string>>(new Set())

  const competitorOptions = useMemo(
    () => PUBLIC_SAFETY_COMPETITORS.map((entry) => ({ value: entry.slug, label: entry.name })),
    [],
  )

  // When a competitor is selected, load that section's memory from GBrain so the
  // chat (below) can be primed with what we already know about them.
  useEffect(() => {
    if (!isAuthenticated || !selected) {
      setSectionMemories([])
      return
    }
    // Research results are competitor-specific — clear them when the section changes.
    setResearch(null)
    setResearchError(null)
    setSavedModels(new Set())
    let cancelled = false
    setSectionLoading(true)
    setSectionMemories([])
    getCompetitorSectionMemories(selected)
      .then((result) => {
        if (!cancelled) setSectionMemories(result.memories)
      })
      .catch(() => {
        if (!cancelled) setSectionMemories([])
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

  const runResearch = async () => {
    if (!selected) return
    setResearching(true)
    setResearchError(null)
    setResearch(null)
    try {
      const result = await researchCompetitorWebsite(selected)
      setResearch(result)
      if (!result.models.length) {
        message.info(`No BWC models could be sourced for ${competitorName(selected)} right now.`)
      } else {
        message.success(`Found ${result.models.length} model${result.models.length === 1 ? '' : 's'} for ${competitorName(selected)}.`)
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Research failed.'
      setResearchError(text)
      message.error(text)
    } finally {
      setResearching(false)
    }
  }

  const saveResearchedModel = async (found: ResearchedBwcModel) => {
    if (!research) return
    setSavingModel(found.name)
    try {
      const specs = researchedSpecs(found)
      const saved = await saveCompetitorMemory({
        competitor: research.competitor,
        model: found.name,
        title: `${research.competitorName} — ${found.name}`,
        content: buildSpecSheet(research.competitorName, found.name, specs, found.notes || ''),
        sensitivity: 'internal',
        source: found.source || research.pagesRead[0] || undefined,
      })
      setSavedModels((current) => new Set(current).add(found.name))
      message.success(`Saved ${found.name} to ${research.competitorName}: ${saved.title}`)
    } catch (saveError) {
      message.error(saveError instanceof Error ? saveError.message : 'GBrain could not save this model.')
    } finally {
      setSavingModel(null)
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

    // Live web-research results shown on this page but NOT yet saved to GBrain.
    // Inject them so the user can ask about the researched models, specs, and
    // pricing before deciding which to save. Distinct from approved memory: it
    // is unverified until saved, so the chat should treat it as provisional.
    if (research && research.competitor === selected && research.models.length) {
      lines.push(
        '',
        `Unsaved live web research for ${selectedName} (shown on screen, NOT yet saved to GBrain — treat as provisional, unverified evidence you may reference now; remind the user it is unsaved when relevant):`,
      )
      if (research.overview) lines.push(`Overview: ${research.overview}`)
      for (const found of research.models.slice(0, 12)) {
        const specs = researchedSpecs(found)
        const specText = SPEC_FIELDS.filter((field) => specs[field.key])
          .map((field) => `${field.label}: ${specs[field.key]}`)
          .join('; ')
        const parts = [found.name]
        if (found.category) parts.push(`(${found.category})`)
        if (specText) parts.push(`— ${specText}`)
        if (found.notes) parts.push(`— Notes: ${found.notes}`)
        if (found.source) parts.push(`[source: ${found.source}]`)
        lines.push(`- ${parts.join(' ')}`)
      }
    }
    return lines.join('\n').slice(0, 6000)
  }

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
        <Space wrap>
          <Button
            type="primary"
            disabled={!isAuthenticated || researching}
            loading={researching}
            onClick={() => void runResearch()}
          >
            {researching ? `Researching ${competitorName(selected)}…` : `Research ${competitorName(selected)} now`}
          </Button>
          <Button disabled={!isAuthenticated} onClick={() => openForSection(selected)}>
            Add a BWC model manually
          </Button>
          {!isAuthenticated ? (
            <Text type="secondary">Sign in to research and save competitor memory.</Text>
          ) : (
            <Text type="secondary">
              Research uses live web search to read {competitorName(selected)}'s own product pages.
            </Text>
          )}
        </Space>
      </Space>
    </Card>
  )

  const researchPanel =
    researchError || research ? (
      <Card className="section-card" title={`Research results — ${selectedName}`} style={{ marginTop: 16 }}>
        {researchError ? (
          <Alert type="error" showIcon message="Research failed" description={researchError} />
        ) : research && research.models.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`No BWC models sourced for ${research.competitorName}.`}
            description="Their site may not expose product specs to automated reads. Try again, or add a model manually."
          />
        ) : research ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {research.overview ? <Paragraph style={{ marginBottom: 0 }}>{research.overview}</Paragraph> : null}
            {research.pagesRead.length ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Read {research.pagesRead.length} page{research.pagesRead.length === 1 ? '' : 's'}:{' '}
                {research.pagesRead.map((url, index) => (
                  <span key={url}>
                    {index > 0 ? ', ' : ''}
                    <a href={url} target="_blank" rel="noreferrer">
                      {url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}
                    </a>
                  </span>
                ))}
              </Text>
            ) : null}
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              }}
            >
              {research.models.map((found) => {
                const specs = researchedSpecs(found)
                const specEntries = SPEC_FIELDS.filter((field) => specs[field.key])
                const isSaved = savedModels.has(found.name)
                return (
                  <Card key={found.name} size="small" title={found.name}>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space wrap size={4}>
                        {found.category ? <Tag color="geekblue">{found.category}</Tag> : null}
                        <Tag>{researchedSpecCount(found)} specs</Tag>
                      </Space>
                      {specEntries.length ? (
                        <div style={{ fontSize: 12 }}>
                          {specEntries.map((field) => (
                            <div key={field.key}>
                              <Text type="secondary">{field.label}: </Text>
                              <Text>{specs[field.key]}</Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          No specs sourced for this model.
                        </Text>
                      )}
                      {found.notes ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {found.notes}
                        </Text>
                      ) : null}
                      {found.source ? (
                        <a href={found.source} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          Source
                        </a>
                      ) : null}
                      <Button
                        size="small"
                        type="primary"
                        block
                        disabled={isSaved}
                        loading={savingModel === found.name}
                        onClick={() => void saveResearchedModel(found)}
                      >
                        {isSaved ? 'Saved to GBrain ✓' : 'Save to GBrain'}
                      </Button>
                    </Space>
                  </Card>
                )
              })}
            </div>
          </Space>
        ) : null}
      </Card>
    ) : null

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
        agentLogo={competitorAnalystLogo}
        backendLabel="Hermes + GBrain"
        renderBeforeChat={
          <>
            {sectionsGrid}
            {researchPanel}
          </>
        }
        buildMessageContext={buildChatContext}
        draftKey={`competitor-analyst:${selected}`}
        competitor={selected}
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
