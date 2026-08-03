import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function WordPressDraftTestAgent() {
  return (
    <AgentChatWorkspace
      agentId="wordpress-draft-test-agent"
      title="WordPress Draft Test Agent"
      subtitle="Give Hermes an article prompt and create one WordPress draft for human review."
      intro="Describe the article you want. I will create exactly one WordPress draft and return its post ID, status, and review link. Nothing will be published live."
      emptyPrompt="Describe the article title, audience, key points, and any source constraints."
      chatTitle="Create a WordPress review draft"
      assistantLabel="Hermes WordPress Draft Agent"
      backendLabel="Hermes + WordPress MCP"
    />
  )
}
