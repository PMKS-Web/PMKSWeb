# Velocity and acceleration through a floating slot — design options

Phase 2 tasks 2.9 and 2.11 (`docs/joint-types-plan.md`). Positions and static forces are done and
verified; this is what stands between here and Gate 2. Written for a decision before implementation.

---

## 1. What is actually blocking

Three separate problems wear one label. They need different fixes and carry very different risk.

### 1.1 Enumeration — the loop is never found

`LoopSolver.determineLoops` walks `connectedJoints`
([`loop-solver.ts:59`](../src/app/model/mechanism/loop-solver.ts)). Option A (§2.3) deliberately
keeps a slot's carrier out of both `PrisJoint.links` and `connectedJoints`, so the edge that closes
an inverted slider-crank — crank pin → block → carrier → ground — does not exist in the graph being
walked. **Result: zero loops**, and `determineKinematics` takes the `requiredLoops.length === 0`
branch into `determineLooplessKinematics`, which is written for "a welded root rotating about its
input" and leaves most joints unset.

### 1.2 Representation — a loop edge must be a link

A loop is a **string of joint letters** (`"ABCDA"`). Every consumer turns adjacent letters into a
link:

```ts
const link = simLinks[this.linkIndexMap.get(loop[i] + loop[i - 1])!];   // kinematic-solver.ts:420
```

A slot edge has no link between the block and the carrier — that is the entire point of a sliding
pair. The format also cannot express *which* connection is meant when two joints are related by both
a link and a slot, and it silently assumes joint ids are one character.

### 1.3 The equation — one missing term, and Coriolis

For the inverted slider-crank, loop closure is `r_AB = r_AC + s·û`, with `û` the slot direction and
`s` the travel. Differentiating:

```
velocity:      ω₂ × r_AB  =  ṡ·û  +  s·ω₄·û⊥
acceleration:  α₂ × r_AB − ω₂²·r_AB  =  s̈·û  +  2·ṡ·ω₄·û⊥  +  s·α₄·û⊥  −  s·ω₄²·û
                                                 └─ Coriolis ─┘
```

The `SliderBlock` branch
([`kinematic-solver.ts:430-435`](../src/app/model/mechanism/kinematic-solver.ts)) emits only `ṡ·û`,
treating the slide rate as the unknown. **That is exactly right for a grounded guide, where the
carrier is ground and `ω₄ = 0`.** For a floating slot the remaining terms are missing, and the
Coriolis term is precisely what makes a Whitworth's quick-return ratio come out right.

> **Correction to what I said earlier:** I described 2.9 as more than "add the carrier's ω×r term."
> For the *equation* the plan was accurate — it is that term plus Coriolis, and it lands in the
> existing matrix as extra coefficients in the carrier's already-present ω column. The extra work
> is 1.1 and 1.2, not the physics.

### Two facts that make this cheaper than it looks

- **`requiredLoops` has only two consumers left**: `KinematicsSolver` and `IcSolver`.
  `ForceSolver.determineDesiredLoopLettersForce` is already a documented no-op adapter
  ([`force-solver.ts:161`](../src/app/model/mechanism/force-solver.ts)) — a previous phase moved
  force analysis off loops entirely. Changing the loop representation is a two-file blast radius.
- **A topology-independent finite-difference kinematics fallback already ships**, used by dynamic
  force analysis when the loop solver throws
  ([`force-solver.ts:652`](../src/app/model/mechanism/force-solver.ts)).

---

## 2. Options for enumeration and representation (1.1 + 1.2)

### Option A — supplementary slot edges, keep the letter strings

Hand `LoopSolver` a list of slot edges (block pin ↔ each carrier joint) to traverse alongside
`connectedJoints`, and give every consumer a `slotEdgeMap` lookup to try when `linkIndexMap` misses.

| | |
| --- | --- |
| **Effort** | Smallest — no signature changes |
| **Risk to existing numbers** | Low; grounded mechanisms never hit the new lookup |
| **Cost** | Two parallel lookup paths at every `loop[i]` site in both solvers. Does not fix the link-vs-slot ambiguity or the single-character assumption — it adds a second way to be ambiguous |

