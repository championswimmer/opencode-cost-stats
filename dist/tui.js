// src/tui.tsx
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { spread as _$spread } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

// src/click.ts
import { MouseButton } from "@opentui/core";
function clickable(onClick) {
  let start;
  return {
    onMouseDown(event) {
      if (event.button === MouseButton.LEFT) start = { x: event.x, y: event.y };
    },
    onMouseDrag() {
      start = void 0;
    },
    onMouseUp(event) {
      const origin = start;
      start = void 0;
      if (event.button !== MouseButton.LEFT || event.isDragging || origin?.x !== event.x || origin.y !== event.y)
        return;
      event.stopPropagation();
      onClick();
    }
  };
}

// src/stats.ts
var emptyUsage = () => ({
  steps: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  ms: 0
});
var totalTokens = (usage) => usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite;
function add(usage, step, now) {
  usage.steps += 1;
  usage.input += step.tokens?.input ?? 0;
  usage.output += step.tokens?.output ?? 0;
  usage.reasoning += step.tokens?.reasoning ?? 0;
  usage.cacheRead += step.tokens?.cache.read ?? 0;
  usage.cacheWrite += step.tokens?.cache.write ?? 0;
  usage.cost += step.cost ?? 0;
  usage.ms += Math.max(0, (step.time.completed ?? now) - step.time.created);
}
function sorted(map) {
  return [...map].map(([key, usage]) => ({ key, usage })).sort(
    (a, b) => b.usage.cost - a.usage.cost || totalTokens(b.usage) - totalTokens(a.usage) || a.key.localeCompare(b.key)
  );
}
function summarize(steps2, sessions, now) {
  const total = emptyUsage();
  const models = /* @__PURE__ */ new Map();
  const agents = /* @__PURE__ */ new Map();
  for (const step of steps2) {
    const model = `${step.model.providerID}/${step.model.id}`;
    for (const [map, key] of [
      [models, model],
      [agents, step.agent]
    ]) {
      const usage = map.get(key) ?? emptyUsage();
      map.set(key, usage);
      add(usage, step, now);
    }
    add(total, step, now);
  }
  const from = Math.min(...sessions.map((session) => session.created));
  const to = Math.max(...sessions.map((session) => session.updated));
  return {
    total,
    models: sorted(models),
    agents: sorted(agents),
    sessions: sessions.length,
    subagents: Math.max(0, sessions.length - 1),
    wallMs: sessions.length > 0 && to >= from ? to - from : 0
  };
}

// src/collect.ts
var PAGE = 100;
var MAX_PAGES = 200;
async function family(client, root, known, signal) {
  const ids = /* @__PURE__ */ new Set([root, ...known]);
  const queue = [...ids];
  for (let id = queue.shift(); id !== void 0; id = queue.shift()) {
    let cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await client.session.list({ parentID: id, limit: PAGE, cursor }, { signal });
      for (const child of response.data) {
        if (ids.has(child.id)) continue;
        ids.add(child.id);
        queue.push(child.id);
      }
      cursor = response.cursor.next ?? void 0;
      if (!cursor || response.data.length < PAGE) break;
    }
  }
  return [...ids];
}
async function steps(client, sessionID, signal) {
  const result = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.message.list(
      { sessionID, type: "assistant", order: "asc", limit: PAGE, cursor },
      { signal }
    );
    for (const message of response.data) {
      if (message.type !== "assistant") continue;
      result.push({
        agent: message.agent,
        model: message.model,
        tokens: message.tokens,
        cost: message.cost,
        time: message.time
      });
    }
    cursor = response.cursor.next ?? void 0;
    if (!cursor || response.data.length < PAGE) break;
  }
  return result;
}
async function collect(context, sessionID, signal) {
  const { client, data } = context;
  const root = data.session.root(sessionID);
  const ids = await family(client, root, data.session.family(root), signal);
  const infos = await Promise.all(
    ids.map(
      async (id) => data.session.get(id) ?? await client.session.get({ sessionID: id }, { signal })
    )
  );
  const perSession = await Promise.all(ids.map((id) => steps(client, id, signal)));
  const times = infos.map((info) => ({
    created: info.time.created,
    updated: info.time.updated
  }));
  const rootInfo = infos[ids.indexOf(root)];
  return {
    root,
    title: rootInfo?.title,
    stats: summarize(perSession.flat(), times, Date.now())
  };
}

