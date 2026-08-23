import AgentChatWorkspace from '../components/AgentChatWorkspace'
import surferLogo from '../assets/agent-logos/surfer.svg'

export default function ContentOperations() {
  return (
    <AgentChatWorkspace
      agentId="content-operations-assistant"
      title="Content Generator"
      subtitle="Talk with Hermes about Trusted Tech articles — research an angle, plan it, draft it, and revise it in conversation."
      intro="Ask for an article or blog, or bring a draft you want reworked. Tell me the topic, the reader, and the angle; I'll research it, plan it, and write it with you."
      emptyPrompt='Try: "Write a Trusted Tech article on how small police departments budget for body-camera storage."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showPageHeader={false}
      chatTitle=""
      assistantLabel="Content Generator"
      agentLogo={surferLogo}
      backendLabel="Hermes + Content Operations"
      queryingLabel="Writing…"
      streaming
      fullHeight
      threadRail
      threadRailTitle="Articles"
      threadRailNewLabel="New article"
      threadRailEmptyText="No articles yet — start writing and they'll appear here."
      showHeaderControls={false}
      draftKey="content-operations"
    />
  )
}
