/** Parse a comma-separated tag input into a trimmed, de-duplicated list. Pure. */
export function parseTags(input: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input.split(',')) {
    const tag = raw.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/** Render a tag list back into the comma-separated input string. Pure. */
export function formatTags(tags: readonly string[]): string {
  return tags.join(', ')
}
