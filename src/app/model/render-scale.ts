/**
 * How many internal model units make up one user-facing length unit.
 *
 * The internal world is deliberately drawn 200x larger than the numbers the
 * user sees: a joint the user knows as (2, 1) cm lives at (400, 200) in every
 * Joint/Link/Force object and in the SVG. The svg-pan-zoom matrix shrinks by
 * the same factor, so nothing looks different -- but the matrix now tops out
 * around 16.5 instead of 3300, and that is the whole point.
 *
 * Chrome's compositor intermittently fails to rasterize an SVG tile whose
 * content coordinates are tiny under a transform scale in the hundreds; the
 * dropped tile paints as a white streak across the grid. An interleaved
 * real-mouse A/B on the same machine showed identical pictures drawn from big
 * coordinates under a small matrix never streaking (0/12 runs) while the
 * small-coordinate baseline hit 8/30 overall and 6/9 in the same window. The
 * sister repo PMKS-Refactor draws at 200x and has never streaked, so 200 is
 * the value chosen here.
 *
 * The boundary discipline that keeps this invisible:
 *  - URL codec: decode multiplies every coordinate by MODEL_SCALE, encode
 *    divides -- shared URLs carry exactly the same numbers as before this
 *    constant existed, so the transcoder compatibility surface is untouched.
 *  - User-facing panels, axis labels, and analysis graphs divide lengths by
 *    MODEL_SCALE for display and multiply typed values back.
 *  - Constants that mean a physical length (solver step sizes, no-op guards)
 *    are multiplied by MODEL_SCALE at their definition.
 * Everything in between -- solvers, hit-testing, objectScale-derived visual
 * sizes -- works in internal units and needs no knowledge of this number.
 */
export const MODEL_SCALE = 200;
