import { useCallback, useEffect, useState } from 'react'
import type { ArticleImage } from '../components/MarkdownArticle'

// The three phase pages are separate routes, so React state dies on every
// navigation. The working article is held here instead: written to storage and
// broadcast, so moving between Write, SEO and Publish carries the draft, its
// artwork and its run id along with it.
export type ContentPipelineState = {
  draft: string
  images: ArticleImage[]
  runId: string
  // Which stage the SEO pass is in, so the draft panel can show progress
  // instead of the article. Empty when nothing is running.
  seoStage: string
}

const KEY = 'tt-content-pipeline'
const EVENT = 'tt-content-pipeline-change'
const EMPTY: ContentPipelineState = { draft: '', images: [], runId: '', seoStage: '' }

function read(): ContentPipelineState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ContentPipelineState>
    return {
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
      images: Array.isArray(parsed.images) ? parsed.images : [],
      runId: typeof parsed.runId === 'string' ? parsed.runId : '',
      seoStage: typeof parsed.seoStage === 'string' ? parsed.seoStage : '',
    }
  } catch {
    return EMPTY
  }
}

function write(state: ContentPipelineState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // A full or blocked store must not take the page down; the draft simply
    // stops surviving navigation.
  }
  // 'storage' only fires in other tabs, so same-tab pages need their own signal.
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useContentPipeline() {
  const [state, setState] = useState<ContentPipelineState>(read)

  useEffect(() => {
    const sync = () => setState(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = useCallback((patch: Partial<ContentPipelineState>) => {
    const next = { ...read(), ...patch }
    write(next)
    setState(next)
  }, [])

  const reset = useCallback(() => {
    write(EMPTY)
    setState(EMPTY)
  }, [])

  return { ...state, update, reset }
}
