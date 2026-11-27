// src/tui.tsx
import { effect as _$effect2 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { spread as _$spread2 } from "@opentui/solid";
import { mergeProps as _$mergeProps2 } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { memo as _$memo2 } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createMemo as createMemo2, createSignal as createSignal2, Show as Show2 } from "solid-js";

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
function formatPercent(fraction) {
  const percent = fraction * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${percent < 10 && percent > 0 ? percent.toFixed(1).replace(".0", "") : Math.round(percent)}%`;
}
function segmentWidths(values, width) {
  const positive = values.filter((value) => value > 0);
  const total = positive.reduce((sum, value) => sum + value, 0);
  let remaining = positive.length;
  const minimum = width >= remaining ? 1 : 0;
  let cumulative = 0;
  let used = 0;
  return values.map((value) => {
    if (!(value > 0)) return 0;
    cumulative += value;
    remaining -= 1;
    const boundary = Math.round(cumulative / total * width);
    const end = Math.min(width - remaining * minimum, Math.max(used + minimum, boundary));
    const cells = end - used;
    used = end;
    return cells;
  });
}

// src/report.tsx
import { spread as _$spread } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

// src/stats.ts
var emptyUsage = () => ({
  steps: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  unpriced: 0,
  ms: 0
});
var totalTokens = (usage) => usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite;
function cacheHitRate(usage) {
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  return prompt > 0 ? usage.cacheRead / prompt : void 0;
}
var stepTokens = (tokens) => tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
function pricing(usage) {
  if (usage.unpriced === 0) return "priced";
  return usage.cost > 0 ? "partial" : "sub";
}
function add(usage, step, now) {
  usage.steps += 1;
  usage.input += step.tokens?.input ?? 0;
  usage.output += step.tokens?.output ?? 0;
  usage.reasoning += step.tokens?.reasoning ?? 0;
  usage.cacheRead += step.tokens?.cache.read ?? 0;
  usage.cacheWrite += step.tokens?.cache.write ?? 0;
  usage.cost += step.cost ?? 0;
  if (!step.cost && step.tokens && stepTokens(step.tokens) > 0) usage.unpriced += 1;
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
      // The cursor already encodes the direction, and the server rejects it combined with `order`.
      { sessionID, type: "assistant", limit: PAGE, ...cursor ? { cursor } : { order: "asc" } },
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

// src/report.tsx
var PALETTE_STEPS = [400, 600, 300, 700, 500, 200, 800];
function Report(props) {
  const {
    context
  } = props;
  const theme = context.theme.surface("dialog");
  const [state, setState] = createSignal({
    status: "loading"
  });
  const [closeHover, setCloseHover] = createSignal(false);
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
  const done = () => {
    const current = state();
    return current.status === "done" ? current.value : void 0;
  };
  const palette = (index) => {
    const count = theme.categorical.length;
    if (count === 0) return theme.text.base;
    const scale = theme.categorical[index % count];
    const step = PALETTE_STEPS[Math.floor(index / count) % PALETTE_STEPS.length] ?? 400;
    return scale?.[step] ?? theme.text.base;
  };
  const running = () => {
    const value = done();
    return value !== void 0 && context.data.session.family(value.root).some((id) => context.data.session.status(id) === "running");
  };
  const Card = (card) => (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$3 = _$createElement("text"), _el$4 = _$createElement("b"), _el$5 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$insertNode(_el$, _el$5);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "flexGrow", 1);
    _$setProp(_el$, "flexBasis", 0);
    _$setProp(_el$, "paddingLeft", 1);
    _$setProp(_el$, "paddingRight", 1);
    _$setProp(_el$, "border", true);
    _$setProp(_el$, "borderStyle", "rounded");
    _$setProp(_el$2, "wrapMode", "none");
    _$insert(_el$2, () => card.label);
    _$insertNode(_el$3, _el$4);
    _$setProp(_el$3, "wrapMode", "none");
    _$insert(_el$4, () => card.value);
    _$setProp(_el$5, "wrapMode", "none");
    _$setProp(_el$5, "truncate", true);
    _$insert(_el$5, () => card.detail);
    _$effect((_p$) => {
      var _v$ = theme.border.base, _v$2 = theme.text.muted, _v$3 = card.color, _v$4 = theme.text.muted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "borderColor", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$2, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$3, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$5, "fg", _v$4, _p$.o));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    });
    return _el$;
  })();
  const Heading = (heading) => (() => {
    var _el$6 = _$createElement("box"), _el$7 = _$createElement("text"), _el$8 = _$createElement("b");
    _$insertNode(_el$6, _el$7);
    _$setProp(_el$6, "flexDirection", "row");
    _$setProp(_el$6, "justifyContent", "space-between");
    _$setProp(_el$6, "flexShrink", 0);
    _$insertNode(_el$7, _el$8);
    _$setProp(_el$7, "wrapMode", "none");
    _$insert(_el$8, () => heading.children);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return heading.hint;
      },
      get children() {
        var _el$9 = _$createElement("text");
        _$setProp(_el$9, "wrapMode", "none");
        _$insert(_el$9, () => heading.hint);
        _$effect((_$p) => _$setProp(_el$9, "fg", theme.text.faint, _$p));
        return _el$9;
      }
    }), null);
    _$effect((_$p) => _$setProp(_el$7, "fg", theme.text.base, _$p));
    return _el$6;
  })();
  const Breakdown = (section) => {
    const [width, setWidth] = createSignal(0);
    const isCost = () => section.metric === "cost";
    const values = createMemo(() => section.rows.map(({
      usage
    }) => isCost() ? usage.cost : totalTokens(usage)));
    const total = createMemo(() => values().reduce((sum, value) => sum + value, 0));
    const widths = createMemo(() => segmentWidths(values(), width()));
    const hint = () => total() > 0 ? isCost() ? formatCost(total()) : `${formatTokens(total())} tokens` : `No ${section.metric} recorded`;
    return (() => {
      var _el$0 = _$createElement("box"), _el$1 = _$createElement("box"), _el$10 = _$createElement("box");
      _$insertNode(_el$0, _el$1);
      _$insertNode(_el$0, _el$10);
      _$setProp(_el$0, "flexDirection", "column");
      _$setProp(_el$0, "flexShrink", 0);
      _$insert(_el$0, _$createComponent(Heading, {
        get hint() {
          return hint();
        },
        get children() {
          return section.title;
        }
      }), _el$1);
      _$setProp(_el$1, "flexDirection", "row");
      _$setProp(_el$1, "flexShrink", 0);
      _$setProp(_el$1, "height", 1);
      _$setProp(_el$1, "onSizeChange", function() {
        setWidth(this.width);
      });
      _$insert(_el$1, _$createComponent(For, {
        get each() {
          return section.rows;
        },
        children: (_, index) => _$createComponent(Show, {
          get when() {
            return widths()[index()];
          },
          children: (cells) => (() => {
            var _el$11 = _$createElement("box");
            _$setProp(_el$11, "flexShrink", 0);
            _$effect((_p$) => {
              var _v$5 = cells(), _v$6 = palette(index());
              _v$5 !== _p$.e && (_p$.e = _$setProp(_el$11, "width", _v$5, _p$.e));
              _v$6 !== _p$.t && (_p$.t = _$setProp(_el$11, "backgroundColor", _v$6, _p$.t));
              return _p$;
            }, {
              e: void 0,
              t: void 0
            });
            return _el$11;
          })()
        })
      }));
      _$setProp(_el$10, "flexDirection", "row");
      _$setProp(_el$10, "flexWrap", "wrap");
      _$setProp(_el$10, "columnGap", 2);
      _$setProp(_el$10, "flexShrink", 0);
      _$insert(_el$10, _$createComponent(For, {
        get each() {
          return section.rows;
        },
        children: (row, index) => {
          const detail = () => {
            const value = values()[index()] ?? 0;
            const kind = isCost() ? pricing(row.usage) : void 0;
            if (kind === "sub") return "(sub)";
            const amount = isCost() ? formatCost(value) : formatTokens(value);
            const label = kind === "partial" ? `${amount}+` : amount;
            return total() > 0 ? `${label} ${formatPercent(value / total())}` : label;
          };
          return (() => {
            var _el$12 = _$createElement("text"), _el$13 = _$createElement("span"), _el$14 = _$createTextNode(`\u25A0 `), _el$15 = _$createTextNode(` `);
            _$insertNode(_el$12, _el$13);
            _$insertNode(_el$12, _el$15);
            _$setProp(_el$12, "maxWidth", "100%");
            _$setProp(_el$12, "wrapMode", "char");
            _$insertNode(_el$13, _el$14);
            _$insert(_el$13, () => row.key, null);
            _$insert(_el$12, detail, null);
            _$effect((_p$) => {
              var _v$7 = theme.text.muted, _v$8 = {
                fg: palette(index())
              };
              _v$7 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$7, _p$.e));
              _v$8 !== _p$.t && (_p$.t = _$setProp(_el$13, "style", _v$8, _p$.t));
              return _p$;
            }, {
              e: void 0,
              t: void 0
            });
            return _el$12;
          })();
        }
      }));
      _$effect((_$p) => _$setProp(_el$1, "backgroundColor", theme.background.raised.high, _$p));
      return _el$0;
    })();
  };
  const Body = (body) => {
    const stats = () => body.value.stats;
    const hit = () => cacheHitRate(stats().total);
    return (() => {
      var _el$16 = _$createElement("box"), _el$17 = _$createElement("box"), _el$20 = _$createElement("text");
      _$insertNode(_el$16, _el$17);
      _$insertNode(_el$16, _el$20);
      _$setProp(_el$16, "flexDirection", "column");
      _$setProp(_el$16, "gap", 1);
      _$setProp(_el$16, "flexShrink", 0);
      _$setProp(_el$17, "flexDirection", "row");
      _$setProp(_el$17, "columnGap", 1);
      _$setProp(_el$17, "flexShrink", 0);
      _$insert(_el$17, _$createComponent(Card, {
        label: "Total cost",
        get value() {
          return formatCost(stats().total.cost);
        },
        get detail() {
          return _$memo(() => stats().total.unpriced > 0)() ? `excl. ${stats().total.unpriced} (sub) steps` : `${stats().total.steps} steps`;
        },
        get color() {
          return theme.text.feedback.success.base;
        }
      }), null);
      _$insert(_el$17, _$createComponent(Card, {
        label: "Wall-clock",
        get value() {
          return formatDuration(stats().wallMs);
        },
        get detail() {
          return `${formatDuration(stats().total.ms)} model time`;
        },
        get color() {
          return theme.hue.interactive[400];
        }
      }), null);
      _$insert(_el$17, _$createComponent(Card, {
        label: "Tokens",
        get value() {
          return formatTokens(totalTokens(stats().total));
        },
        get detail() {
          return `${formatTokens(stats().total.input)} in \xB7 ${formatTokens(stats().total.output)} out`;
        },
        get color() {
          return theme.hue.accent[400];
        }
      }), null);
      _$insert(_el$17, _$createComponent(Card, {
        label: "Cache hit rate",
        get value() {
          return _$memo(() => hit() === void 0)() ? "\u2013" : formatPercent(hit() ?? 0);
        },
        get detail() {
          return `${formatTokens(stats().total.cacheRead)} cached`;
        },
        get color() {
          return theme.text.feedback.warning.base;
        }
      }), null);
      _$insert(_el$16, _$createComponent(Breakdown, {
        title: "Tokens by model",
        get rows() {
          return stats().models;
        },
        metric: "tokens"
      }), _el$20);
      _$insert(_el$16, _$createComponent(Breakdown, {
        title: "Tokens by agent",
        get rows() {
          return stats().agents;
        },
        metric: "tokens"
      }), _el$20);
      _$insert(_el$16, _$createComponent(Breakdown, {
        title: "Cost by model",
        get rows() {
          return stats().models;
        },
        metric: "cost"
      }), _el$20);
      _$insert(_el$16, _$createComponent(Breakdown, {
        title: "Cost by agent",
        get rows() {
          return stats().agents;
        },
        metric: "cost"
      }), _el$20);
      _$insert(_el$16, _$createComponent(Show, {
        get when() {
          return stats().total.unpriced > 0;
        },
        get children() {
          var _el$18 = _$createElement("text");
          _$insertNode(_el$18, _$createTextNode(`(sub) means no per-token price is recorded, for example a model used through a ChatGPT subscription. Those steps are not in the cost total; a + after a cost means some steps were left out.`));
          _$setProp(_el$18, "wrapMode", "word");
          _$effect((_$p) => _$setProp(_el$18, "fg", theme.text.faint, _$p));
          return _el$18;
        }
      }), _el$20);
      _$insertNode(_el$20, _$createTextNode(`Model time adds up every step, so parallel subagents overlap and it can exceed wall-clock time.`));
      _$setProp(_el$20, "wrapMode", "word");
      _$effect((_$p) => _$setProp(_el$20, "fg", theme.text.faint, _$p));
      return _el$16;
    })();
  };
  return (() => {
    var _el$22 = _$createElement("box"), _el$23 = _$createElement("box"), _el$24 = _$createElement("box"), _el$25 = _$createElement("text"), _el$26 = _$createElement("b"), _el$27 = _$createElement("text");
    _$insertNode(_el$22, _el$23);
    _$setProp(_el$22, "flexDirection", "column");
    _$setProp(_el$22, "gap", 1);
    _$setProp(_el$22, "paddingLeft", 2);
    _$setProp(_el$22, "paddingRight", 2);
    _$setProp(_el$22, "paddingBottom", 1);
    _$insertNode(_el$23, _el$24);
    _$insertNode(_el$23, _el$27);
    _$setProp(_el$23, "flexDirection", "row");
    _$setProp(_el$23, "justifyContent", "space-between");
    _$setProp(_el$23, "flexShrink", 0);
    _$insertNode(_el$24, _el$25);
    _$setProp(_el$24, "flexDirection", "column");
    _$setProp(_el$24, "flexShrink", 1);
    _$insertNode(_el$25, _el$26);
    _$setProp(_el$25, "wrapMode", "none");
    _$setProp(_el$25, "truncate", true);
    _$insert(_el$26, () => done()?.title ?? "Session stats");
    _$insert(_el$24, _$createComponent(Show, {
      get when() {
        return done();
      },
      children: (value) => (() => {
        var _el$33 = _$createElement("text");
        _$setProp(_el$33, "wrapMode", "none");
        _$insert(_el$33, (() => {
          var _c$ = _$memo(() => value().stats.subagents === 0);
          return () => _c$() ? "1 session, no subagents" : `${value().stats.sessions} sessions \xB7 1 root + ${value().stats.subagents} subagent${value().stats.subagents === 1 ? "" : "s"}`;
        })(), null);
        _$insert(_el$33, _$createComponent(Show, {
          get when() {
            return running();
          },
          get children() {
            var _el$34 = _$createElement("span");
            _$insertNode(_el$34, _$createTextNode(` \u25CF running`));
            _$effect((_$p) => _$setProp(_el$34, "style", {
              fg: theme.text.feedback.success.base
            }, _$p));
            return _el$34;
          }
        }), null);
        _$effect((_$p) => _$setProp(_el$33, "fg", theme.text.muted, _$p));
        return _el$33;
      })()
    }), null);
    _$insertNode(_el$27, _$createTextNode(`esc close`));
    _$setProp(_el$27, "wrapMode", "none");
    _$setProp(_el$27, "flexShrink", 0);
    _$setProp(_el$27, "alignSelf", "flex-start");
    _$setProp(_el$27, "selectable", false);
    _$setProp(_el$27, "onMouseOver", () => setCloseHover(true));
    _$setProp(_el$27, "onMouseOut", () => setCloseHover(false));
    _$spread(_el$27, _$mergeProps({
      get fg() {
        return _$memo(() => !!closeHover())() ? theme.text.feedback.info.base : theme.text.muted;
      }
    }, () => clickable(() => context.ui.dialog.clear())), true);
    _$insert(_el$22, _$createComponent(Show, {
      get when() {
        return state().status === "loading";
      },
      get children() {
        var _el$29 = _$createElement("text");
        _$insertNode(_el$29, _$createTextNode(`Gathering session stats\u2026`));
        _$effect((_$p) => _$setProp(_el$29, "fg", theme.text.muted, _$p));
        return _el$29;
      }
    }), null);
    _$insert(_el$22, _$createComponent(Show, {
      get when() {
        return state().status === "error";
      },
      get children() {
        var _el$31 = _$createElement("text"), _el$32 = _$createTextNode(`Could not load stats: `);
        _$insertNode(_el$31, _el$32);
        _$insert(_el$31, () => state().message, null);
        _$effect((_$p) => _$setProp(_el$31, "fg", theme.text.feedback.error.base, _$p));
        return _el$31;
      }
    }), null);
    _$insert(_el$22, _$createComponent(Show, {
      get when() {
        return done();
      },
      children: (value) => (() => {
        var _el$36 = _$createElement("scrollbox");
        _$insert(_el$36, _$createComponent(Body, {
          get value() {
            return value();
          }
        }));
        _$effect((_$p) => _$setProp(_el$36, "maxHeight", Math.max(8, context.renderer.height - 10), _$p));
        return _el$36;
      })()
    }), null);
    _$effect((_$p) => _$setProp(_el$25, "fg", theme.text.base, _$p));
    return _el$22;
  })();
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
function Sidebar(props) {
  const {
    context
  } = props;
  const theme = context.theme;
  const session = createMemo2(() => context.data.session.get(props.sessionID));
  const usage = createMemo2(() => contextUsage(context.data.session.message.list(props.sessionID), context.data.location.model.list(session()?.location), session()?.revert?.messageID));
  const total = createMemo2(() => treeCost(context.data, props.sessionID));
  const [hover, setHover] = createSignal2(false);
  const body = () => hover() ? theme.text.base : theme.text.muted;
  return _$createComponent2(Show2, {
    get when() {
      return usage() || total().cost > 0;
    },
    get children() {
      var _el$ = _$createElement2("box"), _el$2 = _$createElement2("box"), _el$3 = _$createElement2("text"), _el$4 = _$createElement2("b"), _el$6 = _$createElement2("text");
      _$insertNode2(_el$, _el$2);
      _$setProp2(_el$, "flexDirection", "column");
      _$setProp2(_el$, "flexShrink", 0);
      _$setProp2(_el$, "onMouseOver", () => setHover(true));
      _$setProp2(_el$, "onMouseOut", () => setHover(false));
      _$spread2(_el$, _$mergeProps2(() => clickable(props.onOpen)), true);
      _$insertNode2(_el$2, _el$3);
      _$insertNode2(_el$2, _el$6);
      _$setProp2(_el$2, "flexDirection", "row");
      _$setProp2(_el$2, "justifyContent", "space-between");
      _$setProp2(_el$2, "flexShrink", 0);
      _$insertNode2(_el$3, _el$4);
      _$setProp2(_el$3, "selectable", false);
      _$insertNode2(_el$4, _$createTextNode2(`Context`));
      _$insertNode2(_el$6, _$createTextNode2(`[+]`));
      _$setProp2(_el$6, "wrapMode", "none");
      _$setProp2(_el$6, "selectable", false);
      _$insert2(_el$, _$createComponent2(Show2, {
        get when() {
          return usage();
        },
        children: (value) => [(() => {
          var _el$11 = _$createElement2("text"), _el$12 = _$createTextNode2(` tokens`);
          _$insertNode2(_el$11, _el$12);
          _$setProp2(_el$11, "selectable", false);
          _$insert2(_el$11, () => value().tokens.toLocaleString(), _el$12);
          _$effect2((_$p) => _$setProp2(_el$11, "fg", body(), _$p));
          return _el$11;
        })(), _$createComponent2(Show2, {
          get when() {
            return value().percent !== void 0;
          },
          get children() {
            var _el$13 = _$createElement2("text"), _el$14 = _$createTextNode2(`% used`);
            _$insertNode2(_el$13, _el$14);
            _$setProp2(_el$13, "selectable", false);
            _$insert2(_el$13, () => value().percent, _el$14);
            _$effect2((_$p) => _$setProp2(_el$13, "fg", body(), _$p));
            return _el$13;
          }
        })]
      }), null);
      _$insert2(_el$, _$createComponent2(Show2, {
        get when() {
          return total().cost > 0;
        },
        get children() {
          return [(() => {
            var _el$8 = _$createElement2("text"), _el$9 = _$createTextNode2(` spent`);
            _$insertNode2(_el$8, _el$9);
            _$setProp2(_el$8, "selectable", false);
            _$insert2(_el$8, () => formatCost(total().cost), _el$9);
            _$effect2((_$p) => _$setProp2(_el$8, "fg", body(), _$p));
            return _el$8;
          })(), _$createComponent2(Show2, {
            get when() {
              return total().subagents > 0;
            },
            get children() {
              var _el$0 = _$createElement2("text"), _el$1 = _$createTextNode2(`incl. `), _el$10 = _$createTextNode2(` subagent`);
              _$insertNode2(_el$0, _el$1);
              _$insertNode2(_el$0, _el$10);
              _$setProp2(_el$0, "selectable", false);
              _$insert2(_el$0, () => total().subagents, _el$10);
              _$insert2(_el$0, () => total().subagents === 1 ? "" : "s", null);
              _$effect2((_$p) => _$setProp2(_el$0, "fg", body(), _$p));
              return _el$0;
            }
          })];
        }
      }), null);
      _$effect2((_p$) => {
        var _v$ = theme.text.base, _v$2 = hover() ? theme.text.feedback.info.base : theme.text.muted;
        _v$ !== _p$.e && (_p$.e = _$setProp2(_el$3, "fg", _v$, _p$.e));
        _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$6, "fg", _v$2, _p$.t));
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$;
    }
  });
}
function Footer(props) {
  const theme = props.context.theme;
  const total = createMemo2(() => treeCost(props.context.data, props.sessionID));
  const [hover, setHover] = createSignal2(false);
  return _$createComponent2(Show2, {
    get when() {
      return total().cost > 0;
    },
    get children() {
      var _el$15 = _$createElement2("text"), _el$16 = _$createTextNode2(`total `), _el$17 = _$createTextNode2(` `), _el$18 = _$createElement2("span");
      _$insertNode2(_el$15, _el$16);
      _$insertNode2(_el$15, _el$17);
      _$insertNode2(_el$15, _el$18);
      _$setProp2(_el$15, "flexShrink", 0);
      _$setProp2(_el$15, "wrapMode", "none");
      _$setProp2(_el$15, "selectable", false);
      _$setProp2(_el$15, "onMouseOver", () => setHover(true));
      _$setProp2(_el$15, "onMouseOut", () => setHover(false));
      _$spread2(_el$15, _$mergeProps2({
        get fg() {
          return _$memo2(() => !!hover())() ? theme.text.base : theme.text.muted;
        }
      }, () => clickable(props.onOpen)), true);
      _$insert2(_el$15, () => formatCost(total().cost), _el$17);
      _$insertNode2(_el$18, _$createTextNode2(`[+]`));
      _$effect2((_$p) => _$setProp2(_el$18, "style", {
        fg: hover() ? theme.text.feedback.info.base : theme.text.muted
      }, _$p));
      return _el$15;
    }
  });
}
var tui_default = Plugin.define({
  id: "opencode-cost-stats",
  setup(context) {
    const [stored, mutate] = context.storage.store("settings", {
      initial: DEFAULTS
    });
    const settings = () => parseSettings(stored);
    const openReport = (sessionID) => {
      context.ui.dialog.show(() => _$createComponent2(Report, {
        context,
        sessionID
      }));
      context.ui.dialog.set({
        size: "xlarge",
        centered: true
      });
    };
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "opencode-cost-stats.show",
        title: "Session stats (tokens and cost by model and agent)",
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
      render: (props) => _$createComponent2(Show2, {
        get when() {
          return ["sidebar", "both"].includes(settings().placement);
        },
        get children() {
          return _$createComponent2(Sidebar, {
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
      render: (props) => _$createComponent2(Show2, {
        get when() {
          return _$memo2(() => !!["footer", "both"].includes(settings().placement))() && props.sessionID;
        },
        keyed: true,
        children: (sessionID) => _$createComponent2(Footer, {
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
