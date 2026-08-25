import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Space, Typography, message } from 'antd'
import AgentChatWorkspace from '../AgentChatWorkspace'
import FieldGuideArticle, { draftTitle } from './FieldGuideArticle'
import type { ArticleFix } from '../MarkdownArticle'
import ArticleTools from './ArticleTools'
import surferLogo from '../../assets/agent-logos/surfer.svg'
import { generateContentOperationsDraftImages } from '../../lib/api'

const { Text } = Typography

// The panel is fed by exactly one thing: an `article` fence the writer puts
// around the piece it is handing over. Nothing else can reach it.
//
// Every previous version of this tried to RECOGNISE an article — by length, by
// paragraph count, by whether it carried a heading. Each rule was defeated by
// something that was not an article but read like one: an acknowledgement, a
// summary of a study, a keyword report. Each time, that text became the draft.
// There is no test on free prose that reliably separates "here is your article"
// from "here is what I think about it", because the difference is intent, and
// intent has to be declared rather than inferred.
//
// So the writer declares it. Unfenced replies are conversation, always, however
// long or article-shaped they look. The closing fence is optional here because
// the same function reads partial text mid-stream.
// Deliberately NOT /m. With the multiline flag the trailing `$` means end of
// LINE, so the lazy body matched nothing and the article arrived truncated to its
// title. Without it, `$` is end of input, which is what the still-streaming case
// needs. `(?:^|\n)` keeps the opening fence anchored to a line start.
const ARTICLE_FENCE = /(?:^|\n)```article[^\n]*\n([\s\S]*?)(?:\n```|$)/

function extractArticle(value: string) {
  const match = value.match(ARTICLE_FENCE)
  return match ? match[1].trim() : ''
}

// The article belongs in the panel and the remarks belong in the conversation,
// so a reply carrying both is split rather than shown whole in either place. What
// is stored keeps the fence — only the display loses it — so reopening the thread
// still replays the article into the panel.
function stripArticleFence(value: string) {
  return value.replace(ARTICLE_FENCE, '\n\n').trim()
}

// A reply carrying a title but no fence: almost certainly an article the writer
// forgot to mark. It is offered to the editor as a one-click promotion rather
// than being taken automatically — that judgement is theirs, not this file's.
function looksUnfencedArticle(value: string) {
  return !extractArticle(value) && /^#\s+\S/m.test(value.trim()) && value.trim().length > 240
}

import { useContentPipeline } from '../../lib/contentPipeline'
import SeoProgress from './SeoProgress'
import { getSeoPassState, stopSeoPass, subscribeSeoPass } from '../../lib/seoPassRunner'
import {
  applyArticleFix,
  dismissArticleFix,
  getArticleFixes,
  subscribeArticleFixes,
} from '../../lib/articleFixes'

// What AgentChatWorkspace hands back.
type ChatBridge = {
  appendAssistantMessage: (content: string) => void
  sendMessage: (content: string) => void
}

export type ChatApi = ChatBridge

type Props = {
  // Phase-specific wiring. The layout, the field-guide rendering and the
  // draft-promotion logic are identical everywhere; only these differ.
  intro: string
  emptyPrompt: string
  queryingLabel: string
  // Extra controls for the draft toolbar — the SEO score, the publish action.
  // Given the chat api so a background job can report into the conversation.
  panelActions?: (api: ChatApi) => ReactNode
  // Whether this phase generates artwork. Only Write does; the later phases
  // inherit whatever the article already has.
  generatesImages?: boolean
  // Only the SEO phase shows the pass progress. seoStage is shared state, so
  // without this every page renders the takeover.
  showsSeoProgress?: boolean
  // The Ahrefs / Surfer / WordPress controls under the rail toggle.
  showArticleTools?: boolean
  draftKey: string
}

