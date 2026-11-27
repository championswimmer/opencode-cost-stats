import type { Plugin } from "@opencode/plugin/tui"
import type { RGBA } from "@opentui/core"
import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { clickable } from "./click"
import { collect, type Collected } from "./collect"
import { formatCost, formatDuration, formatPercent, formatTokens, segmentWidths } from "./format"
import { cacheHitRate, pricing, totalTokens, type Row } from "./stats"

const PALETTE_STEPS = [400, 600, 300, 700, 500, 200, 800] as const

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; value: Collected }

export function Report(props: { context: Plugin.Context; sessionID: string }) {
  const { context } = props
  const theme = context.theme.surface("dialog")
  const [state, setState] = createSignal<State>({ status: "loading" })
  const [closeHover, setCloseHover] = createSignal(false)
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  collect(context, props.sessionID, abort.signal).then(
    (value) => setState({ status: "done", value }),
    (error: unknown) => {
      if (abort.signal.aborted) return
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) })
    },
  )

  const done = () => {
    const current = state()
    return current.status === "done" ? current.value : undefined
  }
  const palette = (index: number): RGBA => {
    const count = theme.categorical.length
    if (count === 0) return theme.text.base
    const scale = theme.categorical[index % count]
    const step = PALETTE_STEPS[Math.floor(index / count) % PALETTE_STEPS.length] ?? 400
    return scale?.[step] ?? theme.text.base
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

  const Breakdown = (section: { title: string; rows: Row[]; metric: "tokens" | "cost" }) => {
    const [width, setWidth] = createSignal(0)
    const isCost = () => section.metric === "cost"
    const values = createMemo(() =>
      section.rows.map(({ usage }) => (isCost() ? usage.cost : totalTokens(usage))),
    )
    const total = createMemo(() => values().reduce((sum, value) => sum + value, 0))
    const widths = createMemo(() => segmentWidths(values(), width()))
    const hint = () =>
      total() > 0
        ? isCost()
          ? formatCost(total())
          : `${formatTokens(total())} tokens`
        : `No ${section.metric} recorded`

    return (
      <box flexDirection="column" flexShrink={0}>
        <Heading hint={hint()}>{section.title}</Heading>
        <box
          flexDirection="row"
          flexShrink={0}
          height={1}
          backgroundColor={theme.background.raised.high}
          onSizeChange={function () {
            setWidth(this.width)
          }}
        >
          <For each={section.rows}>
            {(_, index) => (
              <Show when={widths()[index()]}>
                {(cells) => (
                  <box width={cells()} flexShrink={0} backgroundColor={palette(index())} />
                )}
              </Show>
            )}
          </For>
        </box>
        <box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={0}>
          <For each={section.rows}>
            {(row, index) => {
              const detail = () => {
                const value = values()[index()] ?? 0
                const kind = isCost() ? pricing(row.usage) : undefined
                if (kind === "sub") return "(sub)"
                const amount = isCost() ? formatCost(value) : formatTokens(value)
                const label = kind === "partial" ? `${amount}+` : amount
                return total() > 0 ? `${label} ${formatPercent(value / total())}` : label
              }
              return (
                <text maxWidth="100%" wrapMode="char" fg={theme.text.muted}>
                  <span style={{ fg: palette(index()) }}>■ {row.key}</span> {detail()}
                </text>
              )
            }}
          </For>
        </box>
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
        <Breakdown title="Tokens by model" rows={stats().models} metric="tokens" />
        <Breakdown title="Tokens by agent" rows={stats().agents} metric="tokens" />
        <Breakdown title="Cost by model" rows={stats().models} metric="cost" />
        <Breakdown title="Cost by agent" rows={stats().agents} metric="cost" />
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
        <text
          fg={closeHover() ? theme.text.feedback.info.base : theme.text.muted}
          wrapMode="none"
          flexShrink={0}
          alignSelf="flex-start"
          selectable={false}
          onMouseOver={() => setCloseHover(true)}
          onMouseOut={() => setCloseHover(false)}
          {...clickable(() => context.ui.dialog.clear())}
        >
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
