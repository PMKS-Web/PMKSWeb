/**
 * Whether a mark drawn on a colour should be dark or light.
 *
 * A leaf with no imports, because both the canvas and the swatch picker need
 * the same answer and neither should be reaching into the other for it.
 */

/** Rough perceived brightness of a `#rrggbb`, between 0 and 1. */
export function luminanceOf(color: string): number {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 1;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Above this, a colour takes dark ink; below it, light. */
export const INK_FLIPS_AT = 0.55;
