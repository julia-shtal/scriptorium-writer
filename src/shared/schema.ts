/**
 * Schema version constants for every persisted object.
 *
 * Every object written to disk carries its `schemaVersion` so future milestones
 * can migrate old libraries forward. Bump the relevant constant when a persisted
 * shape changes, and add a migration step where it is read.
 */

export const STORY_SCHEMA_VERSION = 1
export const CHAPTER_SCHEMA_VERSION = 1
export const NOTES_SCHEMA_VERSION = 1
export const SETTINGS_SCHEMA_VERSION = 1

/** Convenience bundle for anything that wants all versions at once. */
export const SCHEMA_VERSIONS = {
  story: STORY_SCHEMA_VERSION,
  chapter: CHAPTER_SCHEMA_VERSION,
  notes: NOTES_SCHEMA_VERSION,
  settings: SETTINGS_SCHEMA_VERSION
} as const
