import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function RfpResponseAgent() {
  return (
    <AgentChatWorkspace
      agentId="rfp-response-agent"
      title="RFP Response Agent"
      subtitle="Turn solicitations into a clear response strategy, requirement checklist, and proposal direction."
      intro="OpenClaw is ready to break down RFP requirements, response risks, and proposal strategy."
      emptyPrompt="Ask OpenClaw to analyze an RFP, extract requirements, or propose a response strategy."
    />
  )
}
