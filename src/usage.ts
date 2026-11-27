import type { Plugin } from "@opencode/plugin/tui"

type Data = Plugin.Context["data"]

export interface TreeCost {
  cost: number
  subagents: number
}

/** Cost of the whole session tree the given session belongs to, so a subagent view shows the root total too. */
export function treeCost(data: Data, sessionID: string): TreeCost {
  const root = data.session.root(sessionID)
  const ids = new Set([root, ...data.session.family(root)])
  let cost = 0
  let subagents = 0
  for (const id of ids) {
    const info = data.session.get(id)
    if (!info) continue
    cost += info.cost
    if (id !== root) subagents += 1
  }
  return { cost, subagents }
}

export interface ContextUsage {
  tokens: number
  percent: number | undefined
}

/** Context window use of the latest assistant step, ignoring steps at or after a revert point. */
export function contextUsage(
  messages: ReturnType<Data["session"]["message"]["list"]>,
  models: ReturnType<Data["location"]["model"]["list"]>,
  revertID: string | undefined,
): ContextUsage | undefined {
  let latest: (typeof messages)[number] | undefined
  for (const message of messages) {
    if (revertID && message.id === revertID) break
    if (message.type === "assistant" && message.tokens) latest = message
  }
  if (latest?.type !== "assistant" || !latest.tokens) return
  const { input, output, reasoning, cache } = latest.tokens
  const tokens = input + output + reasoning + cache.read + cache.write
  if (tokens <= 0) return
  const limit = models?.find(
    (model) => model.providerID === latest.model.providerID && model.id === latest.model.id,
  )?.limit.context
  return { tokens, percent: limit ? Math.round((tokens / limit) * 100) : undefined }
}
