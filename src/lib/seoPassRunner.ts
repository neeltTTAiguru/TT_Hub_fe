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
let onArticle: (article: string, runId: string, run: ContentOperationsRun) => void = () => {}
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
      if (next.article) onArticle(next.article, runId, next)
      report(summarise(next))
    } catch (cause) {
      clearTimer()
      const why = cause instanceof Error ? cause.message : 'Lost contact with the SEO pass.'
      set({ running: false, stage: '', error: why })
      report(`**SEO pass interrupted**\n\n${why}`)
    }
  }, POLL_MS)
}

// How many times a term actually appears, matched whole-word and case-insensitively
// so "camera" does not score itself inside "cameras" the way a bare substring
// search would.
function countTerm(article: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (article.match(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'gi')) || []).length
}

// Surfer returns the terms the top-ranking pages use and how often. Comparing
// that against the article gives a concrete worklist — "say this three more
// times, and once in a heading" — instead of a bare score with nothing to act on.
const SUGGESTION_LIMIT = 12

export type TermGap = {
  term: string
  used: number
  target: number
  max: number | null
  heading: boolean
  shortfall: number
}

// Shared by the Surfer panel and the chat report so the two can never disagree
// about what still needs work.
export function termGaps(run: ContentOperationsRun): TermGap[] {
  const article = String(run.article || '')
  const terms = run.surferGuidelines?.terms || []
  if (!article || !terms.length) return []
  return terms
    .map((entry) => {
      const target = entry.min ?? entry.max ?? 0
      const used = countTerm(article, entry.term)
      return { term: entry.term, used, target, max: entry.max, heading: entry.heading, shortfall: target - used }
    })
    .filter((entry) => entry.shortfall > 0)
    .sort((a, b) => b.shortfall - a.shortfall)
}

function suggestions(run: ContentOperationsRun) {
  const short = termGaps(run)
  if (!short.length) return []
  const lines = short.slice(0, SUGGESTION_LIMIT).map((entry) => {
    const range = entry.max != null && entry.max !== entry.target ? `${entry.target}-${entry.max}` : `${entry.target}`
    return `- **${entry.term}** — used ${entry.used}${entry.used ? '' : ' (not in the article)'}, Surfer wants ${range}${entry.heading ? ' · works as a heading' : ''}`
  })
  // Never quietly cut the list off — a short list reads as "that is everything".
  if (short.length > SUGGESTION_LIMIT) {
    lines.push(`- …and ${short.length - SUGGESTION_LIMIT} more term(s) below target.`)
  }
  return lines
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
  const words = String(run.article || '').trim().split(/\s+/).filter(Boolean).length
  const target = (run as { surferGuidelines?: { targetWordCount?: number } }).surferGuidelines?.targetWordCount
  if (words) lines.push(`- Length: ${words.toLocaleString()} words${target ? ` against a Surfer target of ${target.toLocaleString()}` : ''}`)
  if (o?.notes) lines.push('', o.notes)
  for (const stage of run.stages || []) {
    if (stage.stage === 'surfer_setup' && stage.explanation?.includes('words against')) {
      lines.push('', `_${stage.explanation}_`)
    }
    if (stage.stage === 'opportunity_research' && stage.explanation) {
      lines.push('', '**Ahrefs**', stage.explanation)
    }
    if (stage.stage === 'content_optimization' && stage.explanation) lines.push('', `_${stage.explanation}_`)
  }
  const improvements = suggestions(run)
  if (improvements.length) {
    lines.push('', '**Still worth improving**', ...improvements)
  } else if (run.surferGuidelines?.terms?.length) {
    lines.push('', '**Every Surfer priority term is at or above its target.**')
  }
  if (o?.editorUrl) lines.push('', `[Open the Surfer editor](${o.editorUrl})`)
  lines.push('', 'The article on the left is the revised version. Tell me which of these to work in and I will do it.')
  return lines.join('\n')
}

export async function startSeoPass(options: {
  article: string
  title: string
  // The keyword Ahrefs already settled on. Passing it makes this a pure Surfer
  // pass — the server skips its own Ahrefs check, which is a duplicate of what
  // the Ahrefs control just did and costs a Hermes round trip before Surfer even
  // starts. Left empty, the server guesses from the title and checks it.
  primaryKeyword?: string
  onReport: Report
  onArticle: (article: string, runId: string, run: ContentOperationsRun) => void
}) {
  report = options.onReport
  onArticle = options.onArticle
  set({ running: true, stage: 'opportunity_research', run: null, error: '' })
  try {
    const { runId } = await startContentOperationsSeoPass({
      article: options.article,
      title: options.title,
      primaryKeyword: options.primaryKeyword || '',
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
