# Phase 3 — Slide (pure prismatic): implementation spec

Companion to [`joint-types-plan.md`](joint-types-plan.md) §Phase 3. The plan says what Phase 3 is
for; this says what it does, in what order, and what each step drags along behind it.

Everything under "Baseline" below was measured against `staging` at `d632417`, not inferred — a
throwaway Scotch-yoke fixture was built, run through `Mechanism`, `PositionSolver`, `ForceSolver`
and the URL codec, and then deleted.

---

## 1. What a Slide is

A **Slot** (Phase 2) is a slider whose rider may rotate in the block. A **Slide** is the same
assembly with that rotation removed: the rider is rigid with the block, so the rider's orientation
is the slot's orientation and the pair has one freedom — travel along the slot.

```
carrier ──── P   (PrisJoint: grounded angle, or carrier + slotJointA/B)
              │
         SliderBlock
              │
             R   (RevJoint: isWelded ← the whole of the weld, for a Slide)
              │
            rider
```

The plan's §2.1 2×2 is a property of this **assembly**, not of one joint: `isPrismatic` lives on
the `PrisJoint`, `isWelded` on the `RevJoint`, and neither record alone says "Slide".

**The one sentence that makes Phase 3 different from Phase 2.** A Slot's carrier is reached across
the slot and swung about an anchor; a Slide's rider cannot rotate at all, so it is reached by
*translation along its guide* — and no primitive in the solver does that. §3.6 is therefore new
solver work, not a flag check.

---

## 2. Baseline: what happens today

The reference mechanism is the Scotch yoke, which is what Gate 3 asks for. Modelled the way the
app models sliders:

| Object | Value |
| --- | --- |
| `A` | (0, 0), ground, input — crank pivot |
| `B` | (1, 0) — crank pin, r = 1 |
| `C` | (1, −2) — the yoke's joint on the horizontal guide |
| `D` | (1, 1) — the yoke's second joint; `C→D` is the vertical slot |
| `E` | (1, 0) `PrisJoint`, floating on link `CD` via (`C`, `D`) |
| `F` | (1, −2) `PrisJoint`, grounded, `angle_rad = 0` |
| links | `AB` crank, `BE` block, `CD` yoke, `CF` block |

The Slide is the weld at `C`, binding the yoke `CD` to the block `CF` that rides the grounded
guide `F`. Expected motion: `x_C = r cos θ`, `ẋ_C = −rω sin θ`, `ẍ_C = −rω² cos θ`.

Measured, with `C.isWelded = true` set by hand:

| Question | Answer today |
| --- | --- |
| Mobility | **DOF 2** — identical welded and unwelded. The flag changes nothing. |
| Loop enumeration | **`A-B-E~E~C-F`** — one loop, correct, no work needed. |
| Position ordering | places `B`, then `E`; **`unsolvableJoints = ['C', 'D']`** |
| URL round-trip | **already correct**: `C:isWelded=true`, `E:carrierID=CD` |
| Per-timestep copies | **already correct**: `cloneJointAt` copies `isWelded` at t = 0 and every later frame |
| Statics | **`unsupported-topology`** — *"Force equilibrium has 10 equations and 9 unknowns."* |

Three things fall out of that table and they set the shape of the phase:

1. **Serialization and cloning are already done** (3.4, 3.5 → assertions, not code).
2. **Loop enumeration is already done** — the Phase 2 rewrite to typed edges covers the Slide
   case unchanged.
3. **Mobility, position and velocity are genuinely missing**, and the position gap is the one the
   plan understates. Statics is missing too, but it is scoped out (3.8, §9) — Phase 3 makes its
   refusal causal instead of accidental.

---

## 3. Tasks

### 3.0 — One definition of a slide assembly *(build this first)*

Eight places have to agree on the same question — *which bodies does this weld make rigid?* — and
they are spread across lifecycle code (3.2 dispatcher, 3.2b reconcile), the mobility count (3.3),
the position solver (3.6), the kinematic solver's **three** registration paths (3.6b), the panel
guard (3.7), and later force analysis (§9). Phase 1 established the precedent when the drag refusal and the weld
warning were made to share [`rigid-bodies.ts`](../src/app/model/rigid-bodies.ts) so "what counts as
one rigid body" could not drift between them. The same applies here, with more consumers.

New leaf module, `src/app/model/slide-assembly.ts`:

