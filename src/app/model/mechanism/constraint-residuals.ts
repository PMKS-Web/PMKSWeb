/**
 * How far a solved configuration is from satisfying each constraint.
 *
 * Every closed-form step in the position solver answers some constraint. These
 * functions state those constraints independently of the formula that solves
 * them, so a test can assert that an answer satisfies its own constraint rather
 * than only that it matches a number someone wrote down.
 *
 * They also exist for a second reason. If the optimisation fallback of §2.7a
 * ever lands, it needs exactly this library to form its residual vector — so it
 * is written now, while it can be checked against closed-form answers that are
 * already known to be right, rather than later against answers that are not.
 */

/** Signed error in a rigid link's length: zero when the joints are `length` apart. */
export function rigidLinkResidual(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  length: number
): number {
  return Math.hypot(bx - ax, by - ay) - length;
}

/**
 * Signed perpendicular distance from a sliding point to its slot.
 *
 * The slot is the line through `a` and `b` (§2.4), so this is the cross product
 * of the slot's unit direction with the offset to the point — zero exactly when
 * the point lies on the line, and signed by which side it has strayed to.
 */
export function slotResidual(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return NaN;
  }
  return ((px - ax) * dy - (py - ay) * dx) / length;
}
