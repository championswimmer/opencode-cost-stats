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

const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"]

/** A horizontal bar `width` cells wide, in eighths of a cell. A non-zero fraction always shows at least one eighth. */
export function bar(fraction: number, width: number) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  let eighths = Math.round(clamped * width * 8)
  if (clamped > 0 && eighths === 0) eighths = 1
  const whole = Math.floor(eighths / 8)
  const part = whole < width ? (EIGHTHS[eighths % 8] ?? "") : ""
  return {
    filled: "█".repeat(whole) + part,
    empty: "░".repeat(Math.max(0, width - whole - (part ? 1 : 0))),
  }
}