```ts
export interface SlideAssembly {
  /** The welded RevJoint that binds rider to block. */
  weldJoint: RealJoint;
  /** The zero-length block (§2.10 item 1). */
  block: SliderBlock;
  /** The sliding joint at the block's far end. */
  slider: PrisJoint;
  /** Every RealLink rigidly bound at the weld — exactly one after reconcile; see below. */
  riders: RealLink[];
  /** The slot is fixed in the world, so the assembly cannot rotate. */
  grounded: boolean;
}

export function slideAssemblyAt(joint: Joint): SlideAssembly | undefined;
export function slideAssemblies(joints: Joint[]): SlideAssembly[];
/** Every body the weld fuses: the block and the riders. *The* body set. */
export function assemblyBodyIds(assembly: SlideAssembly): string[];
```

Keep the record to what cannot be derived. `bodyIds` is `[block.id, ...riders.map((r) => r.id)]`
and is a function, not a field — a stored copy is a second source of truth for the one question
this module exists to answer.

Resolution, in one place: the joint is a `RealJoint` with `isWelded`; exactly one `SliderBlock` in
its `links` (more than one is the refused "two blocks on one pin", not a Slide); that block holds
exactly this joint and a `PrisJoint`; at least one `RealLink` is present; `grounded = slider.ground`.
Anything else resolves to `undefined`.

**`riders` is a list, and it is transiently allowed to hold more than one.** A completed weld fuses
the `RealLink`s at the joint into a single compound, so the settled value is always exactly one.
But the flag can outrun the compound mid-edit — `mergeJoints` deliberately takes a weld apart and
rebuilds it around the survivor, and a `deleteJoint` that collapses a compound to one member leaves
the flag behind ([`mechanism.service.ts:851-863`](../src/app/services/mechanism.service.ts)).

Resolution therefore *accepts* that state rather than refusing it, and **3.2b repairs it by building
the compound** — it does not merely tolerate it, and it does not strip the flag. Refusing would
make 3.2b read "not a Slide" and silently destroy a weld the user made; tolerating without
repairing would let a malformed mechanism look settled to all eight consumers. Repair is the rule
`reconcileSlots` already set for slots: remap to the compound when you can, give up only when you
cannot.

So the invariant is **post-reconcile, not always-on**: after `finishStructuralEdit`, every resolved
assembly has `riders.length === 1`. Assert it there (test 15) rather than inside the resolver.

*Import-cycle trap.* `joint.ts` and `link.ts` form a runtime cycle that the codebase works around
with type-only imports and an `import '../model/joint'` first line in specs. This module needs both
at runtime (it uses `instanceof`), so it must stay a **leaf**: consumers import it, and neither
`joint.ts` nor `link.ts` ever does.

Everything below consumes this record. No consumer re-derives "is this a Slide?" locally.

### 3.1 — Lift the `PrisJoint` exclusion in `canBeWelded`

[`joint.ts:115-129`](../src/app/model/joint.ts) refuses a weld when any connected joint is a
`PrisJoint`. Drop that clause; keep the `input`, `ground` and `links.length < 2` clauses.

*Consequences.*

- The Scotch yoke's `C` has `links = [CD, CF]`, so `links.length < 2` does not bite. Good.
- An ordinary slider-crank's pin becomes weldable, producing a **DOF 0** mechanism. That is
  correct — welding a slider-crank's coupler to its block *is* rigid — and it is reported, not
  crashed. Covered by test 6.
- `mergeJoints` re-welds the survivor through `weldJointTopology`
  ([`mechanism.service.ts:589`](../src/app/services/mechanism.service.ts)). With the exclusion
  lifted and a block present, that call must reach the assembly path or it silently builds nothing.
  Handled in 3.2; do **not** land 3.1 alone.
- The panel ([`edit-panel.component.ts:937`](../src/app/component/edit-panel/edit-panel.component.ts))
  and the canvas context menu ([`new-grid.component.ts:355`](../src/app/component/new-grid/new-grid.component.ts))
  both read `canBeWelded`, so they inherit the change with no edit.

### 3.2 — Assembly weld / unweld

`weldJointTopology` filters `link instanceof RealLink`
([`mechanism.service.ts:1630`](../src/app/services/mechanism.service.ts)), and a `SliderBlock` is
not one, so a block can never enter a compound. For the Scotch yoke there is only *one* `RealLink`
at `C`, so the existing path returns `false` and the click does nothing.

