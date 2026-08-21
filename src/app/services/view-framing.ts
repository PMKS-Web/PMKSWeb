/**
 * Where the drawing may stand, and where it currently stands.
 *
 * The canvas is full-bleed: every panel, strip and card in the app floats over
 * it, so the window is not the same thing as the space a reader can see the
 * linkage in. Framing to the window is what put a mechanism half under the Edit
 * panel with a third of the window empty beside it. Everything here is in
 * client pixels, which is the only frame of reference the chrome and the canvas
 * share.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Chrome declares which window edge it hugs; nothing here knows its name. */
export type CanvasEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * Below this the free rect is not worth respecting -- a window small enough
 * that the chrome meets in the middle is better served by drawing under it than
 * by fitting the linkage into a sliver.
 */
const MIN_FREE_SIDE = 160;

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The part of the canvas nothing is standing on.
 *
 * Found by asking the chrome rather than by naming it: a card that occludes the
 * canvas carries `data-canvas-inset` saying which edge it hugs, so a panel
 * added later is framed around without this file being touched. A card parked
 * off screen -- a closed drawer, a hidden panel -- reports a rect outside the
 * canvas and so pushes nothing.
 */
export function freeCanvasRect(canvas: Element, doc: Document = document): Rect {
  const bounds = canvas.getBoundingClientRect();
  const full: Rect = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  let left = bounds.left;
  let right = bounds.right;
  let top = bounds.top;
  let bottom = bounds.bottom;

  doc.querySelectorAll<HTMLElement>('[data-canvas-inset]').forEach((card) => {
    const box = card.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    switch (card.dataset['canvasInset'] as CanvasEdge) {
      case 'left':
        if (box.right > left) left = Math.min(box.right, bounds.right);
        break;
      case 'right':
        if (box.left < right) right = Math.max(box.left, bounds.left);
        break;
      case 'top':
        if (box.bottom > top) top = Math.min(box.bottom, bounds.bottom);
        break;
      case 'bottom':
        if (box.top < bottom) bottom = Math.max(box.top, bounds.top);
        break;
    }
  });

  const free: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  return free.width < MIN_FREE_SIDE || free.height < MIN_FREE_SIDE ? full : free;
}

/**
 * The box the drawing actually occupies on screen, or null if nothing is drawn.
 *
 * Measured off the layers the reader sees rather than off the whole canvas: the
 * grid ruling and the axes are drawn to the viewport, so a bounding box that
 * includes them is always exactly the window and a fit against it is a no-op.
 * `getBoundingClientRect` rather than `getBBox` because these layers carry
 * their own y-flip and the pan/zoom above it, and only the client rect has all
 * of that already applied.
 */
export function drawingScreenBox(
  layerIds: readonly string[],
  doc: Document = document
): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of layerIds) {
    const layer = doc.getElementById(id);
    if (!layer) continue;
    const box = layer.getBoundingClientRect();
    // An empty holder reports a zero rect at the origin, which would drag the
    // union to the top-left corner of the window.
    if (box.width <= 0 && box.height <= 0) continue;
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Whether one box sits inside another, allowing a little overhang. */
export function fitsInside(inner: Rect, outer: Rect, slack = 0): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

/** Whether two rects are the same to within a pixel, for settle detection. */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}
