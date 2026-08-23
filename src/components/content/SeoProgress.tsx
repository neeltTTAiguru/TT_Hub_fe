import { Typography } from 'antd'

const { Text } = Typography

// The stages the pass actually runs, in order. Anything the backend reports that
// is not in this list is ignored rather than shown as an unexplained step.
const STAGES = [
  ['opportunity_research', 'Ahrefs', 'Checking search volume and difficulty for the target keyword.'],
  ['surfer_setup', 'SurferSEO guidelines', 'Analysing the live search results to build term and length targets. This is the slow part — it can take several minutes.'],
  ['content_optimization', 'Rewrite and score', 'Scoring the draft, revising it toward the guidelines, and scoring again.'],
] as const

function positionOf(stage: string) {
  const index = STAGES.findIndex(([key]) => key === stage)
  return index < 0 ? 0 : index
}

export default function SeoProgress({ stage, error }: { stage: string; error?: string }) {
  const current = positionOf(stage)
  return (
    <div className="seo-progress">
      <p className="tt-eyebrow">Ahrefs &nbsp;•&nbsp; SurferSEO pass</p>
      {STAGES.map(([key, label, detail], index) => {
        const state = error && index === current
          ? 'error'
          : index < current ? 'done' : index === current ? 'active' : 'waiting'
        return (
          <section key={key} className={`seo-progress-step seo-progress-${state}`}>
            <span className="seo-progress-mark" aria-hidden="true">
              {state === 'done' ? '✓' : state === 'error' ? '!' : index + 1}
            </span>
            <div>
              <Text strong>{label}</Text>
              <p>{state === 'error' ? error : detail}</p>
            </div>
          </section>
        )
      })}
      <p className="seo-progress-note">
        The article comes back here when the pass finishes. You can leave this page — it keeps running.
      </p>
    </div>
  )
}
