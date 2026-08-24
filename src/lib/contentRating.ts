import type { ArticleImage } from '../components/MarkdownArticle'
import type { ContentOperationsRun } from './api'

// Surfer's content score only measures term coverage. An article can score well
// and still be half the length the ranking pages are, with no artwork on it —
// both of which matter and neither of which moves that number. This is the
// composite: Surfer's score is one input of three, not the verdict.
//
// Only `seo` comes from Surfer. Length and images are measured here against
// Surfer's word target and the house artwork standard, so the overall figure is
// ours and is presented as ours.

// One featured image and two inline, which is what the artwork pipeline plans
// and what the WordPress renderer places. Used when Surfer has no image data of
// its own — which, for this workspace, is always: it baselines its guidelines on
// word count and returns img_count as a flat zero.
const HOUSE_IMAGE_TARGET = 3

// Weights. Term coverage is the largest single factor because it is the one
// measured against the live SERP, but it is not allowed to be the whole story.
const WEIGHTS = { seo: 0.6, length: 0.25, images: 0.15 }

export type RatingPart = {
  key: 'seo' | 'length' | 'images'
  label: string
  score: number | null
  detail: string
}

export type ContentRating = {
  overall: number | null
  parts: RatingPart[]
}

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length
}

// Full marks from the target up to a quarter over it — the ranking set is an
// average, not a ceiling, and a slightly longer piece is not worse. Past that it
// falls away, because at some point long stops meaning thorough and starts
// meaning padded.
function lengthScore(words: number, target: number) {
  const ratio = words / target
  if (ratio >= 1 && ratio <= 1.25) return 100
  if (ratio > 1.25) return Math.max(50, 100 - Math.round((ratio - 1.25) * 100))
  return Math.round(ratio * 100)
}

export function rateArticle(
  markdown: string,
  images: ArticleImage[],
  run: ContentOperationsRun | null,
): ContentRating {
  const parts: RatingPart[] = []

  const seo = run?.surferOptimization?.seoScoreAfter ?? run?.surferOptimization?.seoScoreBefore ?? null
  parts.push({
    key: 'seo',
    label: 'Term coverage',
    score: seo,
    detail: seo == null ? 'Run the Surfer pass to score this' : 'From Surfer, against the ranking pages',
  })

  const words = wordCount(markdown)
  const target = run?.surferGuidelines?.targetWordCount ?? null
  parts.push({
    key: 'length',
    label: 'Length',
    score: target ? lengthScore(words, target) : null,
    detail: target
      ? `${words.toLocaleString()} of ${target.toLocaleString()} words`
      : `${words.toLocaleString()} words — no Surfer target yet`,
  })

  // Surfer's own image target when it has one; it comes back as a flat zero when
  // the analysis had no structural data, and zero is not a target.
  const surferImages = run?.surferGuidelines?.structure?.img_count?.avg || 0
  const imageTarget = surferImages > 0 ? Math.round(surferImages) : HOUSE_IMAGE_TARGET
  const imageCount = images.filter((image) => image?.url).length
  parts.push({
    key: 'images',
    label: 'Images',
    score: Math.min(100, Math.round((imageCount / imageTarget) * 100)),
    detail: `${imageCount} of ${imageTarget}${surferImages > 0 ? ' (Surfer)' : ' (house standard)'}`,
  })

  // Renormalised over whatever could actually be measured — but only once Surfer
  // has run. Without it, images are the sole measurable part, and an article with
  // its three pictures attached scored a confident 100 while nothing about the
  // writing had been looked at. No term coverage, no overall.
  const scored = parts.filter((part) => part.score !== null)
  const weight = scored.reduce((total, part) => total + WEIGHTS[part.key], 0)
  const overall = seo == null || !weight
    ? null
    : Math.round(scored.reduce((total, part) => total + (part.score as number) * WEIGHTS[part.key], 0) / weight)

  return { overall, parts }
}
