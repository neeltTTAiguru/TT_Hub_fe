import AgentChatWorkspace from '../components/AgentChatWorkspace'
import youtrackLogo from '../assets/agent-logos/youtrack.svg'

export default function TrustedTechYouTrackAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-youtrack-assistant"
      title="YouTrack"
      subtitle="Talk with Hermes about Trusted Tech's YouTrack projects, issues, and knowledge base."
      intro="Ask about projects, issues, assignees, comments, saved searches, and YouTrack knowledge-base articles. This assistant is read-only."
      emptyPrompt='Try: "Show me the open issues assigned to me and summarize the highest-priority work."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showBackendTag
      chatTitle="Talk to YouTrack through Hermes"
      assistantLabel="YouTrack Assistant"
      agentLogo={youtrackLogo}
      backendLabel="Hermes + YouTrack"
      queryingLabel="Querying YouTrack…"
    />
  )
}
