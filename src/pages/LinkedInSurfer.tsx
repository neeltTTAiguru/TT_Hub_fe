import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function LinkedInSurfer() {
  return (
    <AgentChatWorkspace
      agentId="linkedin-surfer"
      title="LinkedIn Surfer"
      subtitle="Run focused LinkedIn searches for body-worn camera signals, buyer language, and competitor narratives."
      intro="OpenClaw is ready to run focused LinkedIn searches and turn them into reusable market signal summaries."
      emptyPrompt='Try: "Search LinkedIn for body worn camera conversations for 10 minutes and summarize what matters."'
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag={false}
      chatTitle="Chat"
    />
  )
}
