/** Integer with thousands separators: 14821 → "14,821". */
export function formatInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞'
}

/** Full float64 value (shortest round-trip form). Never rounds for display. */
export function formatExact(x: number | undefined): string {
  if (x === undefined) return '—'
  return Object.is(x, -0) ? '-0' : String(x)
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${formatInt(n)}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
