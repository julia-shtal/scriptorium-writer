/**
 * Shared display formatters for the renderer views. Language-aware (M26): the
 * caller threads the active UI language through so dates render for the right
 * locale. Status *labels* now live in the i18n dictionary (`t.status[...]`),
 * not here — this file only maps a language to an Intl locale for dates.
 */

export type UiLanguage = 'ru' | 'en'

const DATE_LOCALE: Record<UiLanguage, string> = { ru: 'ru-RU', en: 'en-US' }

/** Date only (e.g. last-edited in the library). */
export function formatDate(iso: string, language: UiLanguage): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALE[language])
}

/** Date + time (e.g. a version snapshot stamp). */
export function formatDateTime(iso: string, language: UiLanguage): string {
  return new Date(iso).toLocaleString(DATE_LOCALE[language], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