// src/format.ts
function formatTokens(value) {
  if (value < 1e3) return String(Math.round(value));
  const [divisor, unit] = value < 1e6 ? [1e3, "k"] : [1e6, "M"];
  const scaled = value / divisor;
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${unit}`.replace(".0", "");
}
function formatCost(value) {
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
function formatDuration(ms) {
  const seconds = Math.round(ms / 1e3);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
var truncate = (text, width) => text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}\u2026`;
var COLUMNS = ["steps", "input", "output", "reason", "cache r", "cache w", "cost", "time"];
function cells(usage) {
  return [
    String(usage.steps),
    formatTokens(usage.input),
    formatTokens(usage.output),
    formatTokens(usage.reasoning),
    formatTokens(usage.cacheRead),
    formatTokens(usage.cacheWrite),
    formatCost(usage.cost),
    formatDuration(usage.ms)
  ];
}
function table(title, label, rows, total, width) {
  const numeric = 8;
  const nameWidth = Math.max(12, Math.min(40, width - COLUMNS.length * (numeric + 1)));
  const line = (name, values) => truncate(name, nameWidth).padEnd(nameWidth) + values.map((value) => ` ${value.padStart(numeric)}`).join("");
  return [
    { kind: "heading", text: title },
    { kind: "head", text: line(label, COLUMNS) },
    ...rows.map((row) => ({ kind: "row", text: line(row.key, cells(row.usage)) })),
    { kind: "total", text: line("total", cells(total)) }
  ];
}
function report(stats, title, width, live) {
  const { total } = stats;
  const family2 = stats.subagents === 0 ? "1 session, no subagents" : `${stats.sessions} sessions (1 root + ${stats.subagents} subagent${stats.subagents === 1 ? "" : "s"})`;
  return [
    { kind: "title", text: title },
    { kind: "muted", text: `${family2}${live ? " \xB7 still running" : ""}` },
    { kind: "blank", text: "" },
    { kind: "heading", text: `Total cost   ${formatCost(total.cost)}` },
    {
      kind: "row",
      text: `Total time   ${formatDuration(stats.wallMs)} wall-clock \xB7 ${formatDuration(total.ms)} model time (steps summed, parallel subagents overlap)`
    },
    {
      kind: "row",
      text: `Tokens       ${formatTokens(totalTokens(total))} total \xB7 ${formatTokens(total.input)} in \xB7 ${formatTokens(total.output)} out \xB7 ${formatTokens(total.reasoning)} reasoning \xB7 ${formatTokens(total.cacheRead)} cache read \xB7 ${formatTokens(total.cacheWrite)} cache write`
    },
    { kind: "blank", text: "" },
    ...table("By model", "model", stats.models, total, width),
    { kind: "blank", text: "" },
    ...table("By agent", "agent", stats.agents, total, width)
  ];
}

// src/settings.ts
var PLACEMENTS = ["sidebar", "footer", "both", "off"];
var DEFAULTS = { placement: "sidebar" };
var parseSettings = (value) => ({
  placement: PLACEMENTS.find((placement) => placement === value?.placement) ?? DEFAULTS.placement
});
var LABELS = {
  sidebar: {
    title: "Sidebar",
    description: "Replaces the built-in Context block (needs -opencode.sidebar.context, see README)"
  },
  footer: {
    title: "Prompt footer",
    description: "Adds the whole-session total next to the built-in usage in the prompt footer"
  },
  both: { title: "Sidebar and footer", description: "Show the total in both places" },
  off: { title: "Off", description: "Hide the total; /session-stats still works" }
};
async function openSettings(context, read, update) {
  const selected = await context.ui.dialog.select({
    title: "Session cost placement",
    current: read().placement,
    options: PLACEMENTS.map((placement) => ({
      title: LABELS[placement].title,
      value: placement,
      description: LABELS[placement].description
    }))
  });
  if (selected) await update({ placement: selected });
}

// src/usage.ts
function treeCost(data, sessionID) {
  const root = data.session.root(sessionID);
  const ids = /* @__PURE__ */ new Set([root, ...data.session.family(root)]);
  let cost = 0;
  let subagents = 0;
  for (const id of ids) {
    const info = data.session.get(id);
    if (!info) continue;
    cost += info.cost;
    if (id !== root) subagents += 1;
  }
  return { cost, subagents };
}
function contextUsage(messages, models, revertID) {
  let latest;
  for (const message of messages) {
    if (revertID && message.id === revertID) break;
    if (message.type === "assistant" && message.tokens) latest = message;
  }
  if (latest?.type !== "assistant" || !latest.tokens) return;
  const { input, output, reasoning, cache } = latest.tokens;
  const tokens = input + output + reasoning + cache.read + cache.write;
  if (tokens <= 0) return;
  const limit = models?.find(
    (model) => model.providerID === latest.model.providerID && model.id === latest.model.id
  )?.limit.context;
  return { tokens, percent: limit ? Math.round(tokens / limit * 100) : void 0 };
}

// src/tui.tsx
var DIALOG_WIDTH = 116;
function Sidebar(props) {
  const {
    context
  } = props;
  const theme = context.theme;
  const session = createMemo(() => context.data.session.get(props.sessionID));
  const usage = createMemo(() => contextUsage(context.data.session.message.list(props.sessionID), context.data.location.model.list(session()?.location), session()?.revert?.messageID));
  const total = createMemo(() => treeCost(context.data, props.sessionID));
  const [hover, setHover] = createSignal(false);
  return _$createComponent(Show, {
    get when() {
      return usage() || total().cost > 0;
    },
    get children() {
      var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$3 = _$createElement("b");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "flexShrink", 0);
      _$setProp(_el$, "onMouseOver", () => setHover(true));
      _$setProp(_el$, "onMouseOut", () => setHover(false));
      _$spread(_el$, _$mergeProps(() => clickable(props.onOpen)), true);
      _$insertNode(_el$2, _el$3);
      _$insertNode(_el$3, _$createTextNode(`Context`));
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return usage();
        },
        children: (value) => [(() => {
          var _el$10 = _$createElement("text"), _el$11 = _$createTextNode(` tokens`);
          _$insertNode(_el$10, _el$11);
          _$insert(_el$10, () => value().tokens.toLocaleString(), _el$11);
          _$effect((_$p) => _$setProp(_el$10, "fg", theme.text.muted, _$p));
          return _el$10;
        })(), _$createComponent(Show, {
          get when() {
            return value().percent !== void 0;
          },
          get children() {
            var _el$12 = _$createElement("text"), _el$13 = _$createTextNode(`% used`);
            _$insertNode(_el$12, _el$13);
            _$insert(_el$12, () => value().percent, _el$13);
            _$effect((_$p) => _$setProp(_el$12, "fg", theme.text.muted, _$p));
            return _el$12;
          }
        })]
      }), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return total().cost > 0;
        },
        get children() {
          return [(() => {
            var _el$5 = _$createElement("text"), _el$6 = _$createTextNode(` spent`);
            _$insertNode(_el$5, _el$6);
            _$insert(_el$5, () => formatCost(total().cost), _el$6);
            _$effect((_$p) => _$setProp(_el$5, "fg", theme.text.muted, _$p));
            return _el$5;
          })(), _$createComponent(Show, {
            get when() {
              return total().subagents > 0;
            },
            get children() {
              var _el$7 = _$createElement("text"), _el$8 = _$createTextNode(`incl. `), _el$9 = _$createTextNode(` subagent`);
              _$insertNode(_el$7, _el$8);
              _$insertNode(_el$7, _el$9);
              _$insert(_el$7, () => total().subagents, _el$9);
              _$insert(_el$7, () => total().subagents === 1 ? "" : "s", null);
              _$effect((_$p) => _$setProp(_el$7, "fg", theme.text.muted, _$p));
              return _el$7;
            }
          }), (() => {
            var _el$0 = _$createElement("text");
            _$insertNode(_el$0, _$createTextNode(`click for breakdown`));
            _$setProp(_el$0, "selectable", false);
            _$effect((_$p) => _$setProp(_el$0, "fg", hover() ? theme.text.base : theme.text.muted, _$p));
            return _el$0;
          })()];
        }
      }), null);
      _$effect((_$p) => _$setProp(_el$2, "fg", theme.text.base, _$p));
      return _el$;
    }
  });
}
function Footer(props) {
  const total = createMemo(() => treeCost(props.context.data, props.sessionID));
  return _$createComponent(Show, {
    get when() {
      return total().cost > 0;
    },
    get children() {
      var _el$14 = _$createElement("text"), _el$15 = _$createTextNode(`total `);
      _$insertNode(_el$14, _el$15);
      _$setProp(_el$14, "flexShrink", 0);
      _$setProp(_el$14, "wrapMode", "none");
      _$setProp(_el$14, "selectable", false);
      _$spread(_el$14, _$mergeProps({
        get fg() {
          return props.context.theme.text.muted;
        }
      }, () => clickable(props.onOpen)), true);
      _$insert(_el$14, () => formatCost(total().cost), null);
      return _el$14;
    }
  });
}
function Report(props) {
  const {
    context
  } = props;
  const theme = context.theme;
  const [state, setState] = createSignal({
    status: "loading"
  });
  const abort = new AbortController();
  onCleanup(() => abort.abort());
  collect(context, props.sessionID, abort.signal).then((value) => setState({
    status: "done",
    value
  }), (error) => {
    if (abort.signal.aborted) return;
    setState({
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  });
  const width = () => Math.max(40, Math.min(DIALOG_WIDTH, context.renderer.width - 2) - 6);
  const lines = createMemo(() => {
    const current = state();
    if (current.status !== "done") return [];
    const running = context.data.session.family(current.value.root).some((id) => context.data.session.status(id) === "running");
    return report(current.value.stats, current.value.title ?? "Session stats", width(), running);
  });
  const color = (kind) => kind === "head" || kind === "muted" ? theme.text.muted : theme.text.base;
  const bold = (kind) => kind === "title" || kind === "heading" || kind === "total";
  return (() => {
    var _el$16 = _$createElement("box"), _el$21 = _$createElement("scrollbox"), _el$22 = _$createElement("box"), _el$23 = _$createElement("text");
    _$insertNode(_el$16, _el$21);
    _$insertNode(_el$16, _el$23);
    _$setProp(_el$16, "flexDirection", "column");
    _$setProp(_el$16, "gap", 1);
    _$setProp(_el$16, "paddingLeft", 2);
    _$setProp(_el$16, "paddingRight", 2);
    _$setProp(_el$16, "paddingBottom", 1);
    _$insert(_el$16, _$createComponent(Show, {
      get when() {
        return state().status === "loading";
      },
      get children() {
        var _el$17 = _$createElement("text");
        _$insertNode(_el$17, _$createTextNode(`Gathering session stats\u2026`));
        _$effect((_$p) => _$setProp(_el$17, "fg", theme.text.muted, _$p));
        return _el$17;
      }
    }), _el$21);
    _$insert(_el$16, _$createComponent(Show, {
      get when() {
        return state().status === "error";
      },
      get children() {
        var _el$19 = _$createElement("text"), _el$20 = _$createTextNode(`Could not load stats: `);
        _$insertNode(_el$19, _el$20);
        _$insert(_el$19, () => state().message, null);
        _$effect((_$p) => _$setProp(_el$19, "fg", theme.text.feedback.error.base, _$p));
        return _el$19;
      }
    }), _el$21);
    _$insertNode(_el$21, _el$22);
    _$setProp(_el$22, "flexDirection", "column");
    _$setProp(_el$22, "flexShrink", 0);
    _$insert(_el$22, _$createComponent(For, {
      get each() {
        return lines();
      },
      children: (line) => (() => {
        var _el$25 = _$createElement("text");
        _$setProp(_el$25, "wrapMode", "word");
        _$setProp(_el$25, "selectable", true);
        _$insert(_el$25, (() => {
          var _c$ = _$memo(() => !!bold(line.kind));
          return () => _c$() ? (() => {
            var _el$26 = _$createElement("b");
            _$insert(_el$26, () => line.text || " ");
            return _el$26;
          })() : line.text || " ";
        })());
        _$effect((_$p) => _$setProp(_el$25, "fg", color(line.kind), _$p));
        return _el$25;
      })()
    }));
    _$insertNode(_el$23, _$createTextNode(`esc close`));
    _$effect((_p$) => {
      var _v$ = Math.max(6, context.renderer.height - 10), _v$2 = theme.text.muted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$21, "maxHeight", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$23, "fg", _v$2, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$16;
  })();
}
var tui_default = Plugin.define({
  id: "opencode-cost-stats",
  setup(context) {
    const [stored, mutate] = context.storage.store("settings", {
      initial: DEFAULTS
    });
    const settings = () => parseSettings(stored);
    const openReport = (sessionID) => {
      context.ui.dialog.set({
        size: "xlarge",
        centered: true
      });
      context.ui.dialog.show(() => _$createComponent(Report, {
        context,
        sessionID
      }));
    };
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "opencode-cost-stats.show",
        title: "Session stats (tokens, cost and time by model and agent)",
        group: "Session",
        palette: true,
        slash: {
          name: "session-stats"
        },
        run() {
          const route = context.ui.router.current();
          if (route.type !== "session") {
            context.ui.toast.show({
              message: "Open a session first.",
              variant: "warning"
            });
            return;
          }
          openReport(route.sessionID);
        }
      }, {
        id: "opencode-cost-stats.settings",
        title: "Session cost placement",
        group: "Session",
        palette: true,
        run: () => void openSettings(context, settings, (change) => mutate((draft) => {
          draft.placement = change.placement;
        }))
      }]
    }));
    const sidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => _$createComponent(Show, {
        get when() {
          return ["sidebar", "both"].includes(settings().placement);
        },
        get children() {
          return _$createComponent(Sidebar, {
            context,
            get sessionID() {
              return props.sessionID;
            },
            onOpen: () => openReport(props.sessionID)
          });
        }
      })
    });
    const footer = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) => _$createComponent(Show, {
        get when() {
          return _$memo(() => !!["footer", "both"].includes(settings().placement))() && props.sessionID;
        },
        keyed: true,
        children: (sessionID) => _$createComponent(Footer, {
          context,
          sessionID,
          onOpen: () => openReport(sessionID)
        })
      })
    });
    return () => {
      sidebar();
      footer();
    };
  }
});
export {
  tui_default as default
};
