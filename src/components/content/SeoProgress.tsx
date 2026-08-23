import StageProgress from './StageProgress'

const STAGES = [
  { key: 'opportunity_research', label: 'Ahrefs', detail: 'Search volume and difficulty' },
  { key: 'surfer_setup', label: 'SurferSEO', detail: 'Building SERP guidelines' },
  { key: 'content_optimization', label: 'Rewrite', detail: 'Scoring and revising to the word target' },
]

export default function SeoProgress({
  stage,
  error,
  onStop,
}: {
  stage: string
  error?: string
  onStop: () => void
}) {
  return (
    <StageProgress
      stages={STAGES}
      current={stage}
      error={error}
      note="The article and the conversation come back when the pass finishes. It keeps running if you leave this page."
      onStop={onStop}
      stopLabel="Stop the pass"
    />
  )
}
