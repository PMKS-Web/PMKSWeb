import { Subject } from 'rxjs';

/**
 * Announced by a card that has begun moving over the canvas.
 *
 * The companion to `data-canvas-inset`: the attribute says which edge a card
 * takes, and this says when it has started taking a different amount of it, so
 * the drawing can move out from under it. A leaf module with no other imports,
 * because the chrome that announces and the canvas that listens sit on opposite
 * sides of the service graph and neither should be importing the other.
 *
 * Not needed for the panel beside the canvas, whose mode the canvas already
 * follows, nor for the window, which has an event of its own.
 */
export const CHROME_MOVED = new Subject<void>();
