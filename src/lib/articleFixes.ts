import {
  proposeArticleKeywordFixes,
  proposeArticleSurferFixes,
  type ArticleKeywordFix,
  type ContentOperationsRun,
} from './api'

// The Ahrefs button and the article panel sit in different subtrees — the button
// is a rail tool inside the chat card, the panel is the aside beside it — so the
// proposed fixes are held here rather than passed down from a common parent that
// does not exist. Same shape as the SEO pass runner next door.
type Listener = () => void

export type ArticleFixState = {
  loading: boolean
  error: string
  // The article the fixes were proposed against. An edit is only offered while
  // the text it was written for is still the text on screen; editing the article
  // underneath a stale "find" is how you get a card that does nothing.
  article: string
  fixes: ArticleKeywordFix[]
}

let state: ArticleFixState = { loading: false, error: '', article: '', fixes: [] }
const listeners = new Set<Listener>()

function set(patch: Partial<ArticleFixState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getArticleFixes() {
  return state
}

export function subscribeArticleFixes(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function clearArticleFixes() {
  set({ loading: false, error: '', article: '', fixes: [] })
}

// Accepting and declining both remove the card. The difference is whether the
// article changes on the way out.
export function dismissArticleFix(id: string) {
  set({ fixes: state.fixes.filter((fix) => fix.id !== id) })
}

// Returns the edited article, or '' when the "find" no longer matches — the
// editor changed that passage since the fix was proposed, and applying it would
// either do nothing or hit the wrong place.
export function applyArticleFix(article: string, id: string) {
  const fix = state.fixes.find((entry) => entry.id === id)
  if (!fix) return ''
  const at = article.indexOf(fix.find)
  if (at < 0) return ''
  const next = article.slice(0, at) + fix.replace + article.slice(at + fix.find.length)
  // Every remaining card was written against the old text, so the anchor moves
  // with it. They are re-matched on render and any that no longer resolve are
  // dropped there rather than lingering as dead cards.
  set({ fixes: state.fixes.filter((entry) => entry.id !== id), article: next })
  return next
}

// Surfer's side: coverage rather than placement. Same store and the same inline
// cards, so the editor accepts or declines them exactly the same way.
export async function requestSurferFixes(
  article: string,
  run: ContentOperationsRun,
  gaps: Array<{ term: string; used: number; target: number; heading: boolean }>,
) {
  if (!article) return
  set({ loading: true, error: '', fixes: [], article })
  try {
    const { fixes } = await proposeArticleSurferFixes({
      article,
      guidelines: {
        targetWordCount: run.surferGuidelines?.targetWordCount ?? null,
        questions: run.surferGuidelines?.questions || [],
      },
      gaps,
    })
    set({ loading: false, fixes, article })
  } catch (cause) {
    set({
      loading: false,
      error: cause instanceof Error ? cause.message : 'The Surfer fixes could not be worked out.',
    })
  }
}

export async function requestArticleFixes(article: string, keywords: Array<{
  primaryKeyword: string
  searchVolume: number | null
  keywordDifficulty: number | null
  currentPosition: number | null
}>) {
  if (!article || !keywords.length) return
  set({ loading: true, error: '', fixes: [], article })
  try {
    const { fixes } = await proposeArticleKeywordFixes({
      article,
      keywords: keywords.map((entry) => ({
        keyword: entry.primaryKeyword,
        volume: entry.searchVolume,
        difficulty: entry.keywordDifficulty,
        position: entry.currentPosition,
      })),
    })
    set({ loading: false, fixes, article })
  } catch (cause) {
    set({
      loading: false,
      error: cause instanceof Error ? cause.message : 'The keyword fixes could not be worked out.',
    })
  }
}
