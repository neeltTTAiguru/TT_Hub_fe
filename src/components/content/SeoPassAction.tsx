import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Tag, Typography, message } from 'antd'
import {
  getContentOperationsRun,
  startContentOperationsSeoPass,
  type ContentOperationsRun,
} from '../../lib/api'
import { useContentPipeline } from '../../lib/contentPipeline'

const { Text } = Typography

// Surfer builds SERP guidelines by analysing the live results, which takes
// minutes. The pass therefore runs server-side and is polled, rather than held
// open on one request that would time out.
const POLL_MS = 6000

export default function SeoPassAction() {
  const pipeline = useContentPipeline()
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [run, setRun] = useState<ContentOperationsRun | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<number | null>(null)

  // A poll outliving its component keeps writing to unmounted state and keeps
  // hitting the backend after the user has moved to another phase.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const poll = (runId: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        const next = await getContentOperationsRun(runId)
        setRun(next)
        setStage(next.currentStage || '')
        if (next.status === 'running' || next.status === 'ready') return poll(runId)

        setRunning(false)
        if (next.status === 'error') {
          setError(next.errors?.[next.errors.length - 1] || 'The SEO pass failed.')
          return
        }
        // The optimised article replaces the draft, so every later phase — and
        // the Write page if you go back — works on the improved version.
        if (next.article) pipeline.update({ draft: next.article, runId })
        const after = next.surferOptimization?.seoScoreAfter
        message.success(after != null ? `Surfer score ${after}` : 'SEO pass complete')
      } catch (cause) {
        setRunning(false)
        setError(cause instanceof Error ? cause.message : 'Lost contact with the SEO pass.')
      }
    }, POLL_MS)
  }

  const start = async () => {
    if (!pipeline.draft) {
      message.warning('Write an article first.')
      return
    }
    setRunning(true)
    setError('')
    setRun(null)
    setStage('surfer_setup')
    try {
      const { runId } = await startContentOperationsSeoPass({
        article: pipeline.draft,
        title: pipeline.draft.match(/^#\s+(.+)$/m)?.[1]?.trim() || '',
      })
      pipeline.update({ runId })
      poll(runId)
    } catch (cause) {
      setRunning(false)
      setError(cause instanceof Error ? cause.message : 'The SEO pass could not be started.')
    }
  }

  const before = run?.surferOptimization?.seoScoreBefore
  const after = run?.surferOptimization?.seoScoreAfter

  return (
    <Space size={8} align="center">
      {error ? (
        <Alert type="error" showIcon message={error} style={{ padding: '2px 8px' }} />
      ) : null}
      {after != null ? (
        <Tag color="blue">Surfer {before != null ? `${before} → ` : ''}{after}</Tag>
      ) : null}
      {running ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {stage === 'content_optimization' ? 'Scoring and revising…' : 'Building Surfer guidelines…'}
        </Text>
      ) : null}
      <Button size="small" type="primary" loading={running} onClick={() => void start()}>
        {after != null ? 'Run again' : 'Run Ahrefs + Surfer pass'}
      </Button>
    </Space>
  )
}
