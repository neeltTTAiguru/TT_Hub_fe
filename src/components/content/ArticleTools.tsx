import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Empty, Popover, Space, Spin, Tag, Typography } from 'antd'
import ahrefsLogo from '../../assets/agent-logos/ahrefs.svg'
import surferLogo from '../../assets/agent-logos/surfer.svg'
import wordpressLogo from '../../assets/agent-logos/wordpress.svg'
import { useContentPipeline } from '../../lib/contentPipeline'
import { getSeoPassState, startSeoPass, stopSeoPass, subscribeSeoPass, termGaps } from '../../lib/seoPassRunner'
import { getArticleFixes, requestArticleFixes, requestSurferFixes, subscribeArticleFixes } from '../../lib/articleFixes'
import { rateArticle } from '../../lib/contentRating'
import {
  createContentOperationsRun,
  createContentPublishWordPressDraft,
  getContentOperationsRun,
  getSitemapStatus,
  refreshSitemap,
  type ContentOpportunity,
  type ContentPublishState,
  type SitemapRefreshResult,
  type SitemapStatus,
} from '../../lib/api'
import { draftTitle } from './FieldGuideArticle'

const { Text } = Typography

type Tool = '' | 'ahrefs' | 'surfer' | 'wordpress'

const POLL_MS = 4000

// An article scoring at or under this is not good enough to leave alone, so the
// pass's rewrite is applied rather than offered. Above it, the draft is already
// competitive and is left exactly as written — a rewrite that gains a point or
// two is not worth losing the author's phrasing over.
const REWRITE_AT_OR_BELOW = 85

