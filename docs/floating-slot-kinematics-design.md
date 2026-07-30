# Velocity and acceleration through a floating slot — implementation plan

Phase 2 task 2.9 (`docs/joint-types-plan.md`; task 2.11 is de-scoped — §6). Positions and static
forces are done and verified; this is what stands between here and Gate 2.

**Status: implemented.** Option B — typed loop edges — was chosen and is shipped; Gate 2 is met.
What follows is the plan as written before implementation, kept as the record. Two things went
differently in practice and are noted in place: §7.2's dedup rule needed a single canonical slot
anchor as well (the multiset rule alone does not collapse the two ways into a carrier), and §3's
"ω₄ is already an unknown column" does not hold for the inverted slider-crank, where the carrier is
reached only across the slot and its column has to be claimed by the slot edge itself.

**Option B — typed loop edges — is chosen.** This revision turns the options draft into an
implementation spec and folds in a pre-implementation review of the draft against the code. Three
findings changed the plan materially:

- Edges are **id-based, not object-based** (§2.2) — the draft's object-carrying sketch would have
  pinned every loop to timestep 0's geometry.
- Loops are **open chains**; the draft's implied ground-closing edge does not exist in the model
  and is never consumed today (§2.4).
- **The IC solver is dead code** — no callers, no tests. Task 2.11 has been de-scoped from
  Phase 2 entirely, and Gate 2 no longer includes an IC case (§6). This shrinks step 1.

The rejected options are kept for the record in §9. Line numbers cite the tree at the time of
writing; re-grep before relying on them.

---

## 1. What is actually blocking

Three separate problems wear one label. They need different fixes and carry very different risk.

### 1.1 Enumeration — the loop is never found

`LoopSolver.determineLoops` walks `connectedJoints`
([`loop-solver.ts:59`](../src/app/model/mechanism/loop-solver.ts)). The Phase 2 position work
(§2.3 of the plan) deliberately keeps a slot's carrier out of both `PrisJoint.links` and
`connectedJoints`, so the edge that closes an inverted slider-crank — crank pin → block → carrier →
ground — does not exist in the graph being walked. **Result: zero loops**, and
`determineKinematics` takes the `requiredLoops.length === 0` branch
([`kinematic-solver.ts:78`](../src/app/model/mechanism/kinematic-solver.ts)) into
`determineLooplessKinematics`, which is written for "a welded root rotating about its input" and
leaves most joints unset. (`Mechanism.kinematicLoopAnalysis` guards this with `hasFloatingSlot()`
at [`mechanism.ts:1206`](../src/app/model/mechanism/mechanism.ts) and returns an empty analysis —
no crash, no fabricated zeros. That guard stays until §7 lands.)

### 1.2 Representation — a loop edge must be a link

A loop is a **string of joint letters** (`"ABCDA"`). Every consumer turns adjacent letters into a
link:

```ts
const link = simLinks[this.linkIndexMap.get(loop[i] + loop[i - 1])!];   // kinematic-solver.ts:420
```

A slot edge has no link between the block and the carrier — that is the entire point of a sliding
pair. The format cannot express *which* connection is meant when two joints are related by both a
link and a slot, and it silently assumes joint ids are one character.

One correction to the draft's framing: the strings already smuggle a *second* edge kind. A
grounded-slider pair resolves to a `SliderBlock` pseudo-link, and both walk sites discriminate with
`switch (link.constructor)` ([`kinematic-solver.ts:236`](../src/app/model/mechanism/kinematic-solver.ts)
and [`:421`](../src/app/model/mechanism/kinematic-solver.ts)). Typed edges do not introduce a
discriminated union into this code — they surface the one that is currently hidden in a
constructor switch.

### 1.3 The equation — one missing term, and Coriolis

For the inverted slider-crank, loop closure is `r_AB = r_AC + s·û`, with `û` the slot direction and
`s` the travel. Differentiating:

```
velocity:      ω₂ × r_AB  =  ṡ·û  +  s·ω₄·û⊥
acceleration:  α₂ × r_AB − ω₂²·r_AB  =  s̈·û  +  2·ṡ·ω₄·û⊥  +  s·α₄·û⊥  −  s·ω₄²·û
                                                 └─ Coriolis ─┘
```

