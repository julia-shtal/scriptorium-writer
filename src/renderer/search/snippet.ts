export interface Snippet {
  before: string
  match: string
  after: string
  truncatedStart: boolean
  truncatedEnd: boolean
}

/**
 * A one-line context window around one match: up to `radius` chars on each side,
 * with flags for whether the context was clipped (so the view can show an
 * ellipsis). Internal whitespace/newlines are collapsed to single spaces.
 */
export function makeSnippet(
  text: string,
  start: number,
  length: number,
  radius = 40
): Snippet {
  const end = start + length
  const from = Math.max(0, start - radius)
  const to = Math.min(text.length, end + radius)
  const clean = (s: string): string => s.replace(/\s+/g, ' ')
  return {
    before: clean(text.slice(from, start)),
    match: clean(text.slice(start, end)),
    after: clean(text.slice(end, to)),
    truncatedStart: from > 0,
    truncatedEnd: to < text.length
  }
}
