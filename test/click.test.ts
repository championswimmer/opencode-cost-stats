import assert from "node:assert/strict"
import { test } from "node:test"
import { MouseButton, type MouseEvent } from "@opentui/core"
import { clickable } from "../src/click"

const event = (x: number, y: number, extra: Partial<MouseEvent> = {}) => {
  let stopped = false
  const value = {
    button: MouseButton.LEFT,
    x,
    y,
    isDragging: false,
    stopPropagation: () => (stopped = true),
    ...extra,
  } as MouseEvent
  return { value, stopped: () => stopped }
}

test("fires on a left click released where it was pressed", () => {
  let clicks = 0
  const handlers = clickable(() => clicks++)
  handlers.onMouseDown(event(3, 4).value)
  const up = event(3, 4)
  handlers.onMouseUp(up.value)
  assert.equal(clicks, 1)
  assert.ok(up.stopped())
})

test("ignores drags, moved releases, other buttons and releases without a press", () => {
  let clicks = 0
  const handlers = clickable(() => clicks++)
  handlers.onMouseDown(event(1, 1).value)
  handlers.onMouseDrag()
  handlers.onMouseUp(event(1, 1).value)
  handlers.onMouseDown(event(1, 1).value)
  handlers.onMouseUp(event(2, 1).value)
  handlers.onMouseDown(event(1, 1).value)
  handlers.onMouseUp(event(1, 1, { isDragging: true }).value)
  handlers.onMouseDown(event(1, 1, { button: MouseButton.RIGHT }).value)
  handlers.onMouseUp(event(1, 1, { button: MouseButton.RIGHT }).value)
  handlers.onMouseUp(event(1, 1).value)
  assert.equal(clicks, 0)
})
