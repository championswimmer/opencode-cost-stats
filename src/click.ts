import { MouseButton, type MouseEvent } from "@opentui/core"

/** Mouse handlers that fire on a left click but not at the end of a drag, so text selection still works. */
export function clickable(onClick: () => void) {
  let start: { x: number; y: number } | undefined
  return {
    onMouseDown(event: MouseEvent) {
      if (event.button === MouseButton.LEFT) start = { x: event.x, y: event.y }
    },
    onMouseDrag() {
      start = undefined
    },
    onMouseUp(event: MouseEvent) {
      const origin = start
      start = undefined
      if (
        event.button !== MouseButton.LEFT ||
        event.isDragging ||
        origin?.x !== event.x ||
        origin.y !== event.y
      )
        return
      event.stopPropagation()
      onClick()
    },
  }
}
