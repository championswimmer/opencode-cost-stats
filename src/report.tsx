import type { Plugin } from "@opencode/plugin/tui"
import type { RGBA } from "@opentui/core"
import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { collect, type Collected } from "./collect"
import { bar, formatCost, formatDuration, formatPercent, formatTokens } from "./format"
import { cacheHitRate, pricing, totalTokens, type Row, type Usage } from "./stats"

const BAR_WIDTH = 22

type Metric = "cost" | "tokens" | "time"
const METRICS: Metric[] = ["cost", "tokens", "time"]
const METRIC_LABEL: Record<Metric, string> = {
  cost: "share of cost",
  tokens: "share of tokens",
  time: "share of model time",
}

function metricValue(usage: Usage, metric: Metric) {
  return metric === "cost" ? usage.cost : metric === "tokens" ? totalTokens(usage) : usage.ms
}

function costLabel(usage: Usage) {
  const kind = pricing(usage)
  return kind === "sub"
    ? "(sub)"
    : kind === "partial"
      ? `${formatCost(usage.cost)}+`
      : formatCost(usage.cost)
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; value: Collected }

export function Report(props: { context: Plugin.Context; sessionID: string }) {
  const { context } = props
  const theme = context.theme.surface("dialog")
  const [state, setState] = createSignal<State>({ status: "loading" })
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  collect(context, props.sessionID, abort.signal).then(
    (value) => setState({ status: "done", value }),
    (error: unknown) => {
      if (abort.signal.aborted) return
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) })
    },
  )

  const [chosen, setChosen] = createSignal<Metric>()
  const done = () => {
    const current = state()
    return current.status === "done" ? current.value : undefined
  }
  const metric = (): Metric => chosen() ?? ((done()?.stats.total.cost ?? 0) > 0 ? "cost" : "tokens")
  context.keymap.layer(() => ({
    mode: "modal",
    commands: [
      {
        id: "opencode-cost-stats.metric",
        title: "Switch the breakdown bars between cost, tokens and time",
        bind: "m",
        run: () => {
          setChosen(METRICS[(METRICS.indexOf(metric()) + 1) % METRICS.length])
        },
      },
    ],
  }))
  const palette = (index: number): RGBA => {
    const scale = theme.categorical[index % theme.categorical.length]
    return scale?.[400] ?? theme.text.base
  }
  const running = () => {
    const value = done()
    return (
      value !== undefined &&
      context.data.session
        .family(value.root)
        .some((id) => context.data.session.status(id) === "running")
    )
  }

  const Card = (card: { label: string; value: string; detail: string; color: RGBA }) => (
    <box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      paddingLeft={1}
      paddingRight={1}
      border={true}
      borderStyle="rounded"
      borderColor={theme.border.base}
    >
      <text fg={theme.text.muted} wrapMode="none">
        {card.label}
      </text>
      <text fg={card.color} wrapMode="none">
        <b>{card.value}</b>
      </text>
      <text fg={theme.text.muted} wrapMode="none" truncate>
        {card.detail}
      </text>
    </box>
  )

  const Heading = (heading: { children: JSX.Element; hint?: string }) => (
    <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
      <text fg={theme.text.base} wrapMode="none">
        <b>{heading.children}</b>
      </text>
      <Show when={heading.hint}>
        <text fg={theme.text.faint} wrapMode="none">
          {heading.hint}
        </text>
      </Show>
    </box>
  )

  const TokenMix = (mix: { usage: Usage }) => {
    const parts = createMemo(() => {
      const { usage } = mix
      return [
        { label: "cache read", value: usage.cacheRead, color: theme.hue.interactive[400] },
        { label: "cache write", value: usage.cacheWrite, color: theme.text.feedback.warning.base },
        { label: "input", value: usage.input, color: theme.text.feedback.info.base },
        { label: "output", value: usage.output, color: theme.text.feedback.success.base },
        { label: "reasoning", value: usage.reasoning, color: theme.hue.accent[400] },
      ]
    })
    const total = () => totalTokens(mix.usage)
    return (
      <box flexDirection="column" flexShrink={0}>
        <Heading hint={`${formatTokens(total())} tokens`}>Token mix</Heading>
        <box flexDirection="row" height={1} flexShrink={0}>
          <For each={parts().filter((part) => part.value > 0)}>
            {(part) => (
              <box
                flexGrow={part.value}
                flexBasis={0}
                minWidth={1}
                height={1}
                backgroundColor={part.color}
              />
            )}
          </For>
        </box>
        <box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={0}>
          <For each={parts().filter((part) => part.value > 0)}>
            {(part) => (
              <text wrapMode="none" fg={theme.text.muted}>
                <span style={{ fg: part.color }}>■ </span>
                {part.label} {formatTokens(part.value)} {formatPercent(part.value / total())}
              </text>
            )}
          </For>
        </box>
      </box>
    )
  }

  const Breakdown = (section: { title: string; rows: Row[]; total: Usage }) => {
    const share = (usage: Usage) => {
      const total = metricValue(section.total, metric())
      return total > 0 ? metricValue(usage, metric()) / total : 0
    }
    return (
      <box flexDirection="column" flexShrink={0}>
        <Heading hint={`${METRIC_LABEL[metric()]} · m to switch`}>{section.title}</Heading>
        <For each={section.rows}>
          {(row, index) => {
            const color = () => palette(index())
            const sub = () => pricing(row.usage) === "sub"
            const noCostShare = () => metric() === "cost" && sub()
            const parts = () => bar(noCostShare() ? 0 : share(row.usage), BAR_WIDTH)
            return (
              <box flexDirection="column" flexShrink={0} paddingTop={1}>
                <box flexDirection="row" flexShrink={0} columnGap={1}>
                  <text fg={color()} wrapMode="none" flexShrink={0}>
                    ■
                  </text>
                  <text fg={theme.text.base} wrapMode="none" truncate flexGrow={1} flexShrink={1}>
                    <b>{row.key}</b>
                  </text>
                  <text
                    fg={sub() ? theme.text.muted : theme.text.base}
                    wrapMode="none"
                    flexShrink={0}
                  >
                    {costLabel(row.usage).padStart(8)}
                  </text>
                  <text wrapMode="none" flexShrink={0} selectable={false}>
                    <span style={{ fg: color() }}>{parts().filled}</span>
                    <span style={{ fg: theme.text.faint }}>{parts().empty}</span>
                  </text>
                  <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
                    {(noCostShare() ? "–" : formatPercent(share(row.usage))).padStart(4)}
                  </text>
                </box>
                <text fg={theme.text.muted} wrapMode="none" truncate paddingLeft={2}>
                  {row.usage.steps} step{row.usage.steps === 1 ? "" : "s"} ·{" "}
                  {formatDuration(row.usage.ms)} · in {formatTokens(row.usage.input)} · out{" "}
                  {formatTokens(row.usage.output)} · reasoning {formatTokens(row.usage.reasoning)} ·
                  cache {formatTokens(row.usage.cacheRead)} read /{" "}
                  {formatTokens(row.usage.cacheWrite)} write
                </text>
              </box>
            )
          }}
        </For>
      </box>
    )
  }

  const Body = (body: { value: Collected }) => {
    const stats = () => body.value.stats
    const hit = () => cacheHitRate(stats().total)
    return (
      <box flexDirection="column" gap={1} flexShrink={0}>
        <box flexDirection="row" columnGap={1} flexShrink={0}>
          <Card
            label="Total cost"
            value={formatCost(stats().total.cost)}
            detail={
              stats().total.unpriced > 0
                ? `excl. ${stats().total.unpriced} (sub) steps`
                : `${stats().total.steps} steps`
            }
            color={theme.text.feedback.success.base}
          />
          <Card
            label="Wall-clock"
            value={formatDuration(stats().wallMs)}
            detail={`${formatDuration(stats().total.ms)} model time`}
            color={theme.hue.interactive[400]}
          />
          <Card
            label="Tokens"
            value={formatTokens(totalTokens(stats().total))}
            detail={`${formatTokens(stats().total.input)} in · ${formatTokens(stats().total.output)} out`}
            color={theme.hue.accent[400]}
          />
          <Card
            label="Cache hit rate"
            value={hit() === undefined ? "–" : formatPercent(hit() ?? 0)}
            detail={`${formatTokens(stats().total.cacheRead)} cached`}
            color={theme.text.feedback.warning.base}
          />
        </box>
        <TokenMix usage={stats().total} />
        <Breakdown title="By model" rows={stats().models} total={stats().total} />
        <Breakdown title="By agent" rows={stats().agents} total={stats().total} />
        <Show when={stats().total.unpriced > 0}>
          <text fg={theme.text.faint} wrapMode="word">
            (sub) means no per-token price is recorded, for example a model used through a ChatGPT
            subscription. Those steps are not in the cost total; a + after a cost means some steps
            were left out.
          </text>
        </Show>
        <text fg={theme.text.faint} wrapMode="word">
          Model time adds up every step, so parallel subagents overlap and it can exceed wall-clock
          time.
        </text>
      </box>
    )
  }

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <box flexDirection="column" flexShrink={1}>
          <text fg={theme.text.base} wrapMode="none" truncate>
            <b>{done()?.title ?? "Session stats"}</b>
          </text>
          <Show when={done()}>
            {(value) => (
              <text fg={theme.text.muted} wrapMode="none">
                {value().stats.subagents === 0
                  ? "1 session, no subagents"
                  : `${value().stats.sessions} sessions · 1 root + ${value().stats.subagents} subagent${value().stats.subagents === 1 ? "" : "s"}`}
                <Show when={running()}>
                  <span style={{ fg: theme.text.feedback.success.base }}> ● running</span>
                </Show>
              </text>
            )}
          </Show>
        </box>
        <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
          esc close
        </text>
      </box>
      <Show when={state().status === "loading"}>
        <text fg={theme.text.muted}>Gathering session stats…</text>
      </Show>
      <Show when={state().status === "error"}>
        <text fg={theme.text.feedback.error.base}>
          Could not load stats: {(state() as { message: string }).message}
        </text>
      </Show>
      <Show when={done()}>
        {(value) => (
          <scrollbox maxHeight={Math.max(8, context.renderer.height - 10)}>
            <Body value={value()} />
          </scrollbox>
        )}
      </Show>
    </box>
  )
}
