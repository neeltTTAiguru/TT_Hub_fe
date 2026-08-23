import { Typography } from 'antd'

const { Text } = Typography

// The stages the pass actually runs, in order. Anything the backend reports that
// is not in this list is ignored rather than shown as an unexplained step.
const STAGES = [
  ['opportunity_research', 'Ahrefs', 'Search volume and difficulty'],
  ['surfer_setup', 'SurferSEO', 'Building SERP guidelines'],
  ['content_optimization', 'Rewrite', 'Scoring and revising'],
] as const

function positionOf(stage: string) {
  const index = STAGES.findIndex(([key]) => key === stage)
  return index < 0 ? 0 : index
}

export default function SeoProgress({ stage, error }: { stage: string; error?: string }) {
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
              <div className={`seo-progress-step seo-progress-${state}`}>
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
        The article comes back here when the pass finishes. You can leave this page — it keeps running.
      </p>
    </div>
  )
}
