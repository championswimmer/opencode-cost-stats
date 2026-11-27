import assert from "node:assert/strict"
import { test } from "node:test"
import { bar, formatCost, formatDuration, formatPercent, formatTokens } from "../src/format"
import { cacheHitRate, emptyUsage, summarize, totalTokens, type Step } from "../src/stats"

const tokens = (input: number, output: number, read = 0, write = 0, reasoning = 0) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const steps: Step[] = [
  {
    agent: "build",
    model: { providerID: "anthropic", id: "opus" },
    tokens: tokens(100, 50, 1000, 200, 10),
    cost: 1,
    time: { created: 1_000, completed: 4_000 },
  },
  {
    agent: "explore",
    model: { providerID: "anthropic", id: "haiku" },
    tokens: tokens(10, 5),
    cost: 0.01,
    time: { created: 2_000, completed: 3_000 },
  },
  {
    agent: "build",
    model: { providerID: "anthropic", id: "opus" },
    tokens: tokens(20, 10, 500),
    cost: 0.5,
    time: { created: 5_000 },
  },
  {
    agent: "general",
    model: { providerID: "openai", id: "gpt" },
    time: { created: 6_000, completed: 6_500 },
  },
]

test("sums tokens, cost and time and groups by model and agent", () => {
  const stats = summarize(
    steps,
    [
      { created: 0, updated: 10_000 },
      { created: 1_500, updated: 20_000 },
    ],
    9_000,
  )
  assert.equal(stats.total.steps, 4)
  assert.equal(stats.total.cost, 1.51)
  assert.equal(stats.total.input, 130)
  assert.equal(stats.total.cacheRead, 1500)
  assert.equal(totalTokens(stats.total), 130 + 65 + 10 + 1500 + 200)
  // The unfinished step counts up to `now`.
  assert.equal(stats.total.ms, 3_000 + 1_000 + 4_000 + 500)
  assert.deepEqual(
    stats.models.map((row) => [row.key, row.usage.steps, row.usage.cost]),
    [
      ["anthropic/opus", 2, 1.5],
      ["anthropic/haiku", 1, 0.01],
      ["openai/gpt", 1, 0],
    ],
  )
  assert.deepEqual(
    stats.agents.map((row) => row.key),
    ["build", "explore", "general"],
  )
  assert.equal(stats.sessions, 2)
  assert.equal(stats.subagents, 1)
  assert.equal(stats.wallMs, 20_000)
})

test("handles an empty session", () => {
  const stats = summarize([], [], 0)
  assert.equal(stats.total.steps, 0)
  assert.equal(stats.wallMs, 0)
  assert.deepEqual(stats.models, [])
})

test("formats numbers", () => {
  assert.equal(formatTokens(999), "999")
  assert.equal(formatTokens(1_000), "1k")
  assert.equal(formatTokens(12_345), "12.3k")
  assert.equal(formatTokens(250_000), "250k")
  assert.equal(formatTokens(1_500_000), "1.5M")
  assert.equal(formatCost(0), "$0.00")
  assert.equal(formatCost(0.0042), "$0.0042")
  assert.equal(formatCost(12.345), "$12.35")
  assert.equal(formatDuration(900), "1s")
  assert.equal(formatDuration(65_000), "1m 5s")
  assert.equal(formatDuration(3_725_000), "1h 2m")
})

test("formats percentages", () => {
  assert.equal(formatPercent(0), "0%")
  assert.equal(formatPercent(0.004), "<1%")
  assert.equal(formatPercent(0.034), "3.4%")
  assert.equal(formatPercent(0.05), "5%")
  assert.equal(formatPercent(0.956), "96%")
  assert.equal(formatPercent(1), "100%")
})

test("bar fills in eighths and always shows a non-zero share", () => {
  assert.deepEqual(bar(0, 4), { filled: "", empty: "░░░░" })
  assert.deepEqual(bar(1, 4), { filled: "████", empty: "" })
  assert.deepEqual(bar(0.5, 4), { filled: "██", empty: "░░" })
  assert.deepEqual(bar(0.375, 4), { filled: "█▌", empty: "░░" })
  assert.deepEqual(bar(0.001, 4), { filled: "▏", empty: "░░░" })
  assert.deepEqual(bar(5, 3), { filled: "███", empty: "" })
  assert.deepEqual(bar(Number.NaN, 3), { filled: "", empty: "░░░" })
  for (const fraction of [0.01, 0.33, 0.9, 0.999]) {
    const { filled, empty } = bar(fraction, 10)
    assert.equal(filled.length + empty.length, 10)
  }
})

test("cache hit rate is the cached share of prompt tokens", () => {
  assert.equal(cacheHitRate(emptyUsage()), undefined)
  const usage = { ...emptyUsage(), input: 10, cacheRead: 80, cacheWrite: 10 }
  assert.equal(cacheHitRate(usage), 0.8)
})
