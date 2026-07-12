/**
 * Shared display formatters for the renderer views (RU locale). Kept in one place so
 * the story-status labels and `ru-RU` date rendering don't drift across views.
 */

import type { StoryStatus } from '@shared/types'

/** Russian labels for story status, shared by Library and Story-info views. */
export const STATUS_RU: Record<StoryStatus, string> = {
  draft: 'черновик',
  in_progress: 'в работе',
  done: 'готово'
}

/** Date only (e.g. last-edited in the library), `ru-RU`. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU')
}

/** Date + time (e.g. a version snapshot stamp), `ru-RU`. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
