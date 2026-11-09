/**
 * Per-status import choices (M31 spec, §Conflict model). Shared so the data layer
 * enforces exactly what the dialog offers. The first allowed decision is the default.
 */
import type { ImportDecision, ImportStoryStatus } from './types'

const ALLOWED: Record<ImportStoryStatus, readonly [ImportDecision, ...ImportDecision[]]> = {
  new: ['import', 'skip'],
  identical: ['skip'],
  conflict: ['keepBoth', 'replace', 'skip'],
  invalid: ['skip']
}

export function allowedDecisions(status: ImportStoryStatus): ImportDecision[] {
  return [...ALLOWED[status]]
}

export function defaultDecision(status: ImportStoryStatus): ImportDecision {
  return ALLOWED[status][0]
}
