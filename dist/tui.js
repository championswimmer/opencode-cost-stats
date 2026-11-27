// src/tui.tsx
import { effect as _$effect2 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { spread as _$spread } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
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
var EIGHTHS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];
function bar(fraction, width) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  let eighths = Math.round(clamped * width * 8);
  if (clamped > 0 && eighths === 0) eighths = 1;
  const whole = Math.floor(eighths / 8);
  const part = whole < width ? EIGHTHS[eighths % 8] ?? "" : "";
  return {
    filled: "\u2588".repeat(whole) + part,
    empty: "\u2591".repeat(Math.max(0, width - whole - (part ? 1 : 0)))
  };
}

// src/report.tsx
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
  ms: 0
});
var totalTokens = (usage) => usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite;
function cacheHitRate(usage) {
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  return prompt > 0 ? usage.cacheRead / prompt : void 0;
}
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
var BAR_WIDTH = 22;
var METRICS = ["cost", "tokens", "time"];
var METRIC_LABEL = {
  cost: "share of cost",
  tokens: "share of tokens",
  time: "share of model time"
};
function metricValue(usage, metric) {
  return metric === "cost" ? usage.cost : metric === "tokens" ? totalTokens(usage) : usage.ms;
}
function Report(props) {
  const {
    context
  } = props;
  const theme = context.theme.surface("dialog");
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
  const [chosen, setChosen] = createSignal();
  const done = () => {
    const current = state();
    return current.status === "done" ? current.value : void 0;
  };
  const metric = () => chosen() ?? ((done()?.stats.total.cost ?? 0) > 0 ? "cost" : "tokens");
  context.keymap.layer(() => ({
    mode: "modal",
    commands: [{
      id: "opencode-cost-stats.metric",
      title: "Switch the breakdown bars between cost, tokens and time",
      bind: "m",
      run: () => {
        setChosen(METRICS[(METRICS.indexOf(metric()) + 1) % METRICS.length]);
      }
    }]
  }));
  const palette = (index) => {
    const scale = theme.categorical[index % theme.categorical.length];
    return scale?.[400] ?? theme.text.base;
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
  const TokenMix = (mix) => {
    const parts = createMemo(() => {
      const {
        usage
      } = mix;
      return [{
        label: "cache read",
        value: usage.cacheRead,
        color: theme.hue.interactive[400]
      }, {
        label: "cache write",
        value: usage.cacheWrite,
        color: theme.text.feedback.warning.base
      }, {
        label: "input",
        value: usage.input,
        color: theme.text.feedback.info.base
      }, {
        label: "output",
        value: usage.output,
        color: theme.text.feedback.success.base
      }, {
        label: "reasoning",
        value: usage.reasoning,
        color: theme.hue.accent[400]
      }];
    });
    const total = () => totalTokens(mix.usage);
    return (() => {
      var _el$0 = _$createElement("box"), _el$1 = _$createElement("box"), _el$10 = _$createElement("box");
      _$insertNode(_el$0, _el$1);
      _$insertNode(_el$0, _el$10);
      _$setProp(_el$0, "flexDirection", "column");
      _$setProp(_el$0, "flexShrink", 0);
      _$insert(_el$0, _$createComponent(Heading, {
        get hint() {
          return `${formatTokens(total())} tokens`;
        },
        children: "Token mix"
      }), _el$1);
      _$setProp(_el$1, "flexDirection", "row");
      _$setProp(_el$1, "height", 1);
      _$setProp(_el$1, "flexShrink", 0);
      _$insert(_el$1, _$createComponent(For, {
        get each() {
          return parts().filter((part) => part.value > 0);
        },
        children: (part) => (() => {
          var _el$11 = _$createElement("box");
          _$setProp(_el$11, "flexBasis", 0);
          _$setProp(_el$11, "minWidth", 1);
          _$setProp(_el$11, "height", 1);
          _$effect((_p$) => {
            var _v$5 = part.value, _v$6 = part.color;
            _v$5 !== _p$.e && (_p$.e = _$setProp(_el$11, "flexGrow", _v$5, _p$.e));
            _v$6 !== _p$.t && (_p$.t = _$setProp(_el$11, "backgroundColor", _v$6, _p$.t));
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$11;
        })()
      }));
      _$setProp(_el$10, "flexDirection", "row");
      _$setProp(_el$10, "flexWrap", "wrap");
      _$setProp(_el$10, "columnGap", 2);
      _$setProp(_el$10, "flexShrink", 0);
      _$insert(_el$10, _$createComponent(For, {
        get each() {
          return parts().filter((part) => part.value > 0);
        },
        children: (part) => (() => {
          var _el$12 = _$createElement("text"), _el$13 = _$createElement("span"), _el$15 = _$createTextNode(` `), _el$16 = _$createTextNode(` `);
          _$insertNode(_el$12, _el$13);
          _$insertNode(_el$12, _el$15);
          _$insertNode(_el$12, _el$16);
          _$setProp(_el$12, "wrapMode", "none");
          _$insertNode(_el$13, _$createTextNode(`\u25A0 `));
          _$insert(_el$12, () => part.label, _el$15);
          _$insert(_el$12, () => formatTokens(part.value), _el$16);
          _$insert(_el$12, () => formatPercent(part.value / total()), null);
          _$effect((_p$) => {
            var _v$7 = theme.text.muted, _v$8 = {
              fg: part.color
            };
            _v$7 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$7, _p$.e));
            _v$8 !== _p$.t && (_p$.t = _$setProp(_el$13, "style", _v$8, _p$.t));
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$12;
        })()
      }));
      return _el$0;
    })();
  };
  const Breakdown = (section) => {
    const share = (usage) => {
      const total = metricValue(section.total, metric());
      return total > 0 ? metricValue(usage, metric()) / total : 0;
    };
    return (() => {
      var _el$17 = _$createElement("box");
      _$setProp(_el$17, "flexDirection", "column");
      _$setProp(_el$17, "flexShrink", 0);
      _$insert(_el$17, _$createComponent(Heading, {
        get hint() {
          return `${METRIC_LABEL[metric()]} \xB7 m to switch`;
        },
        get children() {
          return section.title;
        }
      }), null);
      _$insert(_el$17, _$createComponent(For, {
        get each() {
          return section.rows;
        },
        children: (row, index) => {
          const color = () => palette(index());
          const parts = () => bar(share(row.usage), BAR_WIDTH);
          return (() => {
            var _el$18 = _$createElement("box"), _el$19 = _$createElement("box"), _el$20 = _$createElement("text"), _el$22 = _$createElement("text"), _el$23 = _$createElement("b"), _el$24 = _$createElement("text"), _el$25 = _$createElement("text"), _el$26 = _$createElement("span"), _el$27 = _$createElement("span"), _el$28 = _$createElement("text"), _el$29 = _$createElement("text"), _el$30 = _$createTextNode(` step`), _el$31 = _$createTextNode(` \xB7 `), _el$33 = _$createTextNode(` \xB7 in `), _el$34 = _$createTextNode(` \xB7 out `), _el$36 = _$createTextNode(` \xB7 reasoning `), _el$37 = _$createTextNode(` \xB7 cache `), _el$38 = _$createTextNode(` read / `), _el$40 = _$createTextNode(` write`);
            _$insertNode(_el$18, _el$19);
            _$insertNode(_el$18, _el$29);
            _$setProp(_el$18, "flexDirection", "column");
            _$setProp(_el$18, "flexShrink", 0);
            _$setProp(_el$18, "paddingTop", 1);
            _$insertNode(_el$19, _el$20);
            _$insertNode(_el$19, _el$22);
            _$insertNode(_el$19, _el$24);
            _$insertNode(_el$19, _el$25);
            _$insertNode(_el$19, _el$28);
            _$setProp(_el$19, "flexDirection", "row");
            _$setProp(_el$19, "flexShrink", 0);
            _$setProp(_el$19, "columnGap", 1);
            _$insertNode(_el$20, _$createTextNode(`\u25A0`));
            _$setProp(_el$20, "wrapMode", "none");
            _$setProp(_el$20, "flexShrink", 0);
            _$insertNode(_el$22, _el$23);
            _$setProp(_el$22, "wrapMode", "none");
            _$setProp(_el$22, "truncate", true);
            _$setProp(_el$22, "flexGrow", 1);
            _$setProp(_el$22, "flexShrink", 1);
            _$insert(_el$23, () => row.key);
            _$setProp(_el$24, "wrapMode", "none");
            _$setProp(_el$24, "flexShrink", 0);
            _$insert(_el$24, () => formatCost(row.usage.cost).padStart(8));
            _$insertNode(_el$25, _el$26);
            _$insertNode(_el$25, _el$27);
            _$setProp(_el$25, "wrapMode", "none");
            _$setProp(_el$25, "flexShrink", 0);
            _$setProp(_el$25, "selectable", false);
            _$insert(_el$26, () => parts().filled);
            _$insert(_el$27, () => parts().empty);
            _$setProp(_el$28, "wrapMode", "none");
            _$setProp(_el$28, "flexShrink", 0);
            _$insert(_el$28, () => formatPercent(share(row.usage)).padStart(4));
            _$insertNode(_el$29, _el$30);
            _$insertNode(_el$29, _el$31);
            _$insertNode(_el$29, _el$33);
            _$insertNode(_el$29, _el$34);
            _$insertNode(_el$29, _el$36);
            _$insertNode(_el$29, _el$37);
            _$insertNode(_el$29, _el$38);
            _$insertNode(_el$29, _el$40);
            _$setProp(_el$29, "wrapMode", "none");
            _$setProp(_el$29, "truncate", true);
            _$setProp(_el$29, "paddingLeft", 2);
            _$insert(_el$29, () => row.usage.steps, _el$30);
            _$insert(_el$29, () => row.usage.steps === 1 ? "" : "s", _el$31);
            _$insert(_el$29, () => formatDuration(row.usage.ms), _el$33);
            _$insert(_el$29, () => formatTokens(row.usage.input), _el$34);
            _$insert(_el$29, () => formatTokens(row.usage.output), _el$36);
            _$insert(_el$29, () => formatTokens(row.usage.reasoning), _el$37);
            _$insert(_el$29, () => formatTokens(row.usage.cacheRead), _el$38);
            _$insert(_el$29, () => formatTokens(row.usage.cacheWrite), _el$40);
            _$effect((_p$) => {
              var _v$9 = color(), _v$0 = theme.text.base, _v$1 = theme.text.base, _v$10 = {
                fg: color()
              }, _v$11 = {
                fg: theme.text.faint
              }, _v$12 = theme.text.muted, _v$13 = theme.text.muted;
              _v$9 !== _p$.e && (_p$.e = _$setProp(_el$20, "fg", _v$9, _p$.e));
              _v$0 !== _p$.t && (_p$.t = _$setProp(_el$22, "fg", _v$0, _p$.t));
              _v$1 !== _p$.a && (_p$.a = _$setProp(_el$24, "fg", _v$1, _p$.a));
              _v$10 !== _p$.o && (_p$.o = _$setProp(_el$26, "style", _v$10, _p$.o));
              _v$11 !== _p$.i && (_p$.i = _$setProp(_el$27, "style", _v$11, _p$.i));
              _v$12 !== _p$.n && (_p$.n = _$setProp(_el$28, "fg", _v$12, _p$.n));
              _v$13 !== _p$.s && (_p$.s = _$setProp(_el$29, "fg", _v$13, _p$.s));
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0,
              o: void 0,
              i: void 0,
              n: void 0,
              s: void 0
            });
            return _el$18;
          })();
        }
      }), null);
      return _el$17;
    })();
  };
  const Body = (body) => {
    const stats = () => body.value.stats;
    const hit = () => cacheHitRate(stats().total);
    return (() => {
      var _el$41 = _$createElement("box"), _el$42 = _$createElement("box"), _el$43 = _$createElement("text");
      _$insertNode(_el$41, _el$42);
      _$insertNode(_el$41, _el$43);
      _$setProp(_el$41, "flexDirection", "column");
      _$setProp(_el$41, "gap", 1);
      _$setProp(_el$41, "flexShrink", 0);
      _$setProp(_el$42, "flexDirection", "row");
      _$setProp(_el$42, "columnGap", 1);
      _$setProp(_el$42, "flexShrink", 0);
      _$insert(_el$42, _$createComponent(Card, {
        label: "Total cost",
        get value() {
          return formatCost(stats().total.cost);
        },
        get detail() {
          return `${stats().total.steps} steps`;
        },
        get color() {
          return theme.text.feedback.success.base;
        }
      }), null);
      _$insert(_el$42, _$createComponent(Card, {
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
      _$insert(_el$42, _$createComponent(Card, {
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
      _$insert(_el$42, _$createComponent(Card, {
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
      _$insert(_el$41, _$createComponent(TokenMix, {
        get usage() {
          return stats().total;
        }
      }), _el$43);
      _$insert(_el$41, _$createComponent(Breakdown, {
        title: "By model",
        get rows() {
          return stats().models;
        },
        get total() {
          return stats().total;
        }
      }), _el$43);
      _$insert(_el$41, _$createComponent(Breakdown, {
        title: "By agent",
        get rows() {
          return stats().agents;
        },
        get total() {
          return stats().total;
        }
      }), _el$43);
      _$insertNode(_el$43, _$createTextNode(`Model time adds up every step, so parallel subagents overlap and it can exceed wall-clock time.`));
      _$setProp(_el$43, "wrapMode", "word");
      _$effect((_$p) => _$setProp(_el$43, "fg", theme.text.faint, _$p));
      return _el$41;
    })();
  };
  return (() => {
    var _el$45 = _$createElement("box"), _el$46 = _$createElement("box"), _el$47 = _$createElement("box"), _el$48 = _$createElement("text"), _el$49 = _$createElement("b"), _el$50 = _$createElement("text");
    _$insertNode(_el$45, _el$46);
    _$setProp(_el$45, "flexDirection", "column");
    _$setProp(_el$45, "gap", 1);
    _$setProp(_el$45, "paddingLeft", 2);
    _$setProp(_el$45, "paddingRight", 2);
    _$setProp(_el$45, "paddingBottom", 1);
    _$insertNode(_el$46, _el$47);
    _$insertNode(_el$46, _el$50);
    _$setProp(_el$46, "flexDirection", "row");
    _$setProp(_el$46, "justifyContent", "space-between");
    _$setProp(_el$46, "flexShrink", 0);
    _$insertNode(_el$47, _el$48);
    _$setProp(_el$47, "flexDirection", "column");
    _$setProp(_el$47, "flexShrink", 1);
    _$insertNode(_el$48, _el$49);
    _$setProp(_el$48, "wrapMode", "none");
    _$setProp(_el$48, "truncate", true);
    _$insert(_el$49, () => done()?.title ?? "Session stats");
    _$insert(_el$47, _$createComponent(Show, {
      get when() {
        return done();
      },
      children: (value) => (() => {
        var _el$56 = _$createElement("text");
        _$setProp(_el$56, "wrapMode", "none");
        _$insert(_el$56, (() => {
          var _c$ = _$memo(() => value().stats.subagents === 0);
          return () => _c$() ? "1 session, no subagents" : `${value().stats.sessions} sessions \xB7 1 root + ${value().stats.subagents} subagent${value().stats.subagents === 1 ? "" : "s"}`;
        })(), null);
        _$insert(_el$56, _$createComponent(Show, {
          get when() {
            return running();
          },
          get children() {
            var _el$57 = _$createElement("span");
            _$insertNode(_el$57, _$createTextNode(` \u25CF running`));
            _$effect((_$p) => _$setProp(_el$57, "style", {
              fg: theme.text.feedback.success.base
            }, _$p));
            return _el$57;
          }
        }), null);
        _$effect((_$p) => _$setProp(_el$56, "fg", theme.text.muted, _$p));
        return _el$56;
      })()
    }), null);
    _$insertNode(_el$50, _$createTextNode(`esc close`));
    _$setProp(_el$50, "wrapMode", "none");
    _$setProp(_el$50, "flexShrink", 0);
    _$insert(_el$45, _$createComponent(Show, {
      get when() {
        return state().status === "loading";
      },
      get children() {
        var _el$52 = _$createElement("text");
        _$insertNode(_el$52, _$createTextNode(`Gathering session stats\u2026`));
        _$effect((_$p) => _$setProp(_el$52, "fg", theme.text.muted, _$p));
        return _el$52;
      }
    }), null);
    _$insert(_el$45, _$createComponent(Show, {
      get when() {
        return state().status === "error";
      },
      get children() {
        var _el$54 = _$createElement("text"), _el$55 = _$createTextNode(`Could not load stats: `);
        _$insertNode(_el$54, _el$55);
        _$insert(_el$54, () => state().message, null);
        _$effect((_$p) => _$setProp(_el$54, "fg", theme.text.feedback.error.base, _$p));
        return _el$54;
      }
    }), null);
    _$insert(_el$45, _$createComponent(Show, {
      get when() {
        return done();
      },
      children: (value) => (() => {
        var _el$59 = _$createElement("scrollbox");
        _$insert(_el$59, _$createComponent(Body, {
          get value() {
            return value();
          }
        }));
        _$effect((_$p) => _$setProp(_el$59, "maxHeight", Math.max(8, context.renderer.height - 10), _$p));
        return _el$59;
      })()
    }), null);
    _$effect((_p$) => {
      var _v$14 = theme.text.base, _v$15 = theme.text.muted;
      _v$14 !== _p$.e && (_p$.e = _$setProp(_el$48, "fg", _v$14, _p$.e));
      _v$15 !== _p$.t && (_p$.t = _$setProp(_el$50, "fg", _v$15, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$45;
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
  return _$createComponent2(Show2, {
    get when() {
      return usage() || total().cost > 0;
    },
    get children() {
      var _el$ = _$createElement2("box"), _el$2 = _$createElement2("text"), _el$3 = _$createElement2("b");
      _$insertNode2(_el$, _el$2);
      _$setProp2(_el$, "flexDirection", "column");
      _$setProp2(_el$, "flexShrink", 0);
      _$setProp2(_el$, "onMouseOver", () => setHover(true));
      _$setProp2(_el$, "onMouseOut", () => setHover(false));
      _$spread(_el$, _$mergeProps(() => clickable(props.onOpen)), true);
      _$insertNode2(_el$2, _el$3);
      _$insertNode2(_el$3, _$createTextNode2(`Context`));
      _$insert2(_el$, _$createComponent2(Show2, {
        get when() {
          return usage();
        },
        children: (value) => [(() => {
          var _el$10 = _$createElement2("text"), _el$11 = _$createTextNode2(` tokens`);
          _$insertNode2(_el$10, _el$11);
          _$insert2(_el$10, () => value().tokens.toLocaleString(), _el$11);
          _$effect2((_$p) => _$setProp2(_el$10, "fg", theme.text.muted, _$p));
          return _el$10;
        })(), _$createComponent2(Show2, {
          get when() {
            return value().percent !== void 0;
          },
          get children() {
            var _el$12 = _$createElement2("text"), _el$13 = _$createTextNode2(`% used`);
            _$insertNode2(_el$12, _el$13);
            _$insert2(_el$12, () => value().percent, _el$13);
            _$effect2((_$p) => _$setProp2(_el$12, "fg", theme.text.muted, _$p));
            return _el$12;
          }
        })]
      }), null);
      _$insert2(_el$, _$createComponent2(Show2, {
        get when() {
          return total().cost > 0;
        },
        get children() {
          return [(() => {
            var _el$5 = _$createElement2("text"), _el$6 = _$createTextNode2(` spent`);
            _$insertNode2(_el$5, _el$6);
            _$insert2(_el$5, () => formatCost(total().cost), _el$6);
            _$effect2((_$p) => _$setProp2(_el$5, "fg", theme.text.muted, _$p));
            return _el$5;
          })(), _$createComponent2(Show2, {
            get when() {
              return total().subagents > 0;
            },
            get children() {
              var _el$7 = _$createElement2("text"), _el$8 = _$createTextNode2(`incl. `), _el$9 = _$createTextNode2(` subagent`);
              _$insertNode2(_el$7, _el$8);
              _$insertNode2(_el$7, _el$9);
              _$insert2(_el$7, () => total().subagents, _el$9);
              _$insert2(_el$7, () => total().subagents === 1 ? "" : "s", null);
              _$effect2((_$p) => _$setProp2(_el$7, "fg", theme.text.muted, _$p));
              return _el$7;
            }
          }), (() => {
            var _el$0 = _$createElement2("text");
            _$insertNode2(_el$0, _$createTextNode2(`click for breakdown`));
            _$setProp2(_el$0, "selectable", false);
            _$effect2((_$p) => _$setProp2(_el$0, "fg", hover() ? theme.text.base : theme.text.muted, _$p));
            return _el$0;
          })()];
        }
      }), null);
      _$effect2((_$p) => _$setProp2(_el$2, "fg", theme.text.base, _$p));
      return _el$;
    }
  });
}
function Footer(props) {
  const total = createMemo2(() => treeCost(props.context.data, props.sessionID));
  return _$createComponent2(Show2, {
    get when() {
      return total().cost > 0;
    },
    get children() {
      var _el$14 = _$createElement2("text"), _el$15 = _$createTextNode2(`total `);
      _$insertNode2(_el$14, _el$15);
      _$setProp2(_el$14, "flexShrink", 0);
      _$setProp2(_el$14, "wrapMode", "none");
      _$setProp2(_el$14, "selectable", false);
      _$spread(_el$14, _$mergeProps({
        get fg() {
          return props.context.theme.text.muted;
        }
      }, () => clickable(props.onOpen)), true);
      _$insert2(_el$14, () => formatCost(total().cost), null);
      return _el$14;
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
