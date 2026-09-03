/**
 * The traveller, as pixels.
 *
 * Lives here rather than in AgencyMap because both the map marker and the chat
 * drawer draw him, and two copies of a sprite is two sprites that drift apart.
 *
 * Drawn as SVG rects with crispEdges so he stays sharp at any size and looks
 * identical on every machine - an emoji would render differently on each and
 * turn to mush at marker size.
 */
export const TRAVELLER_PALETTE: Record<string, string> = {
  h: '#4a3524', // hat, shadow side
  H: '#6b4d31', // hat, lit side
  s: '#e0aa7c', // skin
  b: '#dcd6cc', // beard
  c: '#8a7a4e', // coat
  C: '#5f5336', // coat, lower
  p: '#6b4a2f', // pack
  g: '#8b6b43', // staff
  o: '#33281c', // boots
}

export const TRAVELLER_SPRITE = [
  '................',
  '.....hhhhhh.....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '..HHHHHHHHHHHH..',
  '.....ssssss.....',
  '.....sbssbs..g..',
  '.....ssssss..g..',
  '......bbbb...g..',
  '...pcccccccc.g..',
  '..ppcccccccccg..',
  '..ppcccccccc.g..',
  '...pcccccccc.g..',
  '....CCCCCCCC.g..',
  '....CCC..CCC.g..',
  '....CCC..CCC.g..',
  '....CCC..CCC.g..',
  '....oo....oo.g..',
  '...ooo....ooo...',
  '................',
]

/** Same figure, staff hand raised. Used when he is tapped. */
export const TRAVELLER_SPRITE_WAVE = [
  '................',
  '.....hhhhhh..g..',
  '...hhhhhhhhhhg..',
  '..hhhhhhhhhhhh..',
  '..HHHHHHHHHHHH..',
  '.....ssssss..s..',
  '.....sbssbs..s..',
  '.....ssssss.ss..',
  '......bbbb..s...',
  '...pcccccccc....',
  '..ppccccccccs...',
  '..ppcccccccc....',
  '...pcccccccc....',
  '....CCCCCCCC....',
  '....CCC..CCC....',
  '....CCC..CCC....',
  '....CCC..CCC....',
  '....oo....oo....',
  '...ooo....ooo...',
  '................',
]

/** The sprite as an SVG string, sized to a given width in pixels. */
export function travellerSvg(width: number, frame = TRAVELLER_SPRITE, shadow = true) {
  const rects = frame
    .flatMap((row, y) =>
      [...row].map((ch, x) =>
        TRAVELLER_PALETTE[ch]
          ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${TRAVELLER_PALETTE[ch]}"/>`
          : '',
      ),
    )
    .join('')
  const height = Math.round((width * frame.length) / 16)
  return `<svg width="${width}" height="${height}" viewBox="0 0 16 ${frame.length}" shape-rendering="crispEdges" style="display:block;${
    shadow ? 'filter:drop-shadow(0 2px 2px rgba(0,0,0,0.45));' : ''
  }">${rects}</svg>`
}
