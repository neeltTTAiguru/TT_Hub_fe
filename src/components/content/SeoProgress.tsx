import { Button, Typography } from 'antd'

const { Text } = Typography

const STAGES = [
  ['opportunity_research', 'Ahrefs', 'Search volume and difficulty'],
  ['surfer_setup', 'SurferSEO', 'Building SERP guidelines'],
  ['content_optimization', 'Rewrite', 'Scoring and revising'],
] as const

function positionOf(stage: string) {
  const index = STAGES.findIndex(([key]) => key === stage)
  return index < 0 ? 0 : index
}

// Takes the whole page while the pass runs: the article is being rewritten and
// the chat has nothing to act on until it comes back.
export default function SeoProgress({
  stage,
  error,
  onStop,
}: {
  stage: string
  error?: string
  onStop: () => void
}) {
  const current = positionOf(stage)
  return (
    <div className="seo-progress">
      <div className="seo-progress-track">
        {STAGES.map(([key, label, detail], index) => {
          const state = error && index === current
            ? 'error'
            : index < current ? 'done' : index === current ? 'active' : 'waiting'
          return (
            <div className="seo-progress-node" key={key}>
              {index > 0 ? <span className="seo-progress-arrow" aria-hidden="true" /> : null}
              <div
                className={`seo-progress-step seo-progress-${state}`}
                // Staggered so the three boxes lift in turn rather than together.
                style={{ animationDelay: `${index * 0.8}s` }}
              >
                <span className="seo-progress-circle" aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'error' ? '!' : index + 1}
                </span>
                <Text strong className="seo-progress-label">{label}</Text>
                <span className="seo-progress-detail">{state === 'error' ? error : detail}</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="seo-progress-note">
        The article and the conversation come back when the pass finishes. It keeps running if you
        leave this page.
      </p>
      <Button danger onClick={onStop}>Stop the pass</Button>
    </div>
  )
}
