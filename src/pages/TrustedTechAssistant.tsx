import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-assistant"
      title="Brain"
      subtitle="Search Trusted Tech’s approved GBrain memory, reason with company context, and explicitly save knowledge worth remembering."
      intro="Brain uses Hermes to search approved GBrain memory before answering. It never adds conversation content to GBrain unless you review and confirm a separate Save to Brain request."
      emptyPrompt='Ask Brain: "What does GBrain know about Trusted Technology’s positioning?"'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="Talk to Brain"
      assistantLabel="Brain"
      backendLabel="Hermes + GBrain"
      enableBrainMemorySave
    />
  )
}
