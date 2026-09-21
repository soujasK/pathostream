/** Durations range from minutes (a city reach) to weeks (the Danube), so
 * one unit doesn't fit: minutes under an hour, hours under two days, days
 * beyond. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(1)} hr`
  return `${(hours / 24).toFixed(1)} days`
}
