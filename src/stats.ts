export interface Usage {
  steps: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  ms: number
}

export interface Step {
  agent: string
  model: { providerID: string; id: string }
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  cost?: number
  time: { created: number; completed?: number }
}

export interface Row {
  key: string
  usage: Usage
}

export interface SessionTimes {
  created: number
  updated: number
}

export interface Stats {
  total: Usage
  models: Row[]
  agents: Row[]
  sessions: number
  subagents: number
  wallMs: number
}

export const emptyUsage = (): Usage => ({
  steps: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  ms: 0,
})

export const totalTokens = (usage: Usage) =>
  usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite

function add(usage: Usage, step: Step, now: number) {
  usage.steps += 1
  usage.input += step.tokens?.input ?? 0
  usage.output += step.tokens?.output ?? 0
  usage.reasoning += step.tokens?.reasoning ?? 0
  usage.cacheRead += step.tokens?.cache.read ?? 0
  usage.cacheWrite += step.tokens?.cache.write ?? 0
  usage.cost += step.cost ?? 0
  usage.ms += Math.max(0, (step.time.completed ?? now) - step.time.created)
}

function sorted(map: Map<string, Usage>): Row[] {
  return [...map]
    .map(([key, usage]) => ({ key, usage }))
    .sort(
      (a, b) =>
        b.usage.cost - a.usage.cost ||
        totalTokens(b.usage) - totalTokens(a.usage) ||
        a.key.localeCompare(b.key),
    )
}

export function summarize(steps: Step[], sessions: SessionTimes[], now: number): Stats {
  const total = emptyUsage()
  const models = new Map<string, Usage>()
  const agents = new Map<string, Usage>()
  for (const step of steps) {
    const model = `${step.model.providerID}/${step.model.id}`
    for (const [map, key] of [
      [models, model],
      [agents, step.agent],
    ] as const) {
      const usage = map.get(key) ?? emptyUsage()
      map.set(key, usage)
      add(usage, step, now)
    }
    add(total, step, now)
  }
  const from = Math.min(...sessions.map((session) => session.created))
  const to = Math.max(...sessions.map((session) => session.updated))
  return {
    total,
    models: sorted(models),
    agents: sorted(agents),
    sessions: sessions.length,
    subagents: Math.max(0, sessions.length - 1),
    wallMs: sessions.length > 0 && to >= from ? to - from : 0,
  }
}
