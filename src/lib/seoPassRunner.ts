import {
  getContentOperationsRun,
  startContentOperationsSeoPass,
  stopContentOperationsRun,
  type ContentOperationsRun,
} from './api'

// The pass outlives whatever is on screen. While it runs the chat is unmounted,
// so a poller owned by a component would be torn down with it and the run would
// carry on server-side with nothing watching. This lives at module scope.
const POLL_MS = 6000

type Listener = () => void
type Report = (message: string) => void

export type SeoPassState = {
  running: boolean
  stage: string
  run: ContentOperationsRun | null
  error: string
}

let state: SeoPassState = { running: false, stage: '', run: null, error: '' }
let timer: number | null = null
let activeRunId = ''
let report: Report = () => {}
let onArticle: (article: string, runId: string) => void = () => {}
const listeners = new Set<Listener>()

function set(patch: Partial<SeoPassState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getSeoPassState() {
  return state
}

export function subscribeSeoPass(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function clearTimer() {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}

function poll(runId: string) {
  timer = window.setTimeout(async () => {
    try {
      const next = await getContentOperationsRun(runId)
      set({ run: next, stage: next.currentStage || '' })
      if (next.status === 'running' || next.status === 'ready') return poll(runId)

      clearTimer()
      set({ running: false, stage: '' })
      if (next.status === 'stopped') {
        report('**SEO pass stopped.** The article is unchanged.')
        return
      }
      if (next.status === 'error') {
        const why = next.errors?.[next.errors.length - 1] || 'The SEO pass failed.'
        set({ error: why })
        report(`**SurferSEO pass failed**\n\n${why}\n\nThe article on the left is unchanged.`)
        return
      }
      if (next.article) onArticle(next.article, runId)
      report(summarise(next))
    } catch (cause) {
      clearTimer()
      const why = cause instanceof Error ? cause.message : 'Lost contact with the SEO pass.'
      set({ running: false, stage: '', error: why })
      report(`**SEO pass interrupted**\n\n${why}`)
    }
  }, POLL_MS)
}

export function summarise(run: ContentOperationsRun) {
  const o = run.surferOptimization
  const lines: string[] = ['**SurferSEO pass complete**', '']
  if (o?.seoScoreBefore != null || o?.seoScoreAfter != null) {
    lines.push(`- Content score: **${o?.seoScoreBefore ?? '—'} → ${o?.seoScoreAfter ?? '—'}**`)
  }
  if (o?.targetScore != null) lines.push(`- Target ${o.targetScore}: ${o.targetMet ? 'met' : 'not reached'}`)
  if (o?.aiSearchScore != null) lines.push(`- AI search score: ${o.aiSearchScore}`)
  if (o?.passes) lines.push(`- Revision passes: ${o.passes}`)
  if (o?.notes) lines.push('', o.notes)
  for (const stage of run.stages || []) {
    if (stage.stage === 'opportunity_research' && stage.explanation) {
      lines.push('', '**Ahrefs**', stage.explanation)
    }
    if (stage.stage === 'content_optimization' && stage.explanation) lines.push('', `_${stage.explanation}_`)
  }
  if (o?.editorUrl) lines.push('', `[Open the Surfer editor](${o.editorUrl})`)
  lines.push('', 'The article on the left is the revised version. Tell me what to change if any of it reads wrong.')
  return lines.join('\n')
}

export async function startSeoPass(options: {
  article: string
  title: string
  onReport: Report
  onArticle: (article: string, runId: string) => void
}) {
  report = options.onReport
  onArticle = options.onArticle
  set({ running: true, stage: 'opportunity_research', run: null, error: '' })
  try {
    const { runId } = await startContentOperationsSeoPass({
      article: options.article,
      title: options.title,
    })
    activeRunId = runId
    poll(runId)
    return runId
  } catch (cause) {
    set({ running: false, stage: '', error: cause instanceof Error ? cause.message : 'The SEO pass could not be started.' })
    return ''
  }
}

export async function stopSeoPass() {
  clearTimer()
  set({ running: false, stage: '' })
  if (!activeRunId) return
  try {
    await stopContentOperationsRun(activeRunId)
    report('**SEO pass stopped.** The article is unchanged.')
  } catch {
    // The run may have finished between the click and the request; nothing to do.
  }
}
