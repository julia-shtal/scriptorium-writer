/**
 * Human-readable byte size for the SettingsView storage-usage line (MP9). Binary
 * units (1 KB = 1024 B); one decimal place above the byte range so a writer can see
 * they are approaching quota.
 */
export function formatBytes(bytes: number): string {
  // A non-finite or negative estimate should never reach the UI as "NaN KB".
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}
