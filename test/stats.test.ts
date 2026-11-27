import assert from "node:assert/strict"
import { test } from "node:test"
import {
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
  segmentWidths,
} from "../src/format"
import { cacheHitRate, emptyUsage, pricing, summarize, totalTokens, type Step } from "../src/stats"

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

test("stacked segments fill the bar proportionally without giving zeros a cell", () => {
  assert.deepEqual(segmentWidths([3, 0, 1], 20), [15, 0, 5])
  assert.deepEqual(segmentWidths([1, 1, 1], 10), [3, 4, 3])
  assert.deepEqual(segmentWidths([0.01, 0.03], 20), [5, 15])
  assert.deepEqual(segmentWidths([0, 0], 20), [0, 0])
  assert.deepEqual(segmentWidths([], 20), [])
})

test("stacked segments keep tiny shares visible when space permits", () => {
  assert.deepEqual(segmentWidths([999, 1, 1], 10), [8, 1, 1])
  assert.deepEqual(segmentWidths([1, 999, 1], 3), [1, 1, 1])
  assert.deepEqual(segmentWidths([1, 999, 1], 2), [0, 2, 0])
  assert.deepEqual(segmentWidths([1, 999, 1], 0), [0, 0, 0])
})

test("cache hit rate is the cached share of prompt tokens", () => {
  assert.equal(cacheHitRate(emptyUsage()), undefined)
  const usage = { ...emptyUsage(), input: 10, cacheRead: 80, cacheWrite: 10 }
  assert.equal(cacheHitRate(usage), 0.8)
})

test("flags steps that used tokens but have no recorded cost as unpriced", () => {
  const stats = summarize(steps, [{ created: 0, updated: 10_000 }], 9_000)
  // The fourth step has no tokens at all, so it is neither priced nor unpriced.
  assert.equal(stats.total.unpriced, 0)
  const sub: Step = {
    agent: "coder",
    model: { providerID: "openai", id: "gpt" },
    tokens: tokens(500, 20, 1000),
    cost: 0,
    time: { created: 0, completed: 1 },
  }
  const mixed = summarize([...steps, sub, sub], [{ created: 0, updated: 1 }], 0)
  assert.equal(mixed.total.unpriced, 2)
  const byModel = Object.fromEntries(mixed.models.map((row) => [row.key, row.usage]))
  assert.equal(pricing(byModel["anthropic/opus"]!), "priced")
  assert.equal(pricing(byModel["openai/gpt"]!), "sub")
  assert.equal(pricing({ ...emptyUsage(), cost: 1, unpriced: 1 }), "partial")
  assert.equal(pricing(emptyUsage()), "priced")
})