export default function ArticleWorkspace({
  intro,
  emptyPrompt,
  queryingLabel,
  panelActions,
  generatesImages = false,
  showsSeoProgress = false,
  showArticleTools = false,
  draftKey,
}: Props) {
  const pipeline = useContentPipeline()
  const [panelOpen, setPanelOpen] = useState(false)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const imagesStartedRef = useRef(false)
  // Set when the user actually sends something. Restoring a saved thread replays
  // past articles through the same handler, and that must never spend image
  // credits or upload to WordPress on a page load. This keyed off the first
  // streamed token until a turn that answered without deltas left it false —
  // and the guard below then read a freshly written article as replayed history
  // and dropped it. A turn starting is the honest signal; history never starts
  // one.
  const liveTurnRef = useRef(false)
  const streamingDraftRef = useRef('')
  const streamTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (streamTimer.current !== null) window.clearTimeout(streamTimer.current)
  }, [])
  const chatApiRef = useRef<ChatBridge>({ appendAssistantMessage: () => {}, sendMessage: () => {} })
  // Handed to the panel instead of the ref's current value. Reading the ref
  // during render captures whatever is there at mount — the placeholder, since
  // registration happens in an effect afterwards — and a panel that never
  // re-renders keeps calling it. This indirection always reaches the live api.
  const chatApi = useRef<ChatApi>({
    appendAssistantMessage: (content: string) => chatApiRef.current.appendAssistantMessage(content),
    sendMessage: (content: string) => chatApiRef.current.sendMessage(content),
  })

  // Whether the turn that just ended left the article exactly as it was. Asking
  // for a rewrite and getting a conversational reply is a real outcome — the
  // writer answers "yes, I understand" and never re-emits the piece — and the
  // panel still showing the old article reads as a rewrite that happened. It has
  // to say so instead of letting the editor publish the unchanged version
  // believing their direction was applied.
  const [unchanged, setUnchanged] = useState(false)
  // A reply that carries a title but no fence, held aside so the editor can put
  // it in the panel deliberately. Nothing reaches the article without a click.
  const [promotable, setPromotable] = useState('')
  const [draftAtTurnStart, setDraftAtTurnStart] = useState('')
  const [pass, setPass] = useState(getSeoPassState)
  useEffect(() => {
    const unsubscribe = subscribeSeoPass(() => setPass(getSeoPassState()))
    return () => { unsubscribe() }
  }, [])

  const [fixState, setFixState] = useState(getArticleFixes)
  useEffect(() => {
    const unsubscribe = subscribeArticleFixes(() => setFixState(getArticleFixes()))
    return () => { unsubscribe() }
  }, [])

  const draft = pipeline.draft
  const images = pipeline.images

  // Arriving on a later phase with an article already in hand should show it,
  // not an empty panel waiting for a message that will never come.
  useEffect(() => {
    if (draft) setPanelOpen(true)
  }, [draft])

  // The user asked for a new article, or deleted the one they were reading. This
  // is the only path that clears the shared pipeline: an article survives phase
  // changes and empty threads, but not this.
  const handleNewArticle = () => {
    pipeline.reset()
    setPanelOpen(false)
    setImageError('')
    setUnchanged(false)
    setPromotable('')
    imagesStartedRef.current = false
    liveTurnRef.current = false
  }

  const handleThreadReset = () => {
    setImageError('')
    setUnchanged(false)
    setPromotable('')
    imagesStartedRef.current = false
    liveTurnRef.current = false
    // An empty thread on this phase does not mean there is no article. The
    // article lives in the shared pipeline and was very likely written on
    // another phase — or by the SEO pass, which remounts this chat with an
    // empty thread the moment it finishes. Only close the panel when there is
    // genuinely nothing to show.
    if (!pipeline.draft) setPanelOpen(false)
  }

  const generateImagesFor = async (article: string) => {
    setImagesLoading(true)
    setImageError('')
    try {
      const result = await generateContentOperationsDraftImages({
        article,
        title: draftTitle(article),
      })
      pipeline.update({ images: result.images })
    } catch (error) {
      // A failed generation must not lock the article out of artwork forever.
      imagesStartedRef.current = false
      setImageError(error instanceof Error ? error.message : 'The article images could not be generated.')
    } finally {
      setImagesLoading(false)
    }
  }

  const handleAssistantDelta = (content: string) => {
    const article = extractArticle(content)
    if (!article) return
    // Committing every token wrote the whole article to storage and broadcast it
    // to every subscriber hundreds of times a turn. Behind the progress overlay
    // none of it is even visible, so the partial is held locally and published
    // at a readable rate instead.
    streamingDraftRef.current = article
    if (streamTimer.current !== null) return
    streamTimer.current = window.setTimeout(() => {
      streamTimer.current = null
      pipeline.update({ draft: streamingDraftRef.current })
    }, 400)
    setPanelOpen(true)
  }

  const handleAssistantMessage = (content: string) => {
    const article = extractArticle(content)
    if (!article) {
      setPromotable(looksUnfencedArticle(content) ? content : '')
      // Only for a turn the user actually started, and only when there was an
      // article to change. A question about the draft legitimately lands here
      // too, so this states the fact rather than raising an error.
      if (liveTurnRef.current && draftAtTurnStart) setUnchanged(true)
      return
    }
    // Each phase has its own chat thread, and mounting one replays its saved
    // history through here. Without this guard, opening Write after an SEO pass
    // replays the article as first written and overwrites the improved version —
    // switching tabs silently undoes the rewrite. Restored history may seed an
    // empty pipeline, never overwrite what is already in it.
    if (!liveTurnRef.current && pipeline.draft) {
      setPanelOpen(true)
      return
    }
    // The final version lands immediately rather than waiting behind a pending
    // throttle that would overwrite it with a stale partial.
    if (streamTimer.current !== null) {
      window.clearTimeout(streamTimer.current)
      streamTimer.current = null
    }
    pipeline.update({ draft: article })
    setUnchanged(false)
    setPromotable('')
    setPanelOpen(true)
    if (generatesImages && liveTurnRef.current && !imagesStartedRef.current) {
      imagesStartedRef.current = true
      void generateImagesFor(article)
      return
    }
  }

  const title = useMemo(() => (draft ? draftTitle(draft) : ''), [draft])

  // The article as it is laid out, not as markdown — this is the copy that gets
  // sent to someone who is not going to open a text editor.
  //
  // Rasterised from a CLONE placed off-screen with absolute positioning:
  // html2canvas renders a `fixed` or zero-height element blank, and the live
  // panel is a scrolling box whose captured height would be one screen. The
  // editing furniture is stripped from the clone — suggestion cards and status
  // banners are things to act on, not part of the article.
  const [downloading, setDownloading] = useState(false)
  const panelBodyRef = useRef<HTMLDivElement>(null)

  const downloadArticle = async () => {
    const source = panelBodyRef.current
    if (!source || downloading) return
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'article'

    setDownloading(true)
    const holder = document.createElement('div')
    holder.style.cssText = 'position:absolute; left:-9999px; top:0; width:820px; background:#ffffff;'
    const clone = source.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.article-fix-slot, .ant-alert').forEach((node) => node.remove())
    clone.querySelectorAll('mark.article-fix-target').forEach((node) => {
      node.replaceWith(document.createTextNode(node.textContent || ''))
    })
    clone.style.cssText = 'height:auto; max-height:none; overflow:visible; background:#ffffff;'
    holder.appendChild(clone)
    document.body.appendChild(holder)
    try {
      // Let layout and fonts settle, or the canvas can come out empty.
      await new Promise((resolve) => { window.setTimeout(resolve, 80) })
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: [12, 12, 14, 12],
          filename: `${slug}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          // useCORS matters: the artwork is served from WordPress, and without it
          // every image rasterises blank.
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['figure', 'h2', 'h3'] },
        })
        .from(clone)
        .save()
    } catch {
      message.error('Could not build the PDF.')
    } finally {
      document.body.removeChild(holder)
      setDownloading(false)
    }
  }

  // Accepting is the only thing that edits the article, and it edits exactly the
  // passage the card is sitting against — no batch apply, no silent rewrite.
  const renderFix = (fix: ArticleFix) => (
    <div className="article-fix" role="group" aria-label={`Suggested edit for ${fix.keyword}`}>
      <div className="article-fix-head">
        <Text strong>{fix.keyword}</Text>
        <Text type="secondary" className="article-fix-source">Ahrefs</Text>
      </div>
      {fix.why ? <Text type="secondary" className="article-fix-why">{fix.why}</Text> : null}
      <p className="article-fix-replace">{fix.replace || <em>(remove this passage)</em>}</p>
      <Space size={8}>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            const next = applyArticleFix(draft, fix.id)
            if (next) pipeline.update({ draft: next })
          }}
        >
          Accept
        </Button>
        <Button size="small" onClick={() => dismissArticleFix(fix.id)}>Decline</Button>
      </Space>
    </div>
  )

  const draftPanel = (
    <aside className="draft-panel" aria-label="Article draft">
      <div className="draft-panel-toolbar">
        <span className="draft-panel-title">
          <Text strong ellipsis>{title}</Text>
          <Text type="secondary" className="draft-panel-kind">MD</Text>
        </span>
        <Space size={8}>
          {imagesLoading ? <Text type="secondary" style={{ fontSize: 12 }}>Generating images…</Text> : null}
          <Button size="small" loading={downloading} onClick={() => void downloadArticle()}>Download</Button>
          {panelActions?.(chatApi.current)}
        </Space>
      </div>
      <div className="draft-panel-body" ref={panelBodyRef}>
        {unchanged ? (
          <Alert
            type="warning"
            showIcon
            closable
            onClose={() => setUnchanged(false)}
            message="The article below is unchanged"
            description="That reply was conversation, not a new draft — nothing in the article was rewritten. If you asked for a change, ask again for the full revised article."
            style={{ margin: '0 40px 16px' }}
          />
        ) : null}
        {imageError ? (
          <Alert type="error" showIcon message="Images unavailable" description={imageError} style={{ margin: '0 40px 16px' }} />
        ) : null}
        <FieldGuideArticle
          markdown={draft}
          images={images}
          fixes={fixState.fixes}
          renderFix={renderFix}
        />
      </div>
    </aside>
  )

  // Progress is drawn OVER the workspace, never in place of it. Replacing the
  // tree unmounts AgentChatWorkspace mid-turn, which owns the thread list, the
  // autosave refs and the in-flight request — so the article being written was
  // never saved to the Articles rail. The overlay hides the same things without
  // tearing anything down.
  const overlayActive = Boolean(showsSeoProgress && pass.running)
  // Held one beat past the work finishing so the overlay can fade rather than
  // vanish mid-frame, which is what made this snap.
  const [overlayVisible, setOverlayVisible] = useState(false)
  useEffect(() => {
    if (overlayActive) {
      setOverlayVisible(true)
      return
    }
    const timer = window.setTimeout(() => setOverlayVisible(false), 260)
    return () => window.clearTimeout(timer)
  }, [overlayActive])

  const overlay = showsSeoProgress && pass.running ? (
    <SeoProgress stage={pass.stage} error={pass.error} onStop={() => void stopSeoPass()} />
  ) : null

  return (
    <>
    {overlayVisible ? (
      <div className={`stage-overlay${overlayActive ? '' : ' stage-overlay-leaving'}`}>
        {overlay}
      </div>
    ) : null}
    <AgentChatWorkspace
      agentId="content-operations-assistant"
      title="Content Generator"
      subtitle="Talk with Hermes about Trusted Tech articles."
      intro={intro}
      emptyPrompt={emptyPrompt}
      showAgentOverview={false}
      showThreadControls={false}
      showChatIntro={false}
      showInitialAssistantMessage={false}
      showPageHeader={false}
      chatTitle=""
      assistantLabel="Content Generator"
      agentLogo={surferLogo}
      backendLabel="Hermes + Content Operations"
      queryingLabel={queryingLabel}
      streaming
      fullHeight
      threadRail
      threadRailTitle="Articles"
      threadRailNewLabel="New article"
      threadRailEmptyText="No articles yet — start writing and they'll appear here."
      showHeaderControls={false}
      renderBeforeChat={promotable ? (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setPromotable('')}
          message="That reply reads like an article, but it was not marked as one"
          description="It has been left in the conversation. Put it in the panel only if it really is the article."
          action={(
            <Button
              size="small"
              onClick={() => {
                pipeline.update({ draft: promotable })
                setPromotable('')
                setPanelOpen(true)
              }}
            >
              Use it as the article
            </Button>
          )}
          style={{ marginBottom: 12 }}
        />
      ) : undefined}
      registerChatApi={(api) => { chatApiRef.current = api }}
      railTools={showArticleTools ? <ArticleTools /> : undefined}
      chatSidePanel={draft && panelOpen ? draftPanel : undefined}
      chatSidePanelPosition="left"
      transformAssistantMessage={stripArticleFence}
      onAssistantMessage={handleAssistantMessage}
      onAssistantDelta={handleAssistantDelta}
      onTurnStart={() => {
        liveTurnRef.current = true
        setDraftAtTurnStart(pipeline.draft)
        setUnchanged(false)
        setPromotable('')
      }}
      onThreadReset={handleThreadReset}
      onNewThread={handleNewArticle}
      draftKey={draftKey}
    />
    </>
  )
}
