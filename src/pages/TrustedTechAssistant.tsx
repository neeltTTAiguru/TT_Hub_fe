import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Card, Space, Tag, Typography } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import brainLogo from '../assets/agent-logos/brain.svg'
import { getAgents, getBrainSectionMemories, type AgentSummary, type BrainSectionMemory } from '../lib/api'

const { Text } = Typography

const COMPANY_SECTION = { id: 'company', name: 'Trusted Tech Company' }

// Agents that get their own brain section. "Trusted Tech Company" already covers
// the all-agents view and this page IS the Brain (trusted-tech-assistant), so the
// Brain gets no self-section — only the other agents do.
const OFFERED_AGENT_IDS = new Set([
  'competitor-analyst',
  'trusted-tech-hubspot-assistant',
  'trusted-tech-youtrack-assistant',
  'content-operations-assistant',
])

type Section = { id: string; name: string }

export default function TrustedTechAssistant() {
  const { isAuthenticated } = useAuth0()
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [selected, setSelected] = useState<string>(COMPANY_SECTION.id)
  const [memories, setMemories] = useState<BrainSectionMemory[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch(() => setAgents([]))
  }, [])

  const sections: Section[] = useMemo(() => {
    const agentSections = agents
      .filter((entry) => OFFERED_AGENT_IDS.has(entry.id))
      .map((entry) => ({ id: entry.id, name: entry.name }))
    return [COMPANY_SECTION, ...agentSections]
  }, [agents])

  const selectedSection = sections.find((entry) => entry.id === selected) ?? COMPANY_SECTION
  const isCompany = selected === COMPANY_SECTION.id

  // Loads the selected section's memory from GBrain so the chat can be primed
  // with (and held to) exactly that section's saved rules, and so "Save to Brain"
  // can offer those memories as update targets.
  const loadSectionMemories = useCallback(() => {
    if (!isAuthenticated || !selected) {
      setMemories([])
      return
    }
    setLoading(true)
    getBrainSectionMemories(selected)
      .then((result) => setMemories(result.memories))
      .catch(() => setMemories([]))
      .finally(() => setLoading(false))
  }, [selected, isAuthenticated])

  useEffect(() => {
    loadSectionMemories()
  }, [loadSectionMemories])

  // Scopes every chat message to the selected section and injects its loaded
  // GBrain memory so Brain answers as that section — and treats its saved rules
  // as authoritative (this is what makes "talk to a section" actually apply the
  // section's rules, even ones scoped away from the company-wide brain).
  const buildChatContext = () => {
    const lines = [
      isCompany
        ? "You are Brain, answering from Trusted Technology's company-wide approved memory (readable by every agent)."
        : `You are Brain, answering strictly for the "${selectedSection.name}" section of the brain. Treat this section's saved rules and knowledge as authoritative; if they conflict with your general knowledge, the section's rules win.`,
    ]
    if (memories.length) {
      lines.push(`Approved ${selectedSection.name} memory loaded from GBrain (authoritative rules / evidence):`)
      for (const memory of memories.slice(0, 12)) {
        lines.push(`- ${memory.title}: ${memory.summary}`)
      }
    } else {
      lines.push(`No memory is stored in the ${selectedSection.name} section yet.`)
    }
    return lines.join('\n').slice(0, 8000)
  }

  const sectionsGrid = (
    <Card
      className="section-card"
      title="Brain sections"
      extra={<Tag color="gold">{sections.length} sections</Tag>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Each section is a scoped slice of the brain. “Trusted Tech Company” is readable by every agent; each
          agent section holds knowledge only that agent uses. Select a section to talk to it — Brain will apply
          exactly that section's saved rules. Save into a section with “Save to Brain”.
        </Text>
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          }}
        >
          {sections.map((entry, index) => (
            <Card
              key={entry.id}
              size="small"
              hoverable
              onClick={() => setSelected(entry.id)}
              style={{
                borderColor: selected === entry.id ? 'var(--app-primary)' : undefined,
                borderWidth: selected === entry.id ? 2 : 1,
              }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text strong>
                  {index + 1}. {entry.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {entry.id === COMPANY_SECTION.id ? 'Company-wide · all agents' : `Agent section · ${entry.id}`}
                </Text>
              </Space>
            </Card>
          ))}
        </div>
      </Space>
    </Card>
  )

  return (
    <AgentChatWorkspace
      key={selected}
      agentId="trusted-tech-assistant"
      title="Brain"
      subtitle="Search Trusted Tech’s approved GBrain memory, reason with company context, and explicitly save knowledge worth remembering."
      intro={
        loading
          ? `Loading the ${selectedSection.name} section…`
          : isCompany
            ? "You're talking to the company-wide brain (readable by every agent)."
            : `You're talking to the ${selectedSection.name} section — I'll apply its saved rules.`
      }
      emptyPrompt={isCompany ? 'Ask Brain about company-wide memory…' : `Ask the ${selectedSection.name} section…`}
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle={isCompany ? 'Talk to Brain (Company)' : `Talk to ${selectedSection.name} section`}
      assistantLabel="Brain"
      agentLogo={brainLogo}
      backendLabel="Hermes + GBrain"
      enableBrainMemorySave
      memorySection={selected}
      sectionMemories={memories}
      onMemorySaved={loadSectionMemories}
      renderBeforeChat={sectionsGrid}
      buildMessageContext={buildChatContext}
      draftKey={`brain:${selected}`}
    />
  )
}
