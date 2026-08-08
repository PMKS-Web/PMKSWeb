import { MechanismFixture } from './fixture';

// Mechanisms from the wider linkage library — real machines people already know
// by name, rather than cases built to isolate a solver feature.

/** One rad/s, matching the rest of the verification suite. */
const INPUT_SPEED = 1;

/**
 * Theo Jansen's "holy numbers": the eleven bar lengths plus the two ground
 * offsets that his genetic algorithm settled on in the late 1980s, in the
 * arbitrary unit they are always quoted in.
 *
 * They are quoted rather than derived, and they do not tolerate rounding — a
 * percent or two off any of them visibly spoils the foot path — so they are
 * named here exactly as published and the fixture reads them by letter.
 */
export const JANSEN = {
  a: 38.0,
  b: 41.5,
  c: 39.3,
  d: 40.1,
  e: 55.8,
  f: 39.4,
  g: 36.7,
  h: 65.7,
  i: 49.0,
  j: 50.0,
  k: 61.9,
  l: 7.8,
  m: 15.0,
} as const;

/**
 * One leg of a Strandbeest: an eight-bar whose foot walks.
 *
 * Labelling convention — there are several equivalent ones, so this is the one
 * the coordinates below were computed from, with `a`..`m` the holy numbers:
 *
 * - `O` is the crank axis at the origin and the input; `G` is the frame pivot
 *   at (-a, -l). Both are ground.
 * - `OA` is the crank, length m. Everything else hangs off the crank pin A.
 * - `AB` = j and `AD` = k are the two long bars reaching back from that pin.
 * - `GBC` is the upper triangle, pivoting on the frame at G: |GB| = b,
 *   |BC| = e, |GC| = d.
 * - `GD` = c is the frame bar that holds the knee.
 * - `CE` = f drops from the upper triangle to the leg.
 * - `DEF` is the leg itself, the triangle that carries the foot F:
 *   |DE| = g, |EF| = h, |DF| = i.
 *
 * Seven moving bodies and ten revolute joints, so Gruebler gives one degree of
 * freedom, and every joint is reachable from two already-known ones — the whole
 * linkage is a chain of dyads off the crank, which is why it solves in closed
 * form rather than needing the simultaneous path.
 *
 * `l` is measured *downwards* here. Written as (-a, +l) with the foot hanging
 * below, the assembly is a different linkage rather than a mirror of this one,
 * and its foot draws a lopsided arc instead of the walking curve.
 *
 * The coordinates are the pose at crank angle zero, computed by intersecting
 * the two circles that locate each joint in turn. Each intersection has two
 * roots, so the same eleven bars assemble 32 ways, and the branch is what makes
 * this the Jansen leg rather than one of the other 31: twelve of them jam
 * partway through a turn, and of the nineteen that run, only this one draws the
 * flat sole. The numbers are literals because what produced them is a search
 * over those branches rather than a formula, and because a pose a reader can
 * check against the bar lengths is worth more than one they have to rerun.
 *
 * No dyad comes near tangency over a revolution — the tightest is D's, which
 * keeps 1.19 units of slack on |AD| - |GD| — so the assembly mode holds all the
 * way round and the linkage cannot flip branch mid-cycle.
 */
export function jansenLegFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true, input: true },
      { id: 'A', x: JANSEN.m, y: 0 },
      { id: 'G', x: -JANSEN.a, y: -JANSEN.l, ground: true },
      { id: 'B', x: -24.013535097, y: 31.272097455 },
      { id: 'C', x: -74.794365381, y: 8.143170206 },
      { id: 'D', x: -26.952107032, y: -45.51517017 },
      { id: 'E', x: -59.231514961, y: -28.052930231 },
      { id: 'F', x: -43.160110524, y: -91.756932926 },
    ],
    links: [
      { joints: 'OA' },
      { joints: 'AB' },
      { joints: 'GBC' },
      { joints: 'AD' },
      { joints: 'GD' },
      { joints: 'CE' },
      { joints: 'DEF' },
    ],
    inputAngVel: INPUT_SPEED,
  };
}

/** Every bar of the leg, as the joint pair it spans and the length it holds. */
export const JANSEN_BARS: readonly [string, string, number][] = [
  ['O', 'A', JANSEN.m],
  ['A', 'B', JANSEN.j],
  ['G', 'B', JANSEN.b],
  ['B', 'C', JANSEN.e],
  ['G', 'C', JANSEN.d],
  ['A', 'D', JANSEN.k],
  ['G', 'D', JANSEN.c],
  ['C', 'E', JANSEN.f],
  ['D', 'E', JANSEN.g],
  ['E', 'F', JANSEN.h],
  ['D', 'F', JANSEN.i],
];
