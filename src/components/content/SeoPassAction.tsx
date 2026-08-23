import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Tag, Typography, message } from 'antd'
import {
  getContentOperationsRun,
  startContentOperationsSeoPass,
  type ContentOperationsRun,
} from '../../lib/api'
import { useContentPipeline } from '../../lib/contentPipeline'
import type { ChatApi } from './ArticleWorkspace'

const { Text } = Typography

// Surfer builds SERP guidelines by analysing the live results, which takes
// minutes. The pass therefore runs server-side and is polled, rather than held
// open on one request that would time out.
const POLL_MS = 6000

// Everything Surfer reported, written as prose. The score alone does not tell
// you what changed, and a toolbar tag cannot hold the detail.
function summarise(run: ContentOperationsRun) {
  const o = run.surferOptimization
  const lines: string[] = ['**SurferSEO pass complete**', '']
  if (o?.seoScoreBefore != null || o?.seoScoreAfter != null) {
    lines.push(`- Content score: **${o?.seoScoreBefore ?? '—'} → ${o?.seoScoreAfter ?? '—'}**`)
  }
  if (o?.targetScore != null) {
    lines.push(`- Target ${o.targetScore}: ${o.targetMet ? 'met' : 'not reached'}`)
  }
  if (o?.aiSearchScore != null) lines.push(`- AI search score: ${o.aiSearchScore}`)
  if (o?.passes) lines.push(`- Revision passes: ${o.passes}`)
  if (o?.scoreFloor != null) {
    lines.push(`- Score floor ${o.scoreFloor}: ${o.floorMet ? 'held' : 'not held'}`)
  }
  if (o?.notes) lines.push('', o.notes)

  // The stage records carry Surfer's own explanation of what it did.
  const stages = (run.stages || []).filter((stage) => stage.stage === 'content_optimization' || stage.stage === 'surfer_setup')
  for (const stage of stages) {
    if (stage.explanation) lines.push('', `_${stage.explanation}_`)
  }
  if (o?.editorUrl) lines.push('', `[Open the Surfer editor](${o.editorUrl})`)
  lines.push('', 'The article on the left is the revised version. Tell me what to change if any of it reads wrong.')
  return lines.join('\n')
}

export default function SeoPassAction({ chat }: { chat: ChatApi }) {
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
          const why = next.errors?.[next.errors.length - 1] || 'The SEO pass failed.'
          setError(why)
          chat.appendAssistantMessage(`**SurferSEO pass failed**\n\n${why}\n\nThe article on the left is unchanged.`)
          return
        }
        // The optimised article replaces the draft, so every later phase — and
        // the Write page if you go back — works on the improved version.
        if (next.article) pipeline.update({ draft: next.article, runId })
        // The run's own report goes into the conversation, where there is room
        // for it and where the next instruction will be given.
        chat.appendAssistantMessage(summarise(next))
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
