export function formatTokens(value: number) {
  if (value < 1_000) return String(Math.round(value))
  const [divisor, unit] = value < 1_000_000 ? [1_000, "k"] : [1_000_000, "M"]
  const scaled = value / divisor
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${unit}`.replace(".0", "")
}

export function formatCost(value: number) {
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** A share between 0 and 1 as a percentage, with a decimal only where a whole number would hide it. */
export function formatPercent(fraction: number) {
  const percent = fraction * 100
  if (percent > 0 && percent < 1) return "<1%"
  return `${percent < 10 && percent > 0 ? percent.toFixed(1).replace(".0", "") : Math.round(percent)}%`
}

/** Round cumulative shares to cell boundaries, reserving one cell per positive value when they fit. */
export function segmentWidths(values: readonly number[], width: number) {
  const positive = values.filter((value) => value > 0)
  const total = positive.reduce((sum, value) => sum + value, 0)
  let remaining = positive.length
  const minimum = width >= remaining ? 1 : 0
  let cumulative = 0
  let used = 0
  return values.map((value) => {
    if (!(value > 0)) return 0
    cumulative += value
    remaining -= 1
    const boundary = Math.round((cumulative / total) * width)
    const end = Math.min(width - remaining * minimum, Math.max(used + minimum, boundary))
    const cells = end - used
    used = end
    return cells
  })
}
