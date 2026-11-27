import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { collect, type Collected } from "./collect"
import { formatCost, report, type Kind, type Line } from "./format"
import { openSettings, parseSettings, DEFAULTS, type Settings } from "./settings"
import { contextUsage, treeCost } from "./usage"

const DIALOG_WIDTH = 116

function Sidebar(props: { context: Plugin.Context; sessionID: string }) {
  const { context } = props
  const theme = context.theme
  const session = createMemo(() => context.data.session.get(props.sessionID))
  const usage = createMemo(() =>
    contextUsage(
      context.data.session.message.list(props.sessionID),
      context.data.location.model.list(session()?.location),
      session()?.revert?.messageID,
    ),
  )
  const total = createMemo(() => treeCost(context.data, props.sessionID))
  return (
    <Show when={usage() || total().cost > 0}>
      <box flexDirection="column" flexShrink={0}>
        <text fg={theme.text.base}>
          <b>Context</b>
        </text>
        <Show when={usage()}>
          {(value) => (
            <>
              <text fg={theme.text.muted}>{value().tokens.toLocaleString()} tokens</text>
              <Show when={value().percent !== undefined}>
                <text fg={theme.text.muted}>{value().percent}% used</text>
              </Show>
            </>
          )}
        </Show>
        <Show when={total().cost > 0}>
          <text fg={theme.text.muted}>{formatCost(total().cost)} spent</text>
          <Show when={total().subagents > 0}>
            <text fg={theme.text.muted}>
              incl. {total().subagents} subagent{total().subagents === 1 ? "" : "s"}
            </text>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

function Footer(props: { context: Plugin.Context; sessionID: string }) {
  const total = createMemo(() => treeCost(props.context.data, props.sessionID))
  return (
    <Show when={total().cost > 0}>
      <text fg={props.context.theme.text.muted} flexShrink={0} wrapMode="none">
        total {formatCost(total().cost)}
      </text>
    </Show>
  )
}

function Report(props: { context: Plugin.Context; sessionID: string }) {
  const { context } = props
  const theme = context.theme
  const [state, setState] = createSignal<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "done"; value: Collected }
  >({ status: "loading" })
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  collect(context, props.sessionID, abort.signal).then(
    (value) => setState({ status: "done", value }),
    (error: unknown) => {
      if (abort.signal.aborted) return
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) })
    },
  )

  const width = () => Math.max(40, Math.min(DIALOG_WIDTH, context.renderer.width - 2) - 6)
  const lines = createMemo<Line[]>(() => {
    const current = state()
    if (current.status !== "done") return []
    const running = context.data.session
      .family(current.value.root)
      .some((id) => context.data.session.status(id) === "running")
    return report(current.value.stats, current.value.title ?? "Session stats", width(), running)
  })
  const color = (kind: Kind) =>
    kind === "head" || kind === "muted" ? theme.text.muted : theme.text.base
  const bold = (kind: Kind) => kind === "title" || kind === "heading" || kind === "total"

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <Show when={state().status === "loading"}>
        <text fg={theme.text.muted}>Gathering session stats…</text>
      </Show>
      <Show when={state().status === "error"}>
        <text fg={theme.text.feedback.error.base}>
          Could not load stats: {(state() as { message: string }).message}
        </text>
      </Show>
      <scrollbox maxHeight={Math.max(6, context.renderer.height - 10)}>
        <box flexDirection="column" flexShrink={0}>
          <For each={lines()}>
            {(line) => (
              <text fg={color(line.kind)} wrapMode="word" selectable>
                {bold(line.kind) ? <b>{line.text || " "}</b> : line.text || " "}
              </text>
            )}
          </For>
        </box>
      </scrollbox>
      <text fg={theme.text.muted}>esc close</text>
    </box>
  )
}

export default Plugin.define({
  id: "opencode-cost-stats",
  setup(context) {
    const [stored, mutate] = context.storage.store<Settings>("settings", { initial: DEFAULTS })
    const settings = () => parseSettings(stored)

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode-cost-stats.show",
          title: "Session stats (tokens, cost and time by model and agent)",
          group: "Session",
          palette: true,
          slash: { name: "session-stats" },
          run() {
            const route = context.ui.router.current()
            if (route.type !== "session") {
              context.ui.toast.show({ message: "Open a session first.", variant: "warning" })
              return
            }
            context.ui.dialog.set({ size: "xlarge", centered: true })
            context.ui.dialog.show(() => <Report context={context} sessionID={route.sessionID} />)
          },
        },
        {
          id: "opencode-cost-stats.settings",
          title: "Session cost placement",
          group: "Session",
          palette: true,
          slash: { name: "session-stats-settings" },
          run: () =>
            void openSettings(context, settings, (change) =>
              mutate((draft) => {
                draft.placement = change.placement
              }),
            ),
        },
      ],
    }))

    const sidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => (
        <Show when={["sidebar", "both"].includes(settings().placement)}>
          <Sidebar context={context} sessionID={props.sessionID} />
        </Show>
      ),
    })
    const footer = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => (
        <Show when={["footer", "both"].includes(settings().placement) && props.sessionID} keyed>
          {(sessionID) => <Footer context={context} sessionID={sessionID} />}
        </Show>
      ),
    })
    return () => {
      sidebar()
      footer()
    }
  },
})