**Structure this as one topology-level dispatcher, not as a branch inside the public actions.**
Four callers need it, and they do not all want the same wrapper: `weldJoint`, `unWeldJoint` and
`unweldAll` finish with `finishStructuralEdit(true)` and earn an undo entry, while `mergeJoints` is
the tail of a drag and must **not** produce an intermediate one of its own — the gesture owns the
single entry it earns ([`:591-593`](../src/app/services/mechanism.service.ts)). So the split is:

- `weldTopology(joint)` / `unweldTopology(joint)` — pure topology, no rebuild, no save. These are
  what dispatch on `slideAssemblyAt`, and they are the *only* place that dispatch happens.
- the public actions and `unweldAll` wrap them with `finishStructuralEdit`; `mergeJoints` calls
  them bare, exactly as it calls `weldJointTopology`/`unweldJointTopology` today.

Putting the dispatch in `weldJoint`/`unWeldJoint` instead would leave `mergeJoints` on the
compound-only pair, which is the failure described below.

Behaviour of the dispatcher when the joint carries a `SliderBlock`:

- **Weld.** If ≥2 `RealLink`s meet at the joint, run `weldJointTopology` first so the rider side
  becomes a compound exactly as an ordinary weld does — this is the answer to §7 open question 3,
  "two links riding one block": all bodies at the joint become rigid, which is what the 2×2 means.
  Then set `isWelded = true` unconditionally. Ordering matters: `weldJointTopology` early-returns
  when `joint.isWelded` is already set.
- **Unweld.** Clear `isWelded`, and dissolve the compound too if one exists.
  `unweldJointTopology` currently clears the flag and then returns **`false`** when it finds no
  compound ([`:1678-1681`](../src/app/services/mechanism.service.ts)), so `unWeldJoint` skips
  `finishStructuralEdit` — the flag would be dropped with no rebuild and no undo entry. **This is a
  bug the assembly case walks straight into and it must be fixed as part of 3.2.**
- `unweldAll` must reach assembly welds too, or "Unweld All" leaves Slides welded.

**`mergeJoints` routes through the same dispatcher, and this is work rather than a consequence.** A
drag that lands on a Slide's pin hits both Phase 1.2 rows at once — "the revolute half of a slider"
and "a welded joint" — and the merge takes the weld apart and rebuilds it around the survivor
([`:556-589`](../src/app/services/mechanism.service.ts)). Left calling the compound-only pair, the
Slide survives only by accident: `unweldJointTopology` finds no compound, clears the flag and
returns `false`; the later `weldJointTopology` then rebuilds a weld only when the arriving link
happens to bring the `RealLink` count to two — so whether a Slide survives a drag depends on what
was dragged onto it. Point both calls at `weldTopology`/`unweldTopology`. Pinned by test 11.

**A rider made of several links is supported, not special-cased.** Welding a joint that holds two
`RealLink`s and a block fuses the two into a compound *and* binds it to the block: every body there
becomes rigid, which is what the 2×2 means. That is §7 open question 3, answered. `riders` collapses
to the single compound, and 3.3 merges compound + block. Pinned by test 12.

### 3.2b — An assembly weld must not outlive its block

The mirror of `reconcileSlots` (§2.8a). Turning the Slider toggle off at a Slide (`toggleSlider`,
[`:1210`](../src/app/services/mechanism.service.ts)) leaves a `RevJoint` flagged welded with no
block and possibly a single link — a state the compound path can never produce and no consumer
expects.

Two rules, enforced in `finishStructuralEdit` beside `reconcileSlots` and phrased against 3.0's
resolver so they cannot drift from what the solvers consider an assembly. **Repair before you
strip** — the order matters, and it is the same order `reconcileSlots` uses:

1. **Repair.** A resolved assembly whose `riders` holds more than one link gets its compound built,
   through the same `weldJointTopology` an ordinary weld uses. `riders` collapses to one.
2. **Strip.** A joint flagged welded for which `slideAssemblyAt` resolves *nothing*, and which
   holds no compound, loses the flag. There is nothing left to repair it into.

A legitimate Slide always resolves, so rule 2 cannot fire on one — assert that explicitly (test 5),
because a reconcile that quietly unwelds every Slide would pass most of the suite. And rule 1 is
what makes the post-reconcile `riders.length === 1` invariant of 3.0 true rather than hoped for
(test 15).

