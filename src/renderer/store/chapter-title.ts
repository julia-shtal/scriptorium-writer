/**
 * The seed title a chapter gets when the writer doesn't type one: «Глава 3» /
 * "Chapter 3", numbered by the position the chapter takes in the story.
 *
 * This is *author data*, not UI chrome — once written it lives in the chapter file
 * (and in the `NN-slug` filename on disk), so it is deliberately kept out of the i18n
 * dictionary: switching the interface language must not retranslate titles the writer
 * already has. The number is the chapter's ordinal at creation time and is never
 * maintained afterwards; reordering or renaming is the writer's business.
 */
export function defaultChapterTitle(ordinal: number, language: 'ru' | 'en'): string {
  return language === 'ru' ? `Глава ${ordinal}` : `Chapter ${ordinal}`
}
