import { totalTokens, type Row, type Stats, type Usage } from "./stats"

export type Kind = "title" | "heading" | "head" | "row" | "total" | "muted" | "blank"
export interface Line {
  kind: Kind
  text: string
}

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

const truncate = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`

const COLUMNS = ["steps", "input", "output", "reason", "cache r", "cache w", "cost", "time"]

function cells(usage: Usage) {
  return [
    String(usage.steps),
    formatTokens(usage.input),
    formatTokens(usage.output),
    formatTokens(usage.reasoning),
    formatTokens(usage.cacheRead),
    formatTokens(usage.cacheWrite),
    formatCost(usage.cost),
    formatDuration(usage.ms),
  ]
}

function table(title: string, label: string, rows: Row[], total: Usage, width: number): Line[] {
  const numeric = 8
  const nameWidth = Math.max(12, Math.min(40, width - COLUMNS.length * (numeric + 1)))
  const line = (name: string, values: string[]) =>
    truncate(name, nameWidth).padEnd(nameWidth) +
    values.map((value) => ` ${value.padStart(numeric)}`).join("")
  return [
    { kind: "heading", text: title },
    { kind: "head", text: line(label, COLUMNS) },
    ...rows.map((row): Line => ({ kind: "row", text: line(row.key, cells(row.usage)) })),
    { kind: "total", text: line("total", cells(total)) },
  ]
}

export function report(stats: Stats, title: string, width: number, live: boolean): Line[] {
  const { total } = stats
  const family =
    stats.subagents === 0
      ? "1 session, no subagents"
      : `${stats.sessions} sessions (1 root + ${stats.subagents} subagent${stats.subagents === 1 ? "" : "s"})`
  return [
    { kind: "title", text: title },
    { kind: "muted", text: `${family}${live ? " · still running" : ""}` },
    { kind: "blank", text: "" },
    { kind: "heading", text: `Total cost   ${formatCost(total.cost)}` },
    {
      kind: "row",
      text: `Total time   ${formatDuration(stats.wallMs)} wall-clock · ${formatDuration(total.ms)} model time (steps summed, parallel subagents overlap)`,
    },
    {
      kind: "row",
      text: `Tokens       ${formatTokens(totalTokens(total))} total · ${formatTokens(total.input)} in · ${formatTokens(total.output)} out · ${formatTokens(total.reasoning)} reasoning · ${formatTokens(total.cacheRead)} cache read · ${formatTokens(total.cacheWrite)} cache write`,
    },
    { kind: "blank", text: "" },
    ...table("By model", "model", stats.models, total, width),
    { kind: "blank", text: "" },
    ...table("By agent", "agent", stats.agents, total, width),
  ]
}
