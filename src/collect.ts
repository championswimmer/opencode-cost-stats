import type { Plugin } from "@opencode/plugin/tui"
import { summarize, type SessionTimes, type Stats, type Step } from "./stats"

type Client = Plugin.Context["client"]

const PAGE = 100
const MAX_PAGES = 200

export interface Collected {
  stats: Stats
  root: string
  title: string | undefined
}

async function family(client: Client, root: string, known: string[], signal: AbortSignal) {
  const ids = new Set([root, ...known])
  const queue = [...ids]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await client.session.list({ parentID: id, limit: PAGE, cursor }, { signal })
      for (const child of response.data) {
        if (ids.has(child.id)) continue
        ids.add(child.id)
        queue.push(child.id)
      }
      cursor = response.cursor.next ?? undefined
      if (!cursor || response.data.length < PAGE) break
    }
  }
  return [...ids]
}

async function steps(client: Client, sessionID: string, signal: AbortSignal) {
  const result: Step[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.message.list(
      // The cursor already encodes the direction, and the server rejects it combined with `order`.
      { sessionID, type: "assistant", limit: PAGE, ...(cursor ? { cursor } : { order: "asc" }) },
      { signal },
    )
    for (const message of response.data) {
      if (message.type !== "assistant") continue
      result.push({
        agent: message.agent,
        model: message.model,
        tokens: message.tokens,
        cost: message.cost,
        time: message.time,
      })
    }
    cursor = response.cursor.next ?? undefined
    if (!cursor || response.data.length < PAGE) break
  }
  return result
}

export async function collect(
  context: Plugin.Context,
  sessionID: string,
  signal: AbortSignal,
): Promise<Collected> {
  const { client, data } = context
  const root = data.session.root(sessionID)
  const ids = await family(client, root, data.session.family(root), signal)
  const infos = await Promise.all(
    ids.map(
      async (id) =>
        data.session.get(id) ?? (await client.session.get({ sessionID: id }, { signal })),
    ),
  )
  const perSession = await Promise.all(ids.map((id) => steps(client, id, signal)))
  const times: SessionTimes[] = infos.map((info) => ({
    created: info.time.created,
    updated: info.time.updated,
  }))
  const rootInfo = infos[ids.indexOf(root)]
  return {
    root,
    title: rootInfo?.title,
    stats: summarize(perSession.flat(), times, Date.now()),
  }
}
