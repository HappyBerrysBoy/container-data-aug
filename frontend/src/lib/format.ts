/**
 * Display formatters for backend values.
 *
 * The backend returns raw bytes and ISO timestamps; the UI prefers human-
 * readable forms ("612.4 MB", "5월 5일"). Keep formatting here so view
 * components stay declarative.
 */

/** Format a byte count as a short human-readable string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / Math.pow(1024, exponent)

  // Show 1 decimal under 100, none above (e.g. "9.4 MB" vs "612 MB").
  const fractionDigits = value >= 100 ? 0 : 1
  return `${value.toFixed(fractionDigits)} ${units[exponent]}`
}

/** Format an ISO 8601 timestamp as a short Korean date label ("5월 5일"). */
export function formatDateShort(iso: string, locale = "ko-KR"): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
  }).format(date)
}

/** Last segment of a Posix or Windows path. */
export function pathBasename(path: string): string {
  if (!path) return ""
  const cleaned = path.replace(/[\\/]+$/, "")
  const lastSep = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"))
  return lastSep === -1 ? cleaned : cleaned.slice(lastSep + 1)
}
