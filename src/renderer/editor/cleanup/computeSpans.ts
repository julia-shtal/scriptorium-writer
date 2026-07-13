// src/renderer/editor/cleanup/computeSpans.ts
//
// Turn the cleanup rules (rules.ts) into a set of tight, absolute-position edit spans
// against a ProseMirror doc. Pure: no dispatch, no decorations, no DOM.

import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { runRules } from './rules'

export interface CleanupSpan {
  /** Absolute doc position where the replaced text begins. */
  from: number
  /** Absolute doc position where the replaced text ends. */
  to: number
  /** The current text between `from` and `to`. */
  oldText: string
  /** Its cleaned replacement (may be empty → the span is a pure deletion). */
  newText: string
}

/**
 * Compute the edit spans the wand would apply.
 *
 * Scope: `range` (usually the current selection, or the whole doc when nothing is
 * selected). We walk every text node that *overlaps* the range.
 *
 * **Partial selection rounds UP to the full text node.** The cleanup rules are
 * context-sensitive — punctuation spacing and hyphen fixes read the neighbouring
 * characters — so running them on a mid-node truncation would give wrong results. A
 * text node touched by either range boundary is therefore processed on its *entire*
 * text, and the emitted spans may extend a few characters past the raw selection at
 * those two boundary nodes. This is intentional and required for correctness.
 *
 * Inline atoms (footnote markers) and `hard_break` nodes are natural boundaries:
 * `nodesBetween` visits each text node separately, so a run is never merged across an
 * atom. Only `text` nodes are transformed; marks and node structure are never touched.
 *
 * For each text node we compute `runRules(text)`. If unchanged, we emit nothing (no
 * zero-length spans). Otherwise a hand-rolled char-level diff (common prefix/suffix +
 * minimal interior LCS) splits the change into one or more tight spans, so disjoint
 * edits within a single node never collapse into one span covering unchanged text.
 */
export function computeSpans(
  doc: ProseMirrorNode,
  range: { from: number; to: number }
): CleanupSpan[] {
  const spans: CleanupSpan[] = []

  doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText) return
    const oldText = node.text ?? ''
    if (oldText.length === 0) return
    const newText = runRules(oldText)
    if (newText === oldText) return

    // `pos` is the position immediately before the text node; intra-node index i maps
    // to absolute position pos + i.
    for (const hunk of diffHunks(oldText, newText)) {
      spans.push({
        from: pos + hunk.start,
        to: pos + hunk.end,
        oldText: oldText.slice(hunk.start, hunk.end),
        newText: hunk.replacement
      })
    }
  })

  return spans
}

interface DiffHunk {
  /** Intra-node start index (inclusive) of the changed old text. */
  start: number
  /** Intra-node end index (exclusive) of the changed old text. */
  end: number
  /** Replacement text for [start, end). */
  replacement: string
}

/**
 * Hand-rolled char-level diff of `oldText → newText` (no dependency). Strips the
 * common prefix and suffix, then diffs the interior with a minimal LCS so disjoint
 * changes split into separate tight hunks. A full replacement (no shared prefix or
 * suffix, e.g. text collapsing toward empty) yields a single hunk over the whole
 * interior — which, since prefix=suffix=0, is the whole node.
 */
function diffHunks(oldText: string, newText: string): DiffHunk[] {
  // Common prefix.
  let prefix = 0
  const maxPrefix = Math.min(oldText.length, newText.length)
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++

  // Common suffix (not overlapping the prefix on either side).
  let suffix = 0
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++
  }

  const oldMid = oldText.slice(prefix, oldText.length - suffix)
  const newMid = newText.slice(prefix, newText.length - suffix)

  // Split the interior into per-change hunks via LCS backtrace.
  const localHunks = lcsHunks(oldMid, newMid)
  return localHunks.map((h) => ({
    start: prefix + h.start,
    end: prefix + h.end,
    replacement: h.replacement
  }))
}

/**
 * Diff two interior strings (common prefix/suffix already stripped) into disjoint
 * hunks using a longest-common-subsequence backtrace. Matched characters partition
 * the strings; the mismatched stretches between matches become hunks. Guarantees at
 * least one hunk when the strings differ (they always do here).
 */
function lcsHunks(a: string, b: string): DiffHunk[] {
  const n = a.length
  const m = b.length

  // Degenerate cases (one side empty) → a single hunk.
  if (n === 0 || m === 0) {
    return [{ start: 0, end: n, replacement: b }]
  }

  // LCS DP table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // Backtrace, collecting a pending mismatch region and flushing it at each match.
  const hunks: DiffHunk[] = []
  let i = 0
  let j = 0
  let oldStart = 0 // index into `a` where the current pending region began
  let pendingNew = '' // accumulated replacement text for the pending region

  const flush = (oldEnd: number): void => {
    if (oldEnd > oldStart || pendingNew.length > 0) {
      hunks.push({ start: oldStart, end: oldEnd, replacement: pendingNew })
    }
    pendingNew = ''
  }

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      // A shared char: close any pending mismatch before it, then advance both.
      flush(i)
      i++
      j++
      oldStart = i
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Delete a[i]: part of the pending old region.
      i++
    } else {
      // Insert b[j]: part of the pending replacement.
      pendingNew += b[j]
      j++
    }
  }
  // Trailing insertions after old is exhausted.
  while (j < m) {
    pendingNew += b[j]
    j++
  }
  // Close the final pending region (covers trailing deletions: end at n).
  flush(n)

  return hunks
}
