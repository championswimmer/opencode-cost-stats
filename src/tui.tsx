import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, Show } from "solid-js"
import { clickable } from "./click"
import { formatCost } from "./format"
import { Report } from "./report"
import { openSettings, parseSettings, DEFAULTS, type Settings } from "./settings"
import { contextUsage, treeCost } from "./usage"

function Sidebar(props: { context: Plugin.Context; sessionID: string; onOpen: () => void }) {
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
  const [hover, setHover] = createSignal(false)
  const body = () => (hover() ? theme.text.base : theme.text.muted)
  return (
    <Show when={usage() || total().cost > 0}>
      <box
        flexDirection="column"
        flexShrink={0}
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        {...clickable(props.onOpen)}
      >
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text fg={theme.text.base} selectable={false}>
            <b>Context</b>
          </text>
          <text
            fg={hover() ? theme.text.feedback.info.base : theme.text.muted}
            wrapMode="none"
            selectable={false}
          >
            [+]
          </text>
        </box>
        <Show when={usage()}>
          {(value) => (
            <>
              <text fg={body()} selectable={false}>
                {value().tokens.toLocaleString()} tokens
              </text>
              <Show when={value().percent !== undefined}>
                <text fg={body()} selectable={false}>
                  {value().percent}% used
                </text>
              </Show>
            </>
          )}
        </Show>
        <Show when={total().cost > 0}>
          <text fg={body()} selectable={false}>
            {formatCost(total().cost)} spent
          </text>
          <Show when={total().subagents > 0}>
            <text fg={body()} selectable={false}>
              incl. {total().subagents} subagent{total().subagents === 1 ? "" : "s"}
            </text>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

function Footer(props: { context: Plugin.Context; sessionID: string; onOpen: () => void }) {
  const theme = props.context.theme
  const total = createMemo(() => treeCost(props.context.data, props.sessionID))
  const [hover, setHover] = createSignal(false)
  return (
    <Show when={total().cost > 0}>
      <text
        fg={hover() ? theme.text.base : theme.text.muted}
        flexShrink={0}
        wrapMode="none"
        selectable={false}
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        {...clickable(props.onOpen)}
      >
        total {formatCost(total().cost)}{" "}
        <span style={{ fg: hover() ? theme.text.feedback.info.base : theme.text.muted }}>[+]</span>
      </text>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode-cost-stats",
  setup(context) {
    const [stored, mutate] = context.storage.store<Settings>("settings", { initial: DEFAULTS })
    const settings = () => parseSettings(stored)
    const openReport = (sessionID: string) => {
      context.ui.dialog.show(() => <Report context={context} sessionID={sessionID} />)
      // `set` applies to the active dialog, so it has to come after `show`.
      context.ui.dialog.set({ size: "xlarge", centered: true })
    }

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
            openReport(route.sessionID)
          },
        },
        {
          id: "opencode-cost-stats.settings",
          title: "Session cost placement",
          group: "Session",
          palette: true,
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
          <Sidebar
            context={context}
            sessionID={props.sessionID}
            onOpen={() => openReport(props.sessionID)}
          />
        </Show>
      ),
    })
    const footer = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => (
        <Show when={["footer", "both"].includes(settings().placement) && props.sessionID} keyed>
          {(sessionID) => (
            <Footer context={context} sessionID={sessionID} onOpen={() => openReport(sessionID)} />
          )}
        </Show>
      ),
    })
    return () => {
      sidebar()
      footer()
    }
  },
})
