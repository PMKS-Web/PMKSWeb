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
 * Below this the free rect is not worth respecting on that axis.
 *
 * A window small enough that the chrome meets in the middle is better served by
 * drawing under a panel than by fitting the linkage into a sliver of what is
 * left. Relaxed one axis at a time: a short window has plenty of room across
 * and should keep its horizontal framing, and a phone-narrow one keeps its
 * vertical framing for the same reason.
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
 *
 * A side panel is only worth standing beside while there is room beside it. On
 * a narrow window the mode panel can take four fifths of the width, and framing
 * into the sliver that is left -- or, worse, giving up and framing to the whole
 * window, which puts the drawing squarely behind the panel -- are both worse
 * than going under it and coming out below. So the side cards are offered two
 * ways: standing beside them, and standing clear of the edge each one is
 * anchored to. Beside wins whenever it is roomy, which is every ordinary
 * window; otherwise the larger of the two does.
 */
export function freeCanvasRect(canvas: Element, doc: Document = document): Rect {
  const bounds = canvas.getBoundingClientRect();
  const full: Rect = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  const cards = [...doc.querySelectorAll<HTMLElement>('[data-canvas-inset]')].filter((card) => {
    const box = card.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
  const beside = apply(full, cards, false);
  if (roomy(beside)) return beside;
  const under = apply(full, cards, true);
  const best = area(under) > area(beside) ? under : beside;
  // Neither arm exists at all -- the chrome meets in both directions, which
  // only a window shorter than its own strips can manage. Drawing through them
  // is the last thing left, one axis at a time.
  return area(best) > 0 ? best : relaxed(full, beside);
}

/** Whether a rect is big enough in both directions to frame a drawing in. */
function roomy(rect: Rect): boolean {
  return rect.width >= MIN_FREE_SIDE && rect.height >= MIN_FREE_SIDE;
}

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

/**
 * Cut the cards out of the canvas.
 *
 * With `sidewaysUnder`, a left or right card gives up its own edge and takes
 * the one it hangs from instead -- which is the difference between standing
 * beside a panel and standing below it.
 */
function apply(full: Rect, cards: HTMLElement[], sidewaysUnder: boolean): Rect {
  let left = full.x;
  let right = full.x + full.width;
  let top = full.y;
  let bottom = full.y + full.height;

  for (const card of cards) {
    const box = card.getBoundingClientRect();
    let edge = card.dataset['canvasInset'] as CanvasEdge;
    if (sidewaysUnder && (edge === 'left' || edge === 'right')) {
      // Whichever of the canvas's own top and bottom this card is nearer to is
      // the one it hangs from, and so the one it has to be cleared past.
      const fromTop = box.top - full.y;
      const fromBottom = full.y + full.height - box.bottom;
      edge = fromTop <= fromBottom ? 'top' : 'bottom';
    }
    switch (edge) {
      case 'left':
        if (box.right > left) left = Math.min(box.right, full.x + full.width);
        break;
      case 'right':
        if (box.left < right) right = Math.max(box.left, full.x);
        break;
      case 'top':
        if (box.bottom > top) top = Math.min(box.bottom, full.y + full.height);
        break;
      case 'bottom':
        if (box.top < bottom) bottom = Math.max(box.top, full.y);
        break;
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The last resort, one axis at a time.
 *
 * A phone-shape window has no width to spare and plenty of height; a very short
 * one is the other way round. Giving up both because one of them ran out threw
 * away framing that was working.
 */
function relaxed(full: Rect, rect: Rect): Rect {
  const wide = rect.width >= MIN_FREE_SIDE;
  const tall = rect.height >= MIN_FREE_SIDE;
  return {
    x: wide ? rect.x : full.x,
    y: tall ? rect.y : full.y,
    width: wide ? rect.width : full.width,
    height: tall ? rect.height : full.height,
  };
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
