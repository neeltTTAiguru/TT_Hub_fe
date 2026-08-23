import ArticleWorkspace from '../components/content/ArticleWorkspace'

// Phase 3 — publish. A human is always responsible for publishing, so nothing
// here happens without a deliberate action.
export default function ContentOperationsPublish() {
  return (
    <ArticleWorkspace
      intro="This is the publishing pass. Ask me to prepare the WordPress draft, check the meta title, description and slug, or review anything before it goes out."
      emptyPrompt='Try: "Check the meta description and slug are right before we create the WordPress draft."'
      queryingLabel="Preparing…"
      draftKey="content-operations-publish"
    />
  )
}