**`toggleSlider` has to be routed there, or the rule can never fire.** It ends at
`updateMechanism(true)` ([`:1231`](../src/app/services/mechanism.service.ts)) — `finishStructuralEdit`
is never called, so neither `rebuildJointGraph`, `reconcileSlots`, nor the new rule runs after a
slider is removed. That is a pre-existing gap that Phase 2 did not hit because removing a slider
takes the `PrisJoint` with it and `reconcileSlots` only walks surviving ones; a Slide leaves the
*`RevJoint`* behind, still flagged. Route `toggleSlider`'s removal branch through
`finishStructuralEdit(true)`.

Watch the blast radius: `finishStructuralEdit` also calls `rebuildJointGraph`, which re-derives
`links`/`connectedJoints` from link membership, and `toggleSlider` edits both of those by hand
just above. The rebuild should make that hand-editing redundant rather than fight it — verify
against the creation branch too, which the same call now covers.

### 3.3 — Mobility

`determineRigidBodies` ([`mechanism.ts:275`](../src/app/model/mechanism/mechanism.ts)) delegates to
`groupRigidBodies`, which merges bodies sharing **two or more** joints. A rider and its block share
exactly one, so the weld is invisible to it.

Add the assembly merge by extending [`rigid-bodies.ts`](../src/app/model/rigid-bodies.ts) with an
explicit extra-merges argument, fed from 3.0: `slideAssemblies(joints).map(assemblyBodyIds)`.
`Mechanism` supplies the list; `rigid-bodies.ts` stays the only place that says what one rigid body
is, as Phase 1 established.

*Verified arithmetic.* Scotch yoke, unwelded: N = 5, J₁ = 5, DOF = 3(4) − 2(5) = **2**. Welded, with
`CD` and `CF` merged: N = 4, `C` drops to `bodiesAt = 1` so J₁ = 4, DOF = 3(3) − 2(4) = **1**. The
prototype reproduced both numbers.

*Consequences.* A mechanism with no welded slider joint gets an empty extra-merge list, so every
existing fixture is untouched by construction — assert it anyway (test 9).
`weldWouldPinTwice` and the drag refusal read `redundantlyHeldJointSets`, which needs no change: a
block has exactly two joints and one of them is a `PrisJoint` that no `RealLink` holds, so a block
can never share two joints with anything.

### 3.4 — Per-timestep copies

**Already correct.** `cloneJointAt` copies `isWelded` for every `RealJoint`
([`mechanism.ts:135`](../src/app/model/mechanism/mechanism.ts)) and is the copy path for both t = 0
and every later frame ([`:407`](../src/app/model/mechanism/mechanism.ts)). Verified: the DOF
prototype read the flag off `joints[0]` and got the right answer.

The task is the regression: assert at a **late** timestep that the flag survived *and* that the
block↔rider pairing did (§2.10 item 1). The flag alone does not mean "Slide" — the pairing is what
makes it one, and a copy path that kept the flag while losing the block would leave a welded joint
the reconcile rule of 3.2b would then strip.

### 3.5 — Serialization

**Already correct.** `isWelded` is flag bit 3 and round-trips independently of the slot tokens;
verified end to end on the welded Scotch yoke.

The task is coverage across all four 2×2 cells — pin, compound weld, Slot, Slide — each encoded,
decoded, rebuilt, and **re-encoded byte-identically**, plus the §2.10 invariants after rebuild.
The one real risk to pin down: a rebuild from a URL produces a Slide with no compound, and nothing
may "repair" it by clearing the flag. 3.2b's reconcile is the thing most likely to; assert it does
not.

Per the repo's fixture-URL rule ([`CLAUDE.md`](../CLAUDE.md)), add the Scotch yoke to
`FIXTURE_GALLERY` and regenerate `docs/fixture-urls.md`, so a reviewer gets a clickable link
instead of a coordinate table. Its links only decode on a Phase 3 build, so regenerate against the
PR's deploy preview for review.

### 3.6 — Position solver *(the substantive task)*

The plan's one-liner — "a welded rider has no relative rotation at the block" — describes the
velocity consequence and skips the position one. Measured: the yoke's joints are simply
**unreachable**. `orderCarrierFromBlock` needs one slot joint already known (neither `C` nor `D`
is), and `orderRiderOnMovingSlot` needs both. The pass ends with `unsolvableJoints = ['C', 'D']`.

