import { Button, Space, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { getSeoPassState, startSeoPass, subscribeSeoPass } from '../../lib/seoPassRunner'
import { useContentPipeline } from '../../lib/contentPipeline'
import type { ChatApi } from './ArticleWorkspace'

// The button only starts the pass and shows the last score. The run itself lives
// at module scope, so it survives this component being unmounted when the
// progress view takes the page.
export default function SeoPassAction({ chat }: { chat: ChatApi }) {
  const pipeline = useContentPipeline()
  const [pass, setPass] = useState(getSeoPassState)

  useEffect(() => {
    const unsubscribe = subscribeSeoPass(() => setPass(getSeoPassState()))
    return () => { unsubscribe() }
  }, [])

  const start = async () => {
    if (!pipeline.draft) return
    const runId = await startSeoPass({
      article: pipeline.draft,
      title: pipeline.draft.match(/^#\s+(.+)$/m)?.[1]?.trim() || '',
      onReport: (message) => chat.appendAssistantMessage(message),
      onArticle: (article, id) => pipeline.update({ draft: article, runId: id }),
    })
    if (runId) pipeline.update({ runId })
  }

  const before = pass.run?.surferOptimization?.seoScoreBefore
  const after = pass.run?.surferOptimization?.seoScoreAfter

  return (
    <Space size={8} align="center">
      {after != null ? (
        <Tag color="blue">Surfer {before != null ? `${before} → ` : ''}{after}</Tag>
      ) : null}
      <Button size="small" type="primary" loading={pass.running} onClick={() => void start()}>
        {after != null ? 'Run again' : 'Run Ahrefs + Surfer pass'}
      </Button>
    </Space>
  )
}
