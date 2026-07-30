import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function TrustedTechHubSpotAssistant() {
  return (
    <AgentChatWorkspace
      agentId="trusted-tech-hubspot-assistant"
      title="Hermes HubSpot Assistant"
      subtitle="Talk with Hermes about Trusted Tech's connected HubSpot CRM."
      intro="Ask about contacts, companies, deals, tickets, activities, campaigns, or CRM follow-up. Hermes will ask before making any changes."
      emptyPrompt='Try: "Show me our recent HubSpot deals and summarize the next actions."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="Talk to HubSpot through Hermes"
      assistantLabel="HubSpot Assistant"
      backendLabel="Hermes + HubSpot MCP"
    />
  )
}