### Option B — loops as typed edges

`determineLoops` returns `LoopEdge[][]` instead of `string[]`:

```ts
type LoopEdge =
  | { kind: 'link'; from: Joint; to: Joint; link: Link }
  | { kind: 'slot'; from: Joint; to: Joint; slider: PrisJoint; carrier: Link };
```

| | |
| --- | --- |
| **Effort** | Largest — every `loop[i]` site in both solvers (~25 sites) |
| **Risk to existing numbers** | Real but bounded. The MATLAB-verified suite (sixbar, Watt I, Stephenson III, teaching lab) pins exact values, so a regression surfaces immediately rather than silently |
| **Payoff** | Ambiguity gone; the slot edge carries its own slider and carrier, so the equation reads `slotAngle` and `ω_carrier` directly instead of re-deriving them; single-character joint ids stop being load-bearing |

### Option C — finite-difference velocity and acceleration for slot mechanisms only

Skip loops entirely when a floating slot is present. Differentiate the verified position sequence,
reusing the existing fallback.

| | |
| --- | --- |
| **Effort** | Smallest by far — the machinery exists |
| **Risk to existing numbers** | None. Gated on `hasFloatingSlot()`; every current mechanism keeps its closed-form path bit-identically, which the plan's §2.7a hard constraint requires |
| **Cost** | Approximate. Velocity is O(Δt²) accurate on 1° steps; **acceleration is a second difference and materially noisier**. Cannot be asserted against closed form at the tolerance the rest of the suite uses, so Gate 2's "match closed form for acceleration" would have to be restated as a tolerance |

---

## 3. Recommendation

**Option B, and I would not do C except as a stopgap.**

The reasoning is that C's weakness lands exactly where this project is a teaching tool. Acceleration
is the quantity students are usually asked to reason about, a second difference of a 1°-sampled
sequence is visibly noisy, and the plan is explicit that a numerical path must never replace one
that has an exact answer. C also cannot serve §2.7a's eventual optimisation fallback, whereas B's
typed edges are the same structure that fallback would need.

A is cheapest to write and the worst to live with: it doubles the lookup logic in the two solvers
that are hardest to read, in order to preserve a string format whose only remaining consumers are
those same two solvers.

Sequenced so nothing is ever half-correct:

1. **B first, with no slot support** — convert `LoopSolver`, `KinematicsSolver` and `IcSolver` to
   typed edges, changing no behaviour. The existing verified suite must stay green and byte-identical;
   that is the whole safety net for this step.
2. **Slot edges into enumeration**, still with no equation change. Loops now form; velocities will be
   wrong. Nothing ships from this commit on its own.
3. **The `s·ω·û⊥` and Coriolis terms**, landed together with step 2 in a single reviewable change, so
   there is never a state where loops close and the numbers are quietly wrong.
4. **Verification**: inverted slider-crank and Scotch yoke against analytic ṡ and s̈, Whitworth
   against its published time ratio, then the IC case.
5. **2.11** — the prismatic IC is hardcoded `(∞, ∞)` behind a pre-existing
   `// TODO: should be infinity, infinity` ([`ic-solver.ts:116`](../src/app/model/mechanism/ic-solver.ts)).
   The slot direction now reaches `FixedInstantCenter` correctly via `slotAngle`, but there is no
   test for it on grounded slots either, so this is partly pre-existing debt.

Until step 3 lands, `kinematicLoopAnalysis` returns an empty analysis for a floating slot — no
crash, no fabricated zeros.

---

## 4. What I need from you

Only the choice above. No reference data is needed: velocity and acceleration for cases 2 and 3 are
analytic (differentiate the position closed form already verified in
`inverted-slider-crank.spec.ts`), which §4.3 prefers over sampled MATLAB anyway, and Whitworth has a
published time ratio.

One question that is genuinely yours, and is **Phase 4, not this**: §7 open question 2 — whether a
slot the closed-form inverse primitive cannot reduce should be refused in the panel with a reason,
or allowed through to the "unsolvable" strategy. The engine reports it either way today.
