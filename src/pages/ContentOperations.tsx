import ArticleWorkspace from '../components/content/ArticleWorkspace'

// The whole content workflow on one page. The chat writes and edits the article;
// the Ahrefs, Surfer and WordPress controls under the rail toggle each act on
// whatever is in the panel, in any order and none of them required.
//
// Nothing here takes the screen. Writing, artwork and the SEO pass all report
// where the work is — the chat's own indicator, the panel toolbar, the tool's
// own popover — rather than covering the workspace with a progress view.
export default function ContentOperations() {
  return (
    <ArticleWorkspace
      intro="Ask for an article or blog, or bring a draft you want reworked. Tell me the topic, the reader, and the angle; I'll research it, plan it, and write it with you."
      emptyPrompt='Try: "Write a Trusted Tech article on how small police departments budget for body-camera storage."'
      queryingLabel="Writing…"
      generatesImages
      showArticleTools
      draftKey="content-operations"
    />
  )
}
