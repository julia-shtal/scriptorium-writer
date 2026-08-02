import { useSettingsStore } from '@renderer/store/settingsStore'
import { ru, en, type Dictionary } from './strings'

/**
 * Active UI dictionary for the current language setting. Reads reactively from
 * the settings store, so a live language change re-renders every consumer with
 * no restart. Defaults to `ru` before settings have loaded.
 */
export function useT(): Dictionary {
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
  return language === 'en' ? en : ru
}
