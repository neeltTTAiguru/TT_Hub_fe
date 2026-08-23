/* ------------------------------------------------------------------ *
 * Locating a fix inside the rendered draft.
 *
 * The patch Hermes applied is raw markdown; the draft on screen is rendered
 * HTML split across many elements. So rather than trying to map markdown
 * offsets onto the DOM, the rendered text is flattened into one string with
 * a character-by-character index back into its text nodes, and the fix's new
 * wording is searched for in that.
 * ------------------------------------------------------------------ */

const HIGHLIGHT_NAME = 'content-fix'

type CharPosition = { node: Text; offset: number }

// The rendered text in reading order, plus where every character came from.
// Runs of whitespace collapse to one space, and each text node is treated as
// ending in a break, so text split across elements still reads as words with
// spaces between them — which is how the markdown will have been written.
function flattenDraft(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const positions: CharPosition[] = []
  let text = ''
  let pendingSpace = false
  let node = walker.nextNode() as Text | null
  while (node) {
    const value = node.nodeValue || ''
    for (let index = 0; index < value.length; index += 1) {
      if (/\s/.test(value[index])) {
        pendingSpace = text.length > 0
        continue
      }
      if (pendingSpace) {
        text += ' '
        positions.push({ node, offset: index })
        pendingSpace = false
      }
      text += value[index]
      positions.push({ node, offset: index })
    }
    pendingSpace = pendingSpace || text.length > 0
    node = walker.nextNode() as Text | null
  }
  return { text, positions }
}

// Markdown syntax never reaches the screen, so it has to come off the needle
// before searching: link targets, emphasis markers, heading hashes.
function renderedForm(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-–—]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// A fix may be followed by later fixes that edit the same sentence, so an exact
// match is not guaranteed even when the text is plainly still there. Falling back
// to the opening words still puts the reader in the right paragraph, which is the
// point — so a shrinking prefix is tried before giving up.
function locate(haystack: string, needle: string) {
  if (needle.length < 4) return null
  const attempts = [needle]
  for (const fraction of [0.7, 0.45, 0.25]) {
    const cut = Math.floor(needle.length * fraction)
    if (cut < 24) break
    const trimmed = needle.slice(0, needle.lastIndexOf(' ', cut) > 0 ? needle.lastIndexOf(' ', cut) : cut)
    if (trimmed.length >= 24) attempts.push(trimmed)
  }
  for (const attempt of attempts) {
    const index = haystack.indexOf(attempt)
    if (index >= 0) return { index, length: attempt.length, exact: attempt === needle }
  }
  return null
}

export function clearFixHighlight() {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  if (highlights) highlights.delete(HIGHLIGHT_NAME)
}

// 'exact'   — the fix's wording is still in the draft, character for character.
// 'partial' — only its opening survives, so a later fix or a rewrite has since
//             changed this passage. The reader is still taken to the right place,
//             but the caller should say the wording has moved on.
// null      — the text is gone entirely; scrolling anywhere would be a guess.
export type FixLocation = 'exact' | 'partial' | null

export function highlightFixInDraft(root: HTMLElement | null, replacement: string): FixLocation {
  if (!root) return null
  const needle = renderedForm(replacement)
  if (!needle) return null
  const { text, positions } = flattenDraft(root)
  const hit = locate(text, needle)
  if (!hit) return null

  const start = positions[hit.index]
  const end = positions[hit.index + hit.length - 1]
  if (!start || !end) return null
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset + 1)

  const highlights = (CSS as unknown as {
    highlights?: Map<string, unknown>
  }).highlights
  const HighlightCtor = (window as unknown as {
    Highlight?: new (...ranges: Range[]) => unknown
  }).Highlight
  if (highlights && HighlightCtor) {
    highlights.set(HIGHLIGHT_NAME, new HighlightCtor(range))
  } else {
    // No Custom Highlight API: select the text instead, which the browser paints
    // for us. Less pretty, but it lands in the same place.
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const anchor = start.node.parentElement
  anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return hit.exact ? 'exact' : 'partial'
}
