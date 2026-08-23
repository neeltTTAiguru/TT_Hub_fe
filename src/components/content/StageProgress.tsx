import { Button, Typography } from 'antd'

const { Text } = Typography

export type Stage = { key: string; label: string; detail: string }

// Shared by both phases: three boxes across the page, joined by arrows, lifting
// in turn. The page belongs to this while work is running, because the article
// is mid-change and the conversation has nothing to act on until it settles.
export default function StageProgress({
  stages,
  current,
  error,
  note,
  onStop,
  stopLabel = 'Stop',
}: {
  stages: Stage[]
  current: string
  error?: string
  note: string
  onStop?: () => void
  stopLabel?: string
}) {
  const index = Math.max(0, stages.findIndex((stage) => stage.key === current))
  return (
    <div className="seo-progress">
      <div className="seo-progress-track">
        {stages.map((stage, position) => {
          const state = error && position === index
            ? 'error'
            : position < index ? 'done' : position === index ? 'active' : 'waiting'
          return (
            <div className="seo-progress-node" key={stage.key}>
              {position > 0 ? <span className="seo-progress-arrow" aria-hidden="true" /> : null}
              <div
                className={`seo-progress-step seo-progress-${state}`}
                style={{ animationDelay: `${position * 0.8}s` }}
              >
                <span className="seo-progress-circle" aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'error' ? '!' : position + 1}
                </span>
                <Text strong className="seo-progress-label">{stage.label}</Text>
                <span className="seo-progress-detail">{state === 'error' ? error : stage.detail}</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="seo-progress-note">{note}</p>
      {onStop ? <Button danger onClick={onStop}>{stopLabel}</Button> : null}
    </div>
  )
}