The `SliderBlock` branch emits only `ṡ·û`, treating the slide rate as the unknown. **That is
exactly right for a grounded guide, where the carrier is ground and `ω₄ = 0`.** For a floating slot
the remaining terms are missing, and the Coriolis term is precisely what makes a Whitworth's
quick-return ratio come out right. Where each quantity comes from at solve time is specified in §3.

### Three facts that make this cheaper than it looks

- **`requiredLoops` has exactly one live consumer: `KinematicsSolver`.** The draft said two; the
  review found `IcSolver` is unreachable code (§6). `ForceSolver.determineDesiredLoopLettersForce`
  is already a documented no-op adapter
  ([`force-solver.ts:161`](../src/app/model/mechanism/force-solver.ts)) — a previous phase moved
  force analysis off loops entirely.
- **A topology-independent finite-difference kinematics fallback already ships**, used by dynamic
  force analysis when the loop solver throws
  ([`force-solver.ts:652`](../src/app/model/mechanism/force-solver.ts)).
- One caution against over-claiming: the *type* `requiredLoops: string[]` flows through about seven
  files, not two. All of the extra touches are mechanical; §5 enumerates every one so none is
  discovered mid-refactor.

---

## 2. The representation

### 2.1 The types

```ts
/** Topology only. Everything is an id; geometry is resolved per timestep (§2.2). */
export type LoopEdge =
  | { kind: 'link'; fromId: string; toId: string; linkId: string }
  | { kind: 'slot'; fromId: string; toId: string; sliderId: string };

export interface Loop {
  /** Deterministic signature — the Map key everywhere (§2.6). */
  id: string;
  edges: LoopEdge[];
}
```

`fromId`/`toId` are joint ids in traversal order. `linkId` names the connecting link — a `RealLink`
or a `SliderBlock` (§2.5). For a slot edge, one endpoint is the `PrisJoint` and the other is a
joint on the carrier; the walk can cross in either direction, which is why `sliderId` is an
explicit field rather than a rule like "`fromId` is always the slider".

A conventional loop and a floating-slot loop:

```ts
// four-bar "ABCDA" becomes (note: open chain, §2.4)
[ { kind: 'link', fromId: 'A', toId: 'B', linkId: 'AB' },
  { kind: 'link', fromId: 'B', toId: 'C', linkId: 'BC' },
  { kind: 'link', fromId: 'C', toId: 'D', linkId: 'CD' } ]

// inverted slider-crank: crank AB, pin B, block BP, slider P riding carrier CD
[ { kind: 'link', fromId: 'A', toId: 'B', linkId: 'AB' },
  { kind: 'link', fromId: 'B', toId: 'P', linkId: 'BP' },   // the SliderBlock
  { kind: 'slot', fromId: 'P', toId: 'C', sliderId: 'P' } ]
```

### 2.2 Ids, not object references

