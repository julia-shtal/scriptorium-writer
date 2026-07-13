// src/renderer/editor/cleanup/rules.ts
//
// Minimal text-cleanup rules engine (SPEC §9, M8). Pure string→string transforms,
// no ProseMirror / DOM. Each rule is a discrete entry in an ordered list so a later
// milestone can expose them as individual Settings toggles.
//
// TODO(post-v1): per-rule toggles (Settings UI enabling/disabling each rule by id).

/** One reversible-in-spirit text transform. `apply` must be pure. */
export interface CleanupRule {
  id: string
  name: string
  apply: (text: string) => string
}

// Punctuation that takes no space before and exactly one space after.
const CLOSING_PUNCT = ',.;:!?'

/**
 * Ordered cleanup rules. Order matters: space collapsing runs first so later rules
 * see normalized single spaces; the em-dash rule runs before trailing-trim so a
 * trailing " - " is handled as a dash, not silently stripped.
 */
export const rules: CleanupRule[] = [
  {
    id: 'collapse-spaces',
    name: 'Схлопнуть повторяющиеся пробелы',
    // Collapse runs of 2+ spaces (space/tab, not newlines) into a single space.
    apply: (text) => text.replace(/[ \t]{2,}/g, ' ')
  },
  {
    id: 'punctuation-spacing',
    name: 'Пробелы вокруг знаков препинания',
    // No space before , . ; : ! ? ; ensure exactly one space after when followed by
    // a non-space, non-punctuation character. Works line-by-line so end-of-line
    // punctuation isn't forced to glue onto the next line's first character.
    apply: (text) =>
      text
        .split('\n')
        .map((line) =>
          line
            // Drop spaces directly before the punctuation.
            .replace(new RegExp(`[ \\t]+([${escapeClass(CLOSING_PUNCT)}])`, 'g'), '$1')
            // Ensure a single space after the punctuation when glued to the next word.
            .replace(
              new RegExp(`([${escapeClass(CLOSING_PUNCT)}])(?=[^\\s${escapeClass(CLOSING_PUNCT)}])`, 'g'),
              '$1 '
            )
        )
        .join('\n')
  },
  {
    id: 'hyphen-word-spacing',
    name: 'Слипшийся дефис в словах',
    // Fix a stray space on either side of an intra-word hyphen: `что- нибудь` and
    // `что -нибудь` → `что-нибудь`. Requires word characters on both outer sides so a
    // real dash usage (` - ` between words with spaces both sides) is left for rule 4.
    apply: (text) =>
      text
        .replace(/(\p{L})-[ \t]+(\p{L})/gu, '$1-$2')
        .replace(/(\p{L})[ \t]+-(\p{L})/gu, '$1-$2')
  },
  {
    id: 'em-dash',
    name: 'Тире вместо дефиса',
    // ` - ` (space-hyphen-space) → ` — ` (em dash). The headline rule.
    apply: (text) => text.replace(/ - /g, ' — ')
  },
  {
    id: 'trim-trailing',
    name: 'Убрать пробелы в конце строк',
    // Trim trailing spaces/tabs at the end of every line.
    apply: (text) =>
      text
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n')
  }
]

/** Left-fold the ordered rules over `text`, in declaration order. */
export function runRules(text: string): string {
  return rules.reduce((acc, rule) => rule.apply(acc), text)
}

/** Escape a set of characters for safe use inside a RegExp character class. */
function escapeClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&')
}
