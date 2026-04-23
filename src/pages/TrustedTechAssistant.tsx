import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-assistant"
      title="Trusted Tech Assistant"
      subtitle="Chat directly with Trusted Tech's internal assistant."
      intro="OpenClaw is ready to chat as Trusted Tech's internal assistant. Ask about company context, positioning, research already in the hub, or what to do next."
      emptyPrompt='Try: "What do we already know about Trusted Tech positioning, and what should we tighten up next?"'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag={false}
      chatTitle="Chat"
    />
  )
}