Loops are discovered once, from timestep 0
([`mechanism.ts:107`](../src/app/model/mechanism/mechanism.ts)), but consumed at **every** timestep
against per-timestep deep copies of the joints and links. An edge that stores `Joint`/`Link`
objects (the draft's sketch) reads timestep 0's geometry forever while claiming to solve timestep
27. The codebase has already been bitten by exactly this, twice:

- the comment at [`kinematic-solver.ts:262`](../src/app/model/mechanism/kinematic-solver.ts):
  "the per-timestep joint arrays hold copies, so an identity indexOf against the link's original
  joints finds nothing";
- `PrisJoint.rebindSlot` ([`joint.ts:268`](../src/app/model/joint.ts)) exists solely to re-resolve
  a slot's carrier and defining joints *by id* on each copy.

So edges carry ids, and each solve resolves them against the frame it was handed. The existing
`jointIndexMap`/`linkIndexMap` machinery already is id-keyed resolution; it survives, re-keyed per
§2.6.

### 2.3 The `PrisJoint` is authoritative for slot geometry

The slot edge carries `sliderId` and nothing else — no `carrierId`, no slot-joint ids. All of that
already lives on the `PrisJoint` (`slideOn`, [`joint.ts:214`](../src/app/model/joint.ts)) and is
maintained across per-timestep copies by `rebindSlot`. Duplicating it on the edge creates a second
source of truth with no consumer that needs it. At solve time, from the current frame's `PrisJoint`:

- `û = (cos θ, sin θ)` with `θ = prisJoint.slotAngle` — the getter re-measures from the defining
  joints on every call ([`joint.ts:238`](../src/app/model/joint.ts)), so it is per-timestep for free;
- the carrier is `prisJoint.carrier` — its id selects the ω/α column (§3);
- `s` is measured from `prisJoint.slotJointA` (§3).

Kinematics only runs after positions solved, and the position solver already refuses ill-formed
slots upstream, so no additional `isSlotWellFormed` guard is needed here.

### 2.4 Loops are open chains — there is no closing ground edge

Every consumer iterates `for (let i = 1; i < loop.length - 1; i++)`
([`kinematic-solver.ts:419`](../src/app/model/mechanism/kinematic-solver.ts), likewise `:221`,
`:234`, `:358`, `:464`). For `"ABCDA"` the pairs consumed are AB, BC, CD — the ground-to-ground
closure DA is **never looked up**, and no `Link` object joins two ground joints, so a closing edge
could not resolve even if emitted. The typed loop is therefore the open chain in §2.1:
`edges[i - 1]` replaces letter pair `(i-1, i)`, nothing replaces the closure. Do not invent a
`linkId: 'ground'`, and do not add a `kind: 'ground'` — represent exactly what the math consumes.

### 2.5 `SliderBlock` edges in step 1

To keep step 1 byte-identical, a grounded-slider pair becomes
`{ kind: 'link', linkId: <sliderBlockId> }` and the existing `switch (link.constructor)` branches
survive untouched. Folding grounded slots into `kind: 'slot'` with `ω_carrier = 0` is a real
simplification, but it is a *behavioural* unification and belongs after verification, as optional
cleanup (§8) — never inside the representation swap.

### 2.6 Loop identity

Today the loop string is its own identity: `loopIndexMap` is keyed by the literal string
([`kinematic-solver.ts:456`](../src/app/model/mechanism/kinematic-solver.ts)) and link lookups by
two-letter concatenation — the single-character assumption. `LoopEdge[]` is not value-comparable,
so `Loop.id` is built once at enumeration and used for every Map key, for dedup (§7.2), and for
debug output. Format: the first edge's `fromId`, then per edge `-${toId}` for a link and
`~${sliderId}~${toId}` for a slot. The four-bar above is `"A-B-C-D"`; the inverted slider-crank is
`"A-B-P~P~C"`. The separators make multi-character joint ids safe. At consumption sites,
`linkIndexMap` no longer needs pair-concatenation keys at all — edges carry `linkId` directly, so
key those maps by `linkId` alone.

---

## 3. The equations, term by term

Velocity pass, per slot edge, with the current frame resolved per §2.3:

- `û⊥ = (−sin θ, cos θ)`;
- `s = (p_P − p_A) · û` where `p_P` is the slider's position and `p_A` is `slotJointA`'s;
- unknowns: `ṡ` joins exactly as the grounded branch's slide rate does today, coefficient `û`;
  `ω₄` (carrier) is **already an unknown column** because the carrier's own link edges appear in
  the loop — the slot edge adds coefficient `s·û⊥` into that existing column. No new unknowns, no
  new matrix machinery.

Acceleration pass: `determineAng` runs `'Velocity'` before `'Acceleration'`
([`kinematic-solver.ts:83`](../src/app/model/mechanism/kinematic-solver.ts)), so by the time the
acceleration system is assembled, `ṡ` and `ω₄` are solved numbers. The Coriolis term `2·ṡ·ω₄·û⊥`
and the centripetal term `−s·ω₄²·û` are therefore **known** and go to the B side; `s̈` and `α₄`
remain unknown with the same coefficient shapes as the velocity pass.

Sanity anchor: a grounded slot has `ω₄ = α₄ = 0` and every new term vanishes, leaving `ṡ·û` /
`s̈·û` — today's branch, exactly.

---

## 4. Sequence overview

1. **Representation swap, no behaviour change** (§5). The verified suite must stay green and
   byte-identical.
2. + 3. **Slot enumeration and the new equation terms, landed together in one reviewable change**
   (§7), so there is never a state where loops close and the numbers are quietly wrong.
4. **Verification** (§8).

The IC solver is de-scoped and absent from this list (§6). Until §7 lands, the `hasFloatingSlot()`
guard at [`mechanism.ts:1206`](../src/app/model/mechanism/mechanism.ts) keeps returning an empty
analysis for floating slots; the guard is removed in the same change as the equations and their
tests, never earlier.

---

## 5. Step 1 — the swap, file by file

The producer:

- [`loop-solver.ts`](../src/app/model/mechanism/loop-solver.ts) — the single-character assumption
  lives here too: `findGround` accumulates `path` by string concatenation and tests membership with
  `linkPath.includes(j.id)` (`:72`). Rebuild the walk to accumulate `LoopEdge[]` (id arrays for the
  visited-set, not substring tests). The required-loop filter (`:84-102`) keeps identical
  semantics — an adjacent pair with no link, or a link revisited, demotes the loop. Note it for
  §7.3: it is the seam slot edges plug into. Prune the commented-out alternate implementations
  (`:80`, `:105-113`) instead of translating them.
- **Delete `allLoops`.** `LoopSolver` computes it and `Mechanism` stores it
  ([`mechanism.ts:30`](../src/app/model/mechanism/mechanism.ts), `:107`, `:601`, `:650-655`) but it
  has **zero consumers**. Remove the second return value entirely rather than converting dead
  output. (Re-grep at HEAD before deleting.)

The one live consumer:

- [`kinematic-solver.ts`](../src/app/model/mechanism/kinematic-solver.ts) — field `:27`; the
  loopless check `:78` (`requiredLoops.length === 0`, unchanged in meaning); the index-map building
  walks `:219` and `:233`; the `determineLin` walk `:357`; the `determineArrays` walk `:418`;
  `loopIndexMap` keying `:456-458` → `Loop.id`; the matrix-assembly walk `:463` and the `getLink`
  pair-key helper `:465`; delete the commented-out signature at `:616-620`.

Mechanical type-only touches (this is the "seven files" from §1):

- [`mechanism.ts`](../src/app/model/mechanism/mechanism.ts) — `_requiredLoops` field `:29`, reset
  `:602`, accessors `:642-648`, pass-throughs `:1002`, `:1005`, `:1210`.
- [`force-solver.ts`](../src/app/model/mechanism/force-solver.ts) — `MechanismFrames.requiredLoops`
  `:66`, the no-op adapter's parameter `:161`, the fallback-path assignment `:181`.
- [`analysis-graph.component.ts:860`](../src/app/component/analysis-graph/analysis-graph.component.ts).
- [`test-utils/verification/solve.ts`](../src/test-utils/verification/solve.ts) — `:57`, `:88`, `:90`.
- [`ic-solver.ts`](../src/app/model/mechanism/ic-solver.ts) — **untouched.** It is self-contained
  and uncalled (§6), so it keeps compiling against `string[]`.

Acceptance for step 1: the whole suite green, and the verified numbers byte-identical — the MATLAB
sixbar in `app.component.spec.ts`, Watt I, Stephenson III, the teaching-lab pair, and the grounded
slider specs (`teaching-lab-slider-crank`, `slider-crank-tracer`, `slider-guide-angle`), which pin
the `ω_carrier = 0` path. Preserve loop order and edge order exactly as the string order today:
matrix row and column ordering must not move, or "byte-identical" becomes "within tolerance" and
the safety net is gone.

---

## 6. The IC solver is dead code — task 2.11 de-scoped

Evidence, checked during review:

- Nothing imports `ic-solver.ts`. The only references in `src/` are a commented-out import and a
  commented-out call ([`mechanism.ts:7`](../src/app/model/mechanism/mechanism.ts), `:547`).
- `MechanismService.ics` ([`mechanism.service.ts:57`](../src/app/services/mechanism.service.ts)) is
  initialized empty and never filled.
- No spec file exercises `IcSolver`.

Task 2.11 was scoped assuming a live consumer; there isn't one — the instant-center feature was
never wired into the app. **Decision: 2.11 is de-scoped from Phase 2, and the IC case is removed
from Gate 2** (`joint-types-plan.md` records the same). Consequences for this plan:

- `ic-solver.ts` is **untouched by every step here**. It is self-contained and uncalled, so it
  keeps compiling against `string[]`; converting it "changing no behaviour" would have been hollow
  anyway — there is no behaviour to preserve and no test to keep green.
- The engine-side prerequisite an IC feature would someday need — a per-timestep-correct
  `slotAngle` — is delivered by this plan regardless.
- If the feature is ever revived, that is its own project: characterization tests first (four-bar
  IC positions are analytic), re-wire the call in `mechanism.ts`, then modernize — noting its loop
  walk is a triple-joint sliding window
  ([`ic-solver.ts:58-89`](../src/app/model/mechanism/ic-solver.ts)), not pairwise, and the
  `(∞, ∞)` TODO at `:116` belongs to that effort.

---

## 7. Steps 2 + 3 — enumeration and equations, one change

### 7.1 Where slot adjacency comes from

Do **not** put the carrier into `PrisJoint.links` or `connectedJoints`. That shape is deliberate
(see the comment above `hasFloatingSlot`,
[`mechanism.ts:1191`](../src/app/model/mechanism/mechanism.ts)); the position solver depends on it,
and mutating it was the rejected Option A move. Instead, `LoopSolver` builds an internal
supplemental adjacency before walking: for each `PrisJoint` with `isFloating && isSlotWellFormed`,
the carrier's joints are offered as neighbours of the slider (and the slider as a neighbour of
each of them). Crossing that adjacency emits a `slot` edge.

