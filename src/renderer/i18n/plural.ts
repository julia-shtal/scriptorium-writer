/**
 * Tiny plural engine (no external lib) for count + noun phrases. Callers compose
 * `${count} ${plural(count, forms, language)}`. RU uses the standard one/few/many
 * Slavic rule; EN only distinguishes singular from plural.
 */

export interface PluralForms {
  /** count % 10 === 1 && count % 100 !== 11 (RU) / count === 1 (EN). e.g. "слово" / "word". */
  one: string
  /** RU few: count%10 in 2..4 && not 12..14, e.g. "слова". Unused for EN (set = many). */
  few: string
  /** RU many / EN plural: "слов" / "words". */
  many: string
}

/** Pick the grammatically-correct plural form of a noun for `count` in `language`. */
export function plural(count: number, forms: PluralForms, language: 'ru' | 'en'): string {
  if (language === 'en') return count === 1 ? forms.one : forms.many
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few
  return forms.many
}
