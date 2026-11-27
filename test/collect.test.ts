import assert from "node:assert/strict"
import { test } from "node:test"
import { collect } from "../src/collect"

const message = (index: number) => ({
  id: `msg_${index}`,
  type: "assistant",
  agent: "build",
  model: { providerID: "p", id: "m" },
  cost: 0.01,
  tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: index * 1000, completed: index * 1000 + 500 },
})

// Mirrors the server: a cursor cannot be combined with `order`, and `next` is set even on a short last page.
function fakeContext(total: number) {
  const all = Array.from({ length: total }, (_, index) => message(index))
  const calls: unknown[] = []
  const info = { id: "root", cost: 0, time: { created: 0, updated: 1000 }, title: "t" }
  const context = {
    data: {
      session: { root: () => "root", family: () => ["root"], get: () => info },
    },
    client: {
      session: { list: async () => ({ data: [], cursor: { next: null } }), get: async () => info },
      message: {
        list: async (input: { limit: number; cursor?: string; order?: string }) => {
          calls.push(input)
          if (input.cursor && input.order) throw new Error("Cursor cannot be combined with order")
          const from = input.cursor ? Number(input.cursor) : 0
          const data = all.slice(from, from + input.limit)
          return { data, cursor: { next: String(from + input.limit) } }
        },
      },
    },
  }
  return { context: context as never, calls }
}

test("pages through more than one page of assistant steps without sending order with a cursor", async () => {
  const { context, calls } = fakeContext(250)
  const { stats } = await collect(context, "root", new AbortController().signal)
  assert.equal(stats.total.steps, 250)
  assert.equal(stats.total.input, 250)
  assert.equal(calls.length, 3)
})

test("stops after a short single page", async () => {
  const { context, calls } = fakeContext(7)
  const { stats } = await collect(context, "root", new AbortController().signal)
  assert.equal(stats.total.steps, 7)
  assert.equal(calls.length, 1)
})