**A welded slide assembly is a rigid body with exactly one translational freedom along its guide.**
That is the primitive, and it decomposes into two pieces:

**(a) Translation propagation.** Once any joint of the assembly is placed, every other joint of it
follows by the *same* vector — no rotation, so no rigid-transform bookkeeping. This is a
multi-target step, which the Phase 2 step representation already supports (§2.7a item 1:
`jointNumOrderSolverMap` holds a target *set*).

**(b) A new ordering primitive**, `slideAssemblyThroughSlot`, sitting in `orderDeferredJoints`'
chain after `orderCarrierFromBlock`:

- *Preconditions*, read off the 3.0 record rather than re-derived: `assembly.grounded`, giving a
  fixed guide direction `û` from `assembly.slider.slotAngle`; the assembly carries a floating slot
  whose block point `P` is already known; and because the assembly cannot rotate, the slot direction
  `v̂` is its t = 0 direction and is constant.
- *Targets: the movable joints of the assembly.* A grounded **pin** is excluded —
  an assembly holding one could not translate at all. A grounded **sliding
  joint** is not excluded, and the first draft of this spec had that backwards.
  "Grounded" on a `PrisJoint` means its slot *line* is fixed in the world, not
  that the joint sits still: the line is recorded once in `slotLineMap` and read
  from there, while the joint itself is drawn at the block and has to stay on
  top of the pin it carries (§2.10 item 2). `circleLineIntersectionPoints` has
  always moved it for ordinary grounded sliders. Leaving it behind stretched the
  zero-length block a little further every timestep — caught by the invariant
  test, not by the closed form. Pinned by test 13.
- *A grounded member is not a motion source.* Grounded joints are seeded as
  known before the walk starts, so "already placed" has to mean placed by a
  step. Reading travel from the assembly's own sliding joint — known from the
  first moment, and not moved until this step moves it — reports the assembly
  permanently at rest.
- *Solve.* With `C₀` the assembly's reference joint at t = 0, the translation `t` satisfies
  `((P − C₀) − t·û) × v̂ = 0`, so `t = ((P − C₀) × v̂) / (û × v̂)`. Every assembly joint lands at
  `start + t·û`.
- *Degenerate case.* `û × v̂ ≈ 0` — guide parallel to the slot — has no solution. Return `false`,
  which `findFullMovementPos` already reads as a toggle and answers by reversing, the same contract
  `inverseSlot` uses for a block passing through its anchor.
- *Residual.* `(P − C) × v̂` as a pure function, asserted to vanish at every sample (§2.7a item 3).

**"`v̂` is constant" is the weld doing the work**, and it is the whole reason this primitive belongs
to Phase 3 rather than Phase 2. Write that in the code comment; it is the invariant a later reader
will be tempted to relax.

The `detJointOrder` defer guard ([`position-solver.ts:411`](../src/app/model/mechanism/position-solver.ts))
needs no change.

### 3.6b — Velocity and acceleration

The weld removes one unknown: a welded rider's angular velocity is the block's, which for a
grounded guide is zero. Two edits:

- `kinematicsInitializer` seeds `linkAngVelMap = 0` and `linkAngAccMap = 0` for every member of
  `assembly.riders` where `assembly.grounded`.
- **No registration path may hand such a rider a column.** There are three, and naming only one is
  how the seed gets overwritten:
  1. `registerSlotUnknowns` ([`kinematic-solver.ts:459`](../src/app/model/mechanism/kinematic-solver.ts)),
     which claims a column for a carrier reached across a slot — the Scotch yoke's path;
  2. the `RealLink` branch of `kinematicsInitializer`
     ([`:366-388`](../src/app/model/mechanism/kinematic-solver.ts)), which claims one for any
     non-input `RealLink` reached through an ordinary **link** edge;
  3. `determineArrays` ([`:767-775`](../src/app/model/mechanism/kinematic-solver.ts)), which
     rebuilds the same list every timestep and must stay in step with (1) and (2) or a column index
     points at the wrong unknown.

  The Scotch yoke happens to reach its yoke only across the slot, so (1) alone would pass Gate 3
  while leaving (2) live for any topology where the welded rider also sits on a link edge — the
  two-links-riding-one-block case of test 12 is exactly that. `determineAng` then writes the solved
  value straight over the seeded zero (`linkAngVelMap.set(linkOrJoint.id, X[i][0])`,
  [`:488`](../src/app/model/mechanism/kinematic-solver.ts)), so the failure is a *wrong number*, not
  a singular matrix — the worst mode available. Gate the three with one shared
  `hasFixedOrientation(link, assemblies)` predicate, and extend test 12 to assert
  `ω_rider = α_rider = 0` there too.

