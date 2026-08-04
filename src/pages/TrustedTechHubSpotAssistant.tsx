import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechHubSpotAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-hubspot-assistant"
      title="Hubspot"
      subtitle="Talk with Hermes exclusively about Trusted Tech's HubSpot deal pipeline."
      intro="Ask about deals, stages, owners, trials, quotes, close dates, pipeline health, and next actions. Hermes will ask before making any changes."
      emptyPrompt='Try: "Show me our active deals by stage and summarize the next action for each."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showBackendTag
      chatTitle="Talk to the deal pipeline through Hermes"
      assistantLabel="Deal Pipeline Assistant"
      backendLabel="Hermes + HubSpot Deals"
      queryingLabel="Querying HubSpot…"
    />
  )
}
