import assert from "node:assert/strict"
import { test } from "node:test"
import { contextUsage, treeCost } from "../src/usage"

type Messages = Parameters<typeof contextUsage>[0]
type Data = Parameters<typeof treeCost>[0]

const assistant = (id: string, total: number, model = "m"): Messages[number] =>
  ({
    id,
    type: "assistant",
    agent: "build",
    model: { providerID: "p", id: model },
    content: [],
    time: { created: 0 },
    tokens: { input: total, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }) as unknown as Messages[number]

test("treeCost sums the root family even when asked from a subagent", () => {
  const info: Record<string, { cost: number }> = {
    root: { cost: 1 },
    a: { cost: 0.5 },
    b: { cost: 0.25 },
  }
  const data = {
    session: {
      root: () => "root",
      family: () => ["root", "a", "b", "missing"],
      get: (id: string) => info[id],
    },
  } as unknown as Data
  assert.deepEqual(treeCost(data, "a"), { cost: 1.75, subagents: 2 })
})

test("contextUsage uses the latest assistant step and respects revert", () => {
  const models = [{ providerID: "p", id: "m", limit: { context: 1000 } }] as unknown as Parameters<
    typeof contextUsage
  >[1]
  const messages = [assistant("1", 100), assistant("2", 400), assistant("3", 900)]
  assert.deepEqual(contextUsage(messages, models, undefined), { tokens: 900, percent: 90 })
  assert.deepEqual(contextUsage(messages, models, "3"), { tokens: 400, percent: 40 })
  assert.equal(contextUsage(messages, models, "1"), undefined)
  assert.deepEqual(contextUsage(messages, undefined, undefined), {
    tokens: 900,
    percent: undefined,
  })
  assert.equal(contextUsage([], models, undefined), undefined)
})