All of these are `slideAssemblies(simJoints)` lookups, not local `isWelded && has-a-block` tests.
The solvers run against per-timestep copies, so resolving there rather than caching a body set from
t = 0 is also what keeps this clear of the bug class `rebindSlot` exists for.

*Verified arithmetic.* The single loop gives 2 equations. Without this, the unknowns are
`{ω_yoke, ṡ_E, ṡ_C}` — 3 columns, singular. With it, `{ṡ_E, ṡ_C}`, and the coefficient matrix is
`[v̂ | −û]` with `v̂ ⊥ û`, so it is well conditioned.

`spreadCarrierMotion` then finds its seed without further work: `determineAng` runs before
`determineLin`, and the `SliderBlock` branch writes `jointVelMap(C)` using
`desiredAngleMap(C) = F.slotAngle`, so `knownCarrierSeed` succeeds on `C`.

Assertions: `ẋ_C = −rω sin θ`, `ẍ_C = −rω² cos θ`, and `ω_yoke = α_yoke = 0` at every sample. The
last is the one that fails if only the position half lands.

### 3.7 — Panel guard

With 3.2's dispatcher in place, the panel
([`edit-panel.component.html:92-94`](../src/app/component/edit-panel/edit-panel.component.html))
needs no new branch — but it needs one model fix first, or the "never ambiguously" half of the
plan's requirement is false on arrival.

**`canBeWelded` does not test `isWelded`, and for a Slide that starts to matter.** It gets away
with it today because a compound weld collapses the joint's links to one, so `links.length < 2`
disables the Weld button afterwards. A Slide keeps two — the rider and the block — so after welding,
`canBeWelded()` stays `true` while `canBeUnwelded()` is also `true`, and the panel's two buttons
light up together. Add `!this.isWelded` to the guard in
[`joint.ts:115-129`](../src/app/model/joint.ts). It is a no-op for every existing case (a welded
joint already fails the length test) and it is what makes the Weld/Unweld pair exclusive by the
model rather than by accident of link counting. Pinned by test 14.

With that, what the plan asks for — "acts on the assembly when a slider is present, on the compound
otherwise, never ambiguously" — becomes a unit assertion on `MechanismService` rather than UI work,
which is where it can actually be pinned down.

One behaviour change to assert rather than discover: `new-grid.component.ts:952-963` reports when a
merge dropped a weld, because `canBeWelded` used to refuse slider-carrying joints. After 3.1 that
merge **keeps** the weld and the notification stops firing for that case.

Wording ("Slide" vs "Weld") belongs to Phase 4.1's two-toggle panel. Do not start renaming here.

### 3.8 — Statics: refuse honestly, and say why *(not in the plan; added)*

Phase 3 does **not** implement force analysis for a welded assembly. It ships a refusal that names
the cause, and full statics becomes its own specified piece of work (§9).

Today a welded assembly already returns `unsupported-topology` — *"Force equilibrium has 10
equations and 9 unknowns"* — because the equation/unknown guard at
[`force-solver.ts:286`](../src/app/model/mechanism/force-solver.ts) happens to catch it. That is the
right outcome reached the wrong way, and leaving it there is the actual risk: the count is
incidental, so any later change to how reactions are enumerated could make the two numbers agree by
coincidence and start shipping wrong reactions with an `ok` status. In a teaching tool that is the
failure mode the plan calls the worst available.

So the work is small but not zero:

- Guard **before** the count check, keyed on `slideAssemblies(joints).length > 0` from 3.0, so the
  diagnosis is causal rather than arithmetic.
- Message names the joint, in a sentence a student can act on — *"Force analysis does not yet
  support the welded slider at C."* — instead of reporting matrix dimensions.
- The count guard stays as the backstop it already is.
- Test pins both the status and the message, and pins that an *unwelded* Slot on the same fixture
  still analyses normally, so the guard cannot widen unnoticed.

