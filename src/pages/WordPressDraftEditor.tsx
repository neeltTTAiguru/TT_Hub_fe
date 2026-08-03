import AgentChatWorkspace from '../components/AgentChatWorkspace'

export default function WordPressDraftEditor() {
  return (
    <AgentChatWorkspace
      agentId="wordpress-draft-editor"
      title="Hermes WordPress Content Assistant"
      subtitle="Create, find, and revise WordPress draft posts and pages without changing the live site."
      intro="Ask me to create a draft blog post or page, list existing drafts, or revise one by ID, title, slug, or editor URL. Everything remains unpublished for human review."
      emptyPrompt="Example: Create a draft blog post about secure body-camera evidence storage, or edit draft #1113 and make the CTA less promotional."
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showBackendTag
      chatTitle="WordPress content workspace"
      assistantLabel="Hermes WordPress Assistant"
      backendLabel="Hermes + WordPress REST API"
      showRefreshButton
    />
  )
}
