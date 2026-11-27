import assert from "node:assert/strict"
import { test } from "node:test"
import { formatCost, formatDuration, formatTokens, report } from "../src/format"
import { summarize, totalTokens, type Step } from "../src/stats"

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

test("report lists both breakdowns with totals and fits the width", () => {
  const stats = summarize(steps, [{ created: 0, updated: 10_000 }], 9_000)
  const lines = report(stats, "My session", 100, true)
  const text = lines.map((line) => line.text).join("\n")
  assert.match(text, /Total cost\s+\$1\.51/)
  assert.match(text, /still running/)
  assert.match(text, /By model/)
  assert.match(text, /By agent/)
  assert.match(text, /anthropic\/opus/)
  assert.match(text, /explore/)
  for (const line of lines.filter((line) => ["head", "row", "total"].includes(line.kind))) {
    if (line.text.startsWith("Total") || line.text.startsWith("Tokens")) continue
    assert.ok(line.text.length <= 100, line.text)
  }
})
