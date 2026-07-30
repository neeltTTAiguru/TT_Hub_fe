import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-assistant"
      title="Hermes Trusted Tech Assistant"
      subtitle="Work directly with Hermes, Trusted Tech's connected AI assistant."
      intro="Hermes is ready to help with company context, positioning, research in the Smart Hub, and your next best action."
      emptyPrompt='Try: "What do we already know about Trusted Tech positioning, and what should we tighten up next?"'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="Talk to Hermes"
      assistantLabel="Hermes"
      backendLabel="Hermes on Trusted Cloud"
    />
  )
}
