import ArticleWorkspace from '../components/content/ArticleWorkspace'

// Phase 2 — SEO. Works on the article carried over from Write: Ahrefs settles
// the primary keyword, Surfer scores the draft against the SERP, and the
// rewrite is held to the score it already had.
export default function ContentOperationsSeo() {
  return (
    <ArticleWorkspace
      intro="This is the SEO pass on the article you just wrote. Ask me to check the primary keyword in Ahrefs, score the draft in Surfer, or rewrite it against the guidelines."
      emptyPrompt='Try: "Check the primary keyword for this article in Ahrefs and tell me whether it is worth targeting."'
      queryingLabel="Researching…"
      draftKey="content-operations-seo"
    />
  )
}
