import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechAhrefsAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-ahrefs-assistant"
      title="Hermes Ahrefs Assistant"
      subtitle="Talk with Hermes about Trusted Tech's keyword, SERP, and competitor research."
      intro="Ask Hermes to research keywords, search demand, ranking pages, competitor domains, and content opportunities using connected Ahrefs data."
      emptyPrompt='Try: "Research police body camera grants and identify the strongest content opportunity for Trusted Tech."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="Research with Ahrefs through Hermes"
      assistantLabel="Ahrefs Assistant"
      backendLabel="Hermes + Ahrefs MCP"
    />
  )
}
