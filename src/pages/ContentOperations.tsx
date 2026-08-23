import ArticleWorkspace from '../components/content/ArticleWorkspace'

// Phase 1 — write. The only phase that generates artwork; SEO and Publish
// inherit whatever the article already carries.
export default function ContentOperations() {
  return (
    <ArticleWorkspace
      intro="Ask for an article or blog, or bring a draft you want reworked. Tell me the topic, the reader, and the angle; I'll research it, plan it, and write it with you."
      emptyPrompt='Try: "Write a Trusted Tech article on how small police departments budget for body-camera storage."'
      queryingLabel="Writing…"
      generatesImages
      draftKey="content-operations"
    />
  )
}
