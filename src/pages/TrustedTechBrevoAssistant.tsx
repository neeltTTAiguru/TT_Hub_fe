import AgentChatWorkspace from '../components/AgentChatWorkspace'
import brevoLogo from '../assets/agent-logos/brevo.svg'

export default function TrustedTechBrevoAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-brevo-assistant"
      title="Brevo"
      subtitle="Draft, design, and send Trusted Tech email through Brevo — campaigns, transactional sends, contacts, and stats."
      intro="Describe the email you want and the audience. The assistant drafts the subject and body, and always asks before anything is sent."
      emptyPrompt='Try: "Draft a short re-engagement email to contacts who haven&apos;t opened in 60 days."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showBackendTag
      chatTitle="Talk to Brevo through the hub"
      assistantLabel="Brevo Assistant"
      agentLogo={brevoLogo}
      backendLabel="Brevo"
      queryingLabel="Querying Brevo…"
    />
  )
}
