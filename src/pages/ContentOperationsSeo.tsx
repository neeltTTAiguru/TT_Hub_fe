import ArticleWorkspace from '../components/content/ArticleWorkspace'
import SeoPassAction from '../components/content/SeoPassAction'

// Surfer SEO. Works on whatever article is in the pipeline, wherever it came
// from: Surfer scores the draft against the SERP and the rewrite is held to the
// score it already had. Reachable on its own — a draft does not have to have
// been written here.
export default function ContentOperationsSeo() {
  return (
    <ArticleWorkspace
      intro="This is the SEO pass on the article you just wrote. Ask me to check the primary keyword in Ahrefs, score the draft in Surfer, or rewrite it against the guidelines."
      emptyPrompt='Try: "Check the primary keyword for this article in Ahrefs and tell me whether it is worth targeting."'
      queryingLabel="Researching…"
      showsSeoProgress
      panelActions={(api) => <SeoPassAction chat={api} />}
      draftKey="content-operations-seo"
    />
  )
}
