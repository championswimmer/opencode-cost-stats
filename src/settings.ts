import type { Plugin } from "@opencode/plugin/tui"

export const PLACEMENTS = ["sidebar", "footer", "both", "off"] as const
export type Placement = (typeof PLACEMENTS)[number]

export interface Settings {
  placement: Placement
}

export const DEFAULTS: Settings = { placement: "sidebar" }

export const parseSettings = (value: Partial<Settings> | undefined): Settings => ({
  placement: PLACEMENTS.find((placement) => placement === value?.placement) ?? DEFAULTS.placement,
})

const LABELS: Record<Placement, { title: string; description: string }> = {
  sidebar: {
    title: "Sidebar",
    description:
      "Replaces the built-in Context block (needs -opencode.sidebar.context, see README)",
  },
  footer: {
    title: "Prompt footer",
    description: "Adds the whole-session total next to the built-in usage in the prompt footer",
  },
  both: { title: "Sidebar and footer", description: "Show the total in both places" },
  off: { title: "Off", description: "Hide the total; /session-stats still works" },
}

export async function openSettings(
  context: Plugin.Context,
  read: () => Settings,
  update: (change: Settings) => Promise<void>,
) {
  const selected = await context.ui.dialog.select<Placement>({
    title: "Session cost placement",
    current: read().placement,
    options: PLACEMENTS.map((placement) => ({
      title: LABELS[placement].title,
      value: placement,
      description: LABELS[placement].description,
    })),
  })
  if (selected) await update({ placement: selected })
}