// Each tool reports into its own popover rather than into the conversation. The
// chat is for writing and editing the article; keyword tables, score breakdowns
// and publish confirmations are reference material you glance at and dismiss,
// and threading them through the transcript buried the actual writing.
export default function ArticleTools() {
  const pipeline = useContentPipeline()
  const [open, setOpen] = useState<Tool>('')
  const [pass, setPass] = useState(getSeoPassState)

  const [keywords, setKeywords] = useState<ContentOpportunity[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(false)
  const [keywordsError, setKeywordsError] = useState('')
  // Which article the keywords were researched for, so reopening the panel does
  // not re-run Ahrefs for a piece it has already covered.
  const researchedFor = useRef('')

  const [published, setPublished] = useState<ContentPublishState | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  // Sitemap: Yoast builds it, the backend tells Google about it. The panel shows
  // what the site serves and what Google last fetched, and can force a refresh.
  const [sitemap, setSitemap] = useState<SitemapStatus | null>(null)
  const [sitemapLoading, setSitemapLoading] = useState(false)
  const [sitemapRefreshing, setSitemapRefreshing] = useState(false)
  const [sitemapResult, setSitemapResult] = useState<SitemapRefreshResult | null>(null)
  const [sitemapError, setSitemapError] = useState('')

  const loadSitemap = async () => {
    setSitemapLoading(true)
    setSitemapError('')
    try {
      setSitemap(await getSitemapStatus())
    } catch (cause) {
      setSitemapError(cause instanceof Error ? cause.message : 'The sitemap status could not be read.')
    } finally {
      setSitemapLoading(false)
    }
  }

  const runSitemapRefresh = async () => {
    if (sitemapRefreshing) return
    setSitemapRefreshing(true)
    setSitemapError('')
    try {
      // The published URL when there is one to verify; otherwise a scan of
      // WordPress for anything published or edited since the last check.
      const next = await refreshSitemap(published?.url ? { urls: [published.url] } : { scanWordPress: true })
      setSitemapResult(next)
      await loadSitemap()
    } catch (cause) {
      setSitemapError(cause instanceof Error ? cause.message : 'The sitemap could not be refreshed.')
    } finally {
      setSitemapRefreshing(false)
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeSeoPass(() => setPass(getSeoPassState()))
    return () => { unsubscribe() }
  }, [])

  const [fixState, setFixState] = useState(getArticleFixes)
  useEffect(() => {
    const unsubscribe = subscribeArticleFixes(() => setFixState(getArticleFixes()))
    return () => { unsubscribe() }
  }, [])

  // Step out of the way the moment the suggestions land — they are in the
  // article, and the panel is sitting on top of it. Only on the transition, so
  // reopening the panel later to re-read it does not slam it shut again.
  const wasWorking = useRef(false)
  useEffect(() => {
    if (wasWorking.current && !fixState.loading && fixState.fixes.length) setOpen('')
    wasWorking.current = fixState.loading
  }, [fixState.loading, fixState.fixes.length])

  const draft = pipeline.draft
  const title = draft ? draftTitle(draft) : ''

  const researchKeywords = async () => {
    if (keywordsLoading) return
    setKeywordsLoading(true)
    setKeywordsError('')
    setKeywords([])
    researchedFor.current = draft
    try {
      const run = await createContentOperationsRun({
        targetDomain: 'trustedtechnology.ai',
        requestType: 'find_content_opportunities',
        userInstructions: draft
          ? `Find the keywords this Trusted Technology article should target: "${title}". Base them on what the article actually covers.\n\n${draft.slice(0, 4000)}`
          : 'Find keywords worth targeting for a new Trusted Technology article about body-worn cameras and evidence management.',
        workflowMode: 'manual',
        researchOnly: true,
      })
      // The run is created and worked in the background, so the opportunities
      // arrive on a later read rather than in this response.
      let current = run
      while (current.status === 'running' || current.status === 'ready') {
        await new Promise((resolve) => { window.setTimeout(resolve, POLL_MS) })
        current = await getContentOperationsRun(run.runId)
      }
      if (current.status === 'error') {
        throw new Error(current.errors?.[current.errors.length - 1] || 'Ahrefs research failed.')
      }
      const found = current.opportunities || []
      setKeywords(found)
      // The keyword table was never the point — the fixes are. Research runs so
      // the fixes have something to place, then hands straight over rather than
      // parking a list in front of the editor and waiting to be asked again.
      if (found.length && draft) await requestArticleFixes(draft, found)
    } catch (cause) {
      researchedFor.current = ''
      setKeywordsError(cause instanceof Error ? cause.message : 'Ahrefs research could not be completed.')
    } finally {
      setKeywordsLoading(false)
    }
  }

  // Opening the panel is the request — nobody clicks Ahrefs to look at an empty
  // box. It re-runs only when the article has changed since last time.
  const openAhrefs = (next: boolean) => {
    setOpen(next ? 'ahrefs' : '')
    if (next && !keywordsLoading && researchedFor.current !== draft) void researchKeywords()
  }

  const runSurfer = async () => {
    if (!draft || pass.running) return
    const runId = await startSeoPass({
      article: draft,
      title,
      // Opportunities come back ranked, so the first is the one to target. With
      // it, this pass is Surfer only; without it the server works the keyword out.
      primaryKeyword: keywords[0]?.primaryKeyword || '',
      // Nothing to the chat — the panel is the report.
      onReport: () => {},
      // Below the threshold the rewrite is applied on the spot — being asked to
      // approve a rewrite you already asked for is a click for nothing. Above it
      // the draft is kept as written and only the run id is recorded.
      onArticle: (article, id, finished) => {
        const scored = finished.surferOptimization?.seoScoreBefore ?? null
        // A length correction is applied regardless of score: a draft that scored
        // 90 at 140% of Surfer's word target was still over-long.
        const rewrite = scored === null || scored <= REWRITE_AT_OR_BELOW || Boolean(finished.lengthCheck?.corrected)
        pipeline.update(rewrite ? { draft: article, runId: id } : { runId: id })
      },
    })
    if (runId) pipeline.update({ runId })
  }

  const publish = async () => {
    if (!draft || publishing) return
    setPublishing(true)
    setPublishError('')
    try {
      const next = await createContentPublishWordPressDraft({
        article: draft,
        images: pipeline.images,
        runId: pipeline.runId,
        title,
      })
      setPublished(next)
      pipeline.update({ runId: next.runId })
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : 'The article could not be sent to WordPress.')
    } finally {
      setPublishing(false)
    }
  }

  const optimisation = pass.run?.surferOptimization
  const lengthCheck = pass.run?.lengthCheck ?? null
  const gaps = pass.run ? termGaps(pass.run) : []
  const rating = rateArticle(draft, pipeline.images, pass.run)

  const ahrefsPanel = (
    <div className="article-tool-panel">
      {keywordsLoading ? (
        <div className="article-tool-empty">
          <Space direction="vertical" align="center" size={8}>
            <Spin />
            <Text type="secondary">Asking Ahrefs which keywords this article can win…</Text>
          </Space>
        </div>
      ) : keywordsError ? (
        <Alert type="error" showIcon message="Ahrefs" description={keywordsError} />
      ) : fixState.loading ? (
        <div className="article-tool-empty">
          <Space direction="vertical" align="center" size={8}>
            <Spin />
            <Text type="secondary">Working out where these keywords belong in the article…</Text>
          </Space>
        </div>
      ) : keywords.length ? (
        <>
          <Text type="secondary" className="article-tool-note">
            {fixState.fixes.length
              ? `${fixState.fixes.length} suggested edit${fixState.fixes.length === 1 ? '' : 's'} are in the article — accept or decline each one there.`
              : draft
                ? 'The article already places these keywords well — nothing to suggest.'
                : 'Write or open an article and these can be placed in it.'}
          </Text>
          <Text type="secondary" className="article-tool-note">Targeting, from Ahrefs:</Text>
          <ul className="article-tool-list">
            {keywords.map((entry) => (
              <li key={entry.id}>
                <span className="article-tool-term">{entry.primaryKeyword}</span>
                <span className="article-tool-meta">
                  {/* Ahrefs returning 0 across volume, difficulty AND position is
                      missing data, not a keyword with no demand — a rank of #0
                      does not exist. Showing it as a measurement invents
                      precision that is not there. */}
                  {entry.searchVolume ? <Tag>{entry.searchVolume.toLocaleString()}/mo</Tag> : null}
                  {entry.keywordDifficulty ? <Tag>KD {entry.keywordDifficulty}</Tag> : null}
                  {entry.currentPosition ? <Tag color="blue">#{entry.currentPosition}</Tag> : null}
                  {!entry.searchVolume && !entry.keywordDifficulty && !entry.currentPosition
                    ? <Text type="secondary" style={{ fontSize: 12 }}>no metrics returned</Text>
                    : null}
                </span>
                {entry.buyerIntent ? <span className="article-tool-sub">{entry.buyerIntent}</span> : null}
              </li>
            ))}
          </ul>
          {fixState.error ? <Alert type="error" showIcon message="Fixes" description={fixState.error} /> : null}
          <Space size={8}>
            <Button
              size="small"
              type="primary"
              disabled={!draft}
              loading={fixState.loading}
              onClick={() => { void requestArticleFixes(draft, keywords); setOpen('') }}
            >
              Suggest again
            </Button>
            <Button size="small" onClick={() => void researchKeywords()}>New keyword research</Button>
          </Space>

        </>
      ) : (
        <div className="article-tool-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Ahrefs returned no usable keywords for this article."
          />
          <Button size="small" onClick={() => void researchKeywords()}>Try again</Button>
        </div>
      )}
    </div>
  )

  const surferPanel = (
    <div className="article-tool-panel">
      {pass.running ? (
        <div className="article-tool-empty">
          <Space direction="vertical" align="center" size={8}>
            <Spin />
            <Text type="secondary">
              {pass.stage ? `Scoring the article against the SERP — ${pass.stage.replace(/_/g, ' ')}…` : 'Scoring the article against the SERP…'}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              This runs on the server — close this and keep working, it carries on.
            </Text>
            <Button size="small" danger onClick={() => void stopSeoPass()}>Stop the pass</Button>
          </Space>
        </div>
      ) : pass.error ? (
        <Alert type="error" showIcon message="Surfer" description={pass.error} />
      ) : optimisation ? (
        <>
          <div className="article-tool-score">
            <Text type="secondary">Overall rating</Text>
            <strong>{rating.overall ?? '—'}</strong>
          </div>
          <ul className="article-tool-rating">
            {rating.parts.map((part) => (
              <li key={part.key}>
                <span className="article-tool-rating-label">
                  {part.label}
                  <Text type="secondary" className="article-tool-sub">{part.detail}</Text>
                </span>
                <span className="article-tool-rating-score">
                  {part.key === 'seo' && optimisation.seoScoreBefore != null && optimisation.seoScoreAfter != null
                    ? <Text type="secondary">{optimisation.seoScoreBefore} → </Text>
                    : null}
                  {part.score ?? '—'}
                </span>
              </li>
            ))}
          </ul>
          <Text type="secondary" className="article-tool-note">
            Term coverage is Surfer's. Length and images are measured here — Surfer scores neither.
          </Text>
          {lengthCheck && lengthCheck.status !== 'unknown' ? (
            <Alert
              type={lengthCheck.ok ? 'success' : 'warning'}
              showIcon
              message={lengthCheck.ok
                ? `Length check passed — ${lengthCheck.words.toLocaleString()} words, inside Surfer's ${lengthCheck.min?.toLocaleString()}–${lengthCheck.max?.toLocaleString()} range${lengthCheck.corrected ? ' after correction' : ''}.`
                : `Length check — ${lengthCheck.words.toLocaleString()} words is ${Math.abs(lengthCheck.delta).toLocaleString()} ${lengthCheck.status === 'long' ? 'over' : 'under'} Surfer's ${lengthCheck.min?.toLocaleString()}–${lengthCheck.max?.toLocaleString()} range.`}
              description={lengthCheck.ok
                ? undefined
                : lengthCheck.status === 'long'
                  ? 'Hermes could not cut it to size within its pass budget. Ask it in the chat to trim the weakest sections, or run the pass again.'
                  : 'Hermes could not add enough honest coverage within its pass budget. Ask it in the chat to answer more of the searcher questions Surfer lists, or run the pass again.'}
            />
          ) : null}
          {gaps.length ? (
            <>
              <Text type="secondary" className="article-tool-note">Still below Surfer's target:</Text>
              <ul className="article-tool-list">
                {gaps.slice(0, 12).map((gap) => (
                  <li key={gap.term}>
                    <span className="article-tool-term">{gap.term}</span>
                    <span className="article-tool-meta">
                      <Tag>{gap.used} of {gap.max != null && gap.max !== gap.target ? `${gap.target}-${gap.max}` : gap.target}</Tag>
                      {gap.heading ? <Tag color="blue">heading</Tag> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {gaps.length > 12 ? (
                <Text type="secondary" className="article-tool-note">…and {gaps.length - 12} more below target.</Text>
              ) : null}
            </>
          ) : (
            <Text type="secondary" className="article-tool-note">Every priority term is at or above its target.</Text>
          )}
          <Text type="secondary" className="article-tool-note">
            {optimisation.seoScoreBefore != null && optimisation.seoScoreBefore > REWRITE_AT_OR_BELOW
              ? `Your draft scored ${optimisation.seoScoreBefore} — above ${REWRITE_AT_OR_BELOW}, so it was left as written.`
              : `Scored ${optimisation.seoScoreBefore ?? '—'} and rewritten to ${optimisation.seoScoreAfter ?? '—'}. The article in the panel is the rewrite.`}
          </Text>
          <Space size={8}>
            <Button
              size="small"
              type="primary"
              disabled={!draft || !pass.run}
              loading={fixState.loading}
              onClick={() => { if (pass.run) { void requestSurferFixes(draft, pass.run, gaps); setOpen('') } }}
            >
              Suggest fixes in the article
            </Button>
            <Button size="small" disabled={!draft} onClick={() => void runSurfer()}>Run again</Button>
            {optimisation.editorUrl ? (
              <Button size="small" type="link" href={optimisation.editorUrl} target="_blank" rel="noreferrer">
                Surfer editor
              </Button>
            ) : null}
          </Space>
        </>
      ) : (
        <div className="article-tool-empty">
          <Text type="secondary">
            {!draft
              ? 'Write or open an article first.'
              : keywords[0]?.primaryKeyword
                ? `Score this article against the pages ranking for “${keywords[0].primaryKeyword}”, and report what they cover that it does not.`
                : 'Score this article against the pages already ranking for it. Run Ahrefs first if you want to choose the keyword yourself — otherwise it is taken from the title.'}
          </Text>
          <Button size="small" type="primary" disabled={!draft} onClick={() => void runSurfer()}>
            Run the SEO pass
          </Button>
        </div>
      )}
    </div>
  )

  const wordpressPanel = (
    <div className="article-tool-panel">
      {publishError ? <Alert type="error" showIcon message="WordPress" description={publishError} /> : null}
      <div className="article-tool-empty">
        <Text type="secondary">
          {!draft
            ? 'Write or open an article first.'
            : published
              ? `“${published.title || title}” is on the site as a draft. A human publishes it there.`
              : `Send “${title}” to WordPress as a draft. Nothing goes live.`}
        </Text>
        <Space size={8}>
          <Button size="small" type="primary" disabled={!draft} loading={publishing} onClick={() => void publish()}>
            {published ? 'Update the draft' : 'Send to WordPress'}
          </Button>
          {published?.editorUrl ? (
            <Button size="small" href={published.editorUrl} target="_blank" rel="noreferrer">Open in WordPress</Button>
          ) : null}
        </Space>
      </div>
      <Text type="secondary" className="article-tool-note">Sitemap &amp; Google</Text>
      {sitemapError ? <Alert type="error" showIcon message="Sitemap" description={sitemapError} /> : null}
      {sitemapLoading && !sitemap ? (
        <Space size={8}><Spin size="small" /><Text type="secondary">Reading the live sitemap…</Text></Space>
      ) : sitemap ? (
        <ul className="article-tool-list">
          <li>
            <span className="article-tool-term">Sitemap</span>
            <span className="article-tool-meta">
              {sitemap.reachable
                ? <Tag color="green">{sitemap.totalUrls.toLocaleString()} URLs</Tag>
                : <Tag color="red">unreachable{sitemap.httpStatus ? ` (HTTP ${sitemap.httpStatus})` : ''}</Tag>}
              {sitemap.latestLastmod ? <Text type="secondary" style={{ fontSize: 12 }}>updated {new Date(sitemap.latestLastmod).toLocaleString()}</Text> : null}
            </span>
          </li>
          <li>
            <span className="article-tool-term">Google Search Console</span>
            <span className="article-tool-meta">
              {!sitemap.searchConsole.configured
                ? <Tag>not connected</Tag>
                : sitemap.searchConsole.error
                  ? <Tag color="red">error</Tag>
                  : sitemap.searchConsole.lastDownloaded
                    ? <Text type="secondary" style={{ fontSize: 12 }}>Google fetched it {new Date(sitemap.searchConsole.lastDownloaded).toLocaleString()}{sitemap.searchConsole.isPending ? ' · new fetch pending' : ''}</Text>
                    : <Tag>never submitted</Tag>}
            </span>
            {sitemap.searchConsole.error ? <span className="article-tool-sub">{sitemap.searchConsole.error}</span> : null}
          </li>
          <li>
            <span className="article-tool-term">Auto-check</span>
            <span className="article-tool-meta">
              {sitemap.watcher.enabled
                ? <Text type="secondary" style={{ fontSize: 12 }}>every {Math.round(sitemap.watcher.intervalMs / 60000)} min · {sitemap.watcher.lastResult || 'waiting for first check'}</Text>
                : <Tag>off</Tag>}
            </span>
          </li>
          {(sitemapResult || sitemap.recent[0]) ? (
            <li>
              <span className="article-tool-term">Last refresh</span>
              <span className="article-tool-sub">{sitemapResult?.summary || sitemap.recent[0]?.summary}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      <Space size={8}>
        <Button size="small" loading={sitemapRefreshing} onClick={() => void runSitemapRefresh()}>
          {published?.url ? 'Verify this post & notify Google' : 'Refresh sitemap & notify Google'}
        </Button>
        {sitemap?.sitemapUrl ? (
          <Button size="small" type="link" href={sitemap.sitemapUrl} target="_blank" rel="noreferrer">Open sitemap</Button>
        ) : null}
      </Space>
    </div>
  )

  const tools: Array<{ key: Tool; logo: string; label: string; panel: ReactNode; badge?: string }> = [
    { key: 'ahrefs', logo: ahrefsLogo, label: 'Ahrefs — keywords worth targeting', panel: ahrefsPanel },
    {
      key: 'surfer',
      logo: surferLogo,
      label: 'Surfer SEO — score and suggestions',
      panel: surferPanel,
      badge: rating.overall != null ? String(rating.overall) : undefined,
    },
    { key: 'wordpress', logo: wordpressLogo, label: 'WordPress — send this article to the site', panel: wordpressPanel },
  ]

  return (
    <>
      {tools.map((tool) => (
        <Popover
          key={tool.key}
          open={open === tool.key}
          onOpenChange={(next) => {
            if (tool.key === 'ahrefs') return openAhrefs(next)
            setOpen(next ? tool.key : '')
            if (next && tool.key === 'wordpress' && !sitemap && !sitemapLoading) void loadSitemap()
          }}
          trigger="click"
          placement="leftTop"
          title={tool.label}
          content={tool.panel}
        >
          <button type="button" className="chat-rail-toggle" aria-label={tool.label} title={tool.label}>
            <img src={tool.logo} alt="" aria-hidden="true" />
            {tool.badge ? <span className="article-tool-badge">{tool.badge}</span> : null}
          </button>
        </Popover>
      ))}
    </>
  )
}