*The physics, recorded so §9 does not have to rediscover it.* A prismatic pair transmits a normal
force **and a couple**. While the block is a free-rotating body with only two equations, the couple
never appears; once welded to the rider, the merged body has a moment equation and the guide must
supply one. Merging rider ∪ block into one free body and giving the pair a second column balances
the Scotch yoke exactly: bodies crank (3) + block `BE` (2) + assembly (3) = 8 equations; unknowns
`A`(2) + `B`(2) + `E`(1) + `F`(2) + input torque (1) = 8.

---

## 4. Explicitly out of Phase 3: the floating Slide

A Slide on a *moving* carrier — the hydraulic cylinder of §2.7 — is **not** in this phase, and the
reason is worth recording because "the weld binds the rider to the carrier" sounds like the same
work.

It is not. Worked through on the swinging-block / oscillating-cylinder mechanism: the rider's angle
tracks the carrier's, which is *itself* unknown, so the position order deadlocks — no primitive can
place either one first. It resolves as a simultaneous two-unknown solve for `(θ, s)`, which is
precisely what §2.7a hands to the "report unsolvable" strategy. The velocity side needs the
rider's column *aliased* onto the carrier's rather than seeded to zero, which is a different
mechanism from 3.6b.

Phase 3 therefore:

- keeps the **encoding** working — all four 2×2 cells round-trip whether the slot is grounded or
  floating, since the flags are independent of it;
- and makes a floating Slide **name the joints it cannot place** rather than going singular. The
  ordering pass already does this (`unsolvableJoints`), so the task is the test, not the code.

Phase 5 picks it up with the cylinder, where the driven-prismatic and units work already lives.

---

## 5. Test ladder

| # | Case | Asserts |
| --- | --- | --- |
| 1 | Scotch yoke at N crank angles | `x = r cos θ`, `ẋ = −rω sin θ`, `ẍ = −rω² cos θ`; `ω_yoke = α_yoke = 0` |
| 2 | Scotch yoke with the slot joints declared `(D, C)` | declaration order does not change the answer — the exact bug class review caught in Phase 2 |
| 3 | Guide parallel to the slot | refused, not divided by ~0 |
| 4 | All four 2×2 cells | encode → decode → rebuild → re-encode byte-identically |
| 5 | Assembly invariants (§2.10 items 1–5, 7) | hold after weld, unweld, clone, carrier deletion, and `toggleSlider` off |
| 6 | Welded ordinary slider-crank | reports DOF 0 — the weld does something, and it is reported |
| 7 | Floating Slide | names its unsolvable joints; no NaN, no picture |
| 8 | `toggleSlider` off at a Slide | clears the weld (3.2b), and does not clear a legitimate one |
| 9 | Every Phase 0–2 fixture | DOF and solved positions unchanged; `Slider_Crank` template still byte-identical |
| 10 | Scotch yoke statics | refused as `unsupported-topology` naming the joint; the same fixture **unwelded** still analyses normally |
| 11 | Drag a joint onto a Slide's pin | the Slide survives the merge — flag set, block intact, `slideAssemblyAt` resolves, and `new-grid`'s "weld was dropped" notice does not fire |
| 12 | Weld a joint holding two `RealLink`s and a block, **reached through a link edge** | the two fuse into a compound *and* bind to the block; `riders` collapses to one; DOF merges compound + block; round-trips; and `ω_rider = α_rider = 0` — the registration path 3.6b(2) covers |
| 13 | Scotch yoke, sliding joint `F` across the cycle | stays coincident with its pin *and* on its guide line — the two pull opposite ways |
| 14 | A welded Slide's panel guards | `canBeWelded()` is `false` and `canBeUnwelded()` is `true` — never both |
| 15 | A Slide whose flag outran its compound | reconcile **rebuilds** the compound rather than stripping the flag or leaving two riders; after any `finishStructuralEdit`, every resolved assembly has `riders.length === 1` |

Method follows §4.3: closed form rather than sampled data, since one exists for every case here.
Every new assertion mutation-checked, as in Phases 1 and 2 — in particular, test 1 must fail when
3.6b's zero-seed is removed, tests 5 and 8 when 3.2b's reconcile is removed, test 11 when
`mergeJoints` is pointed back at the compound-only pair, test 12 when the fixed-orientation
predicate is dropped from registration path (2) alone, test 13 when the target set is widened to
every joint of every assembly body, and test 10 when the causal guard is removed (the count guard
alone must not be enough to keep it passing, or the guard is not earning its place).