### 7.2 One edge per crossing, and canonicalization

The slot's defining joints only fix its line — the walk must not turn one sliding pair into two
constraints (`P→C` *and* `P→D` in the same loop), which would fabricate loops. One crossing, one
edge, `toId` = whichever carrier joint the walk actually continues through.

Because the walk can enter the carrier through either slot joint (or any other carrier joint),
several superficially different paths describe the same circuit. Dedup rule: two loops are
duplicates iff their traversed-connection multisets — all `linkId`s plus all `sliderId`s — are
equal; keep the lexicographically smallest `Loop.id`. Deterministic, and independent of traversal
order.

### 7.3 The required-loop filter

The filter at [`loop-solver.ts:84-102`](../src/app/model/mechanism/loop-solver.ts) currently
demotes any adjacent pair that has no link — which is precisely what a slot edge is. Update it so a
slot edge is a legitimate loop member, and count `sliderId` in the traveled-connection bookkeeping
exactly like a link id (a loop reusing the same slot twice is not required, same as a link).

### 7.4 The equations land in the same PR

The §3 coefficients, the removal of the `hasFloatingSlot()` guard in `kinematicLoopAnalysis`, and
the §8 tests ship together. Between step 1 and this change, floating slots keep returning an empty
analysis; no intermediate state ships.

