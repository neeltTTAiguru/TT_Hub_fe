import { useState } from 'react'
import { Button, Divider, Empty, List, Popover, Progress, Space, Tag, Typography, message } from 'antd'
import {
  downloadRunWorkbook,
  stopResearchRun,
  type ResearchRunState,
  type ResearchRunSummary,
} from '../lib/api'
import { TRAVELLER_SPRITE, travellerSvg } from './travellerSprite'

const { Text } = Typography

const STATUS: Record<ResearchRunSummary['status'], { label: string; color: string }> = {
  running: { label: 'Running', color: 'processing' },
  stopping: { label: 'Stopping', color: 'warning' },
  done: { label: 'Finished', color: 'success' },
  stopped: { label: 'Stopped', color: 'default' },
  failed: { label: 'Failed', color: 'error' },
}

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

/**
 * The runs menu that sits on the map.
 *
 * Every run there has been, newest first, each with what it found and a way to
 * open its results on screen. Full-access accounts also get the spreadsheet,
 * Stop on a live run, and "Create new run"; everyone else reads. The menu is
 * the only research UI on the page - the form itself appears on demand.
 */
export default function ResearchRunMenu({
  runs,
  active,
  canRun,
  onCreate,
  onView,
  onChanged,
}: {
  runs: ResearchRunSummary[]
  /** The run in progress, polled by the page - fresher than the list. */
  active: ResearchRunState | null
  canRun: boolean
  onCreate: () => void
  onView: (runId: string) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const isLive = active?.status === 'running' || active?.status === 'stopping'

  const download = (runId: string) => {
    setDownloading(runId)
    downloadRunWorkbook(runId)
      .then((name) => message.success(`Downloaded ${name}`))
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not build the spreadsheet.')
      })
      .finally(() => setDownloading(null))
  }

  const stop = () => {
    stopResearchRun()
      .then(() => {
        message.success('Stopping after this agency.')
        onChanged()
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not stop the run.')
      })
  }

  // The live run's numbers come from the poll, so the menu moves while a run is going.
  const rows = runs.map((run) => (active && run.id === active.id ? { ...run, ...active } : run))

  const content = (
    <div style={{ width: 380, maxHeight: 'min(520px, 70vh)', overflowY: 'auto' }}>
      {canRun ? (
        <>
          <Button type="primary" block onClick={() => { setOpen(false); onCreate() }} disabled={isLive}>
            Create new run
          </Button>
          {isLive ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              A run is already going. Stop it before starting another.
            </Text>
          ) : null}
          <Divider style={{ margin: '12px 0' }} />
        </>
      ) : null}

      {rows.length ? (
        <List
          size="small"
          dataSource={rows}
          renderItem={(run) => {
            const live = run.status === 'running' || run.status === 'stopping'
            const visited = run.completed + run.failed
            return (
              <List.Item key={run.id} style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap size={8} align="center">
                    <Tag color={STATUS[run.status]?.color}>{STATUS[run.status]?.label || run.status}</Tag>
                    <Text strong>{when(run.startedAt)}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {visited.toLocaleString()} of {run.total.toLocaleString()}
                    </Text>
                  </Space>
                  {live ? (
                    <Progress
                      percent={run.total ? Math.round((visited / run.total) * 100) : 0}
                      size="small"
                      status="active"
                    />
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {run.filtersLabel || 'All agencies'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {run.foundCameras.toLocaleString()} cameras, {run.foundPhones.toLocaleString()}{' '}
                    phones, {run.foundEmails.toLocaleString()} emails
                    {run.failed ? ` - ${run.failed.toLocaleString()} failed` : ''}
                  </Text>
                  <Space wrap size={6}>
                    <Button size="small" onClick={() => { setOpen(false); onView(run.id) }}>
                      View results
                    </Button>
                    {canRun ? (
                      <Button
                        size="small"
                        loading={downloading === run.id}
                        onClick={() => download(run.id)}
                      >
                        Download
                      </Button>
                    ) : null}
                    {canRun && live ? (
                      <Button size="small" danger onClick={stop}>
                        Stop
                      </Button>
                    ) : null}
                  </Space>
                </Space>
              </List.Item>
            )
          }}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={canRun ? 'No runs yet.' : 'No research run has happened yet.'}
        />
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      title="Research runs"
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
    >
      <Button
        style={{ position: 'absolute', top: 10, left: 54, zIndex: 1000 }}
        icon={
          <span
            aria-hidden
            style={{ display: 'inline-block', lineHeight: 0, verticalAlign: 'middle' }}
            dangerouslySetInnerHTML={{ __html: travellerSvg(16, TRAVELLER_SPRITE, false) }}
          />
        }
      >
        Research runs{isLive ? ' - running' : ''}
      </Button>
    </Popover>
  )
}
