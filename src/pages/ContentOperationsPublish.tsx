import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'
import FieldGuideArticle, { draftTitle } from '../components/content/FieldGuideArticle'
import StageProgress from '../components/content/StageProgress'
import { useContentPipeline } from '../lib/contentPipeline'
import {
  createContentPublishWordPressDraft,
  getContentPublishState,
  type ContentPublishState,
} from '../lib/api'

const { Text } = Typography

// One HTTP call does the work, so these are the two states it genuinely has —
// not a fake breakdown of a request nobody can see inside.
const PUBLISH_STAGES = [
  {
    key: 'building',
    label: 'Publishing to WordPress',
    detail: 'Sending the article, its artwork and its meta to the site',
  },
  {
    key: 'ready',
    label: 'Ready in WordPress',
    detail: 'Sitting as a draft, waiting for you to review it and press Publish there',
  },
]

// WordPress. No chat here — the only thing this does is send the article in the
// pipeline to the site and get out of the way. A human publishes; the Hub never
// puts anything on the blog itself.
export default function ContentOperationsPublish() {
  const pipeline = useContentPipeline()
  const [state, setState] = useState<ContentPublishState | null>(null)
  // '' while reading the article — the steps take the page only once the button
  // is pressed, and stay up afterwards as the confirmation.
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const rehydrated = useRef('')

  const draft = pipeline.draft

  // A reload loses the button's state but not the run behind it, so an existing
  // draft is looked up rather than made a second time.
  useEffect(() => {
    const runId = pipeline.runId
    if (!runId || rehydrated.current === runId) return
    rehydrated.current = runId
    void getContentPublishState(runId)
      .then((next) => { if (next.postId) setState(next) })
      // A run with no WordPress draft yet is the normal case here, not a failure.
      .catch(() => {})
  }, [pipeline.runId])

  const publishToWordPress = async () => {
    if (!draft) return
    setStage('building')
    setError('')
    try {
      const next = await createContentPublishWordPressDraft({
        article: draft,
        images: pipeline.images,
        runId: pipeline.runId,
        title: draftTitle(draft),
      })
      setState(next)
      rehydrated.current = next.runId
      pipeline.update({ runId: next.runId })
      setStage('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The article could not be sent to WordPress.')
    }
  }

  if (!draft) {
    return (
      <div className="page page-chat-full publish-page">
        <div className="draft-panel-empty">
          <Space direction="vertical" align="center" size={8}>
            <Text type="secondary">There is no article to publish yet.</Text>
            <Link to="/assistants/content-operations">Write one</Link>
          </Space>
        </div>
      </div>
    )
  }

  // The steps take the page while the article goes up, and stay afterwards as the
  // confirmation — the last box is where the link into WordPress lives.
  if (stage) {
    return (
      <div className="page page-chat-full publish-page">
        <StageProgress
          stages={PUBLISH_STAGES}
          current={stage}
          error={error}
          note={error
            ? 'The article on the site is unchanged. Nothing was published.'
            : stage === 'ready'
              ? `“${state?.title || draftTitle(draft)}” is in WordPress as a draft. Open it there to review and publish.`
              : 'This takes a moment — the artwork is uploaded with it.'}
          action={(
            <Space size={8}>
              {state?.editorUrl && !error ? (
                <Button type="primary" href={state.editorUrl} target="_blank" rel="noreferrer">
                  Open in WordPress
                </Button>
              ) : null}
              <Button onClick={() => { setStage(''); setError('') }}>
                {error ? 'Back to the article' : 'Done'}
              </Button>
            </Space>
          )}
        />
      </div>
    )
  }

  return (
    <div className="page page-chat-full publish-page">
      <article className="draft-panel publish-page-article" aria-label="Article to publish">
        <div className="draft-panel-toolbar">
          <span className="draft-panel-title">
            <Text strong ellipsis>{draftTitle(draft)}</Text>
            <Text type="secondary" className="draft-panel-kind">MD</Text>
          </span>
          <Space size={8}>
            {state?.editorUrl ? (
              <Button size="small" href={state.editorUrl} target="_blank" rel="noreferrer">
                Open in WordPress
              </Button>
            ) : null}
            <Button size="small" type="primary" onClick={() => void publishToWordPress()}>
              {state?.postId ? 'Update in WordPress' : 'Publish to WordPress'}
            </Button>
          </Space>
        </div>
        <div className="draft-panel-body">
          {error ? (
            <Alert type="error" showIcon message="WordPress" description={error} style={{ margin: '0 40px 16px' }} />
          ) : null}
          <FieldGuideArticle markdown={draft} images={pipeline.images} />
        </div>
      </article>
    </div>
  )
}