---

## 8. Step 4 — verification

- **Inverted slider-crank and Scotch yoke** against analytic `ṡ` and `s̈`, obtained by
  differentiating the position closed form already pinned in
  [`inverted-slider-crank.spec.ts`](../src/tests/verification/inverted-slider-crank.spec.ts) —
  §4.3 of the plan prefers analytic references over sampled MATLAB, and none is needed here.
- **Whitworth quick-return** against its published time ratio — the ratio is wrong if and only if
  the Coriolis/carry terms are wrong, which makes it the end-to-end check.
- **Grounded regression**: the existing slider specs stay byte-identical; nothing about a grounded
  mechanism's path may change.
- Optional cleanup once green: unify grounded slots into `slot` edges with `ω_carrier = 0` and
  delete the `SliderBlock` constructor-switch branches (§2.5) — only with the suite as the net.

---

## 9. Decision record — options considered

| Option | Summary | Outcome |
| --- | --- | --- |
| A — supplementary slot-edge lookups beside the strings | Cheapest to write | **Rejected.** Doubles the lookup logic in the hardest-to-read solver to preserve a format whose only live consumer is that same solver, and adds a second way to be ambiguous |
| B — typed edges | This document | **Chosen** |
| C — finite-difference velocity/acceleration for slot mechanisms | Machinery already ships | **Rejected** as a deliverable: acceleration from a second difference of 1° samples is visibly noisy, and acceleration is the quantity students analyze; the plan forbids a numerical path replacing an exact one (§2.7a). Acceptable only as a temporary demo stopgap, and useful later as a cross-check harness |

---

## 10. Deferred

§7 open question 2 of the plan — whether a slot the closed-form inverse primitive cannot reduce is
refused in the panel with a reason, or allowed through to the "unsolvable" strategy — is Phase 4,
not this. The engine reports it either way today. This document adds no new open questions.