Tests 12 and 13 exist because both failures are *plausible pictures*: a rider that keeps a spurious
angular-velocity column animates and reports a wrong ω, and a translated guide slides across the
world while the linkage still looks assembled. Neither surfaces as a NaN.

---

## 6. Files

| File | Change |
| --- | --- |
| `model/slide-assembly.ts` **(new)** | 3.0 — the resolver every other row consumes |
| `model/joint.ts` | 3.1, and the `!isWelded` guard of 3.7 |
| `services/mechanism.service.ts` | 3.2 dispatcher, 3.2b, `mergeJoints` routing, `toggleSlider` routing |
| `model/rigid-bodies.ts`, `model/mechanism/mechanism.ts` | 3.3 |
| `model/mechanism/position-solver.ts` | 3.6 — new step kind, new ordering primitive, residual |
| `model/mechanism/kinematic-solver.ts` | 3.6b |
| `model/mechanism/force-solver.ts` | 3.8 — causal refusal only |
| `test-utils/verification/slot-fixtures.ts`, `fixture-gallery.ts`, `docs/fixture-urls.md` | Scotch yoke fixture + published link |
| `docs/joint-types-plan.md` | Gate 3 status, §7 item 3 resolved, floating-Slide deferral recorded |

No UI files change. Phase 4 owns the panel and the glyphs.

---

## 7. Gate 3

Restated from the plan, with what I will treat as "met":

> Scotch yoke matches `x = r cos θ`, `ẋ = −rω sin θ`, `ẍ = −rω² cos θ`; all four 2×2 cells
> round-trip; assembly invariants hold after weld, unweld, clone, and carrier deletion.

Met when all fifteen ladder rows pass, the full suite is green with no existing fixture's DOF or
solved positions moved, the production build is clean, and the Scotch yoke has a published URL a
reviewer can open on the PR's deploy preview.

Force analysis for a Slide is **out of Gate 3** by decision, not omission: it refuses with a
message that names the joint, and §9 carries it.

---

## 8. Open questions

1. **Whether a Slide should appear in the analysis panel at all** while §9 is outstanding — a row
   that says "unsupported" versus no row. Phase 4 owns the panel, so this only needs answering if
   the refusal reads badly in use.

*Closed:*

- **Whether `riders` may hold more than one link.** Yes, transiently, and 3.2b **repairs** it by
  building the compound. Tolerating without repairing would let a malformed mechanism look settled
  to all eight consumers; refusing would make 3.2b destroy a weld the user made. Repair is the rule
  `reconcileSlots` already set, and it makes `riders.length === 1` a real post-reconcile invariant
  rather than an aspiration. Pinned by test 15.
- **§7 item 3, "two links riding one block"** — 3.2 answers it, test 12 pins it.
- **Where the mobility merge lives** — `rigid-bodies.ts`.

---

## 9. Follow-up: statics for welded assemblies

Deliberately **not** in Phase 3, and to be specified on its own rather than left as optional work
inside this one. Recorded here so its scope is visible rather than implied — it is wider than the
equilibrium change that makes it sound small:

- **Solver.** Merge rider ∪ block into one free body (combined mass, combined CoM, MoI by parallel
  axis) and give the prismatic pair a second column for the couple. The arithmetic is worked out
  in 3.8 and balances.
- **Result schema.** `ForceAnalysisFrame` carries reactions as `ForceVector`s
  ([`force-solver.ts`](../src/app/model/mechanism/force-solver.ts)). A couple is not a vector, so
  either the schema grows a moment channel or moments are reported through a parallel map — a
  decision that reaches every consumer of `jointReactionsByLink`.
- **Reaction indexing.** `buildReactionIndex` pairs joints with root bodies and both analysis panels
  enumerate rows from it. A merged body needs an identity: the compound's id, or a synthesised one.
- **Analysis UI.** A moment reaction needs a unit, a sign convention, and somewhere to appear.
- **Verification.** A loaded Scotch yoke with reactions equal and opposite across the slot and the
  guide couple balancing, in the shape of Phase 2's `slot-forces.spec.ts`.

The honest refusal from 3.8 is what makes deferring this safe: nothing ships a number until this
lands.
