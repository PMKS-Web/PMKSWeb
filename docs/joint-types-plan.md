# Joint types: floating sliders, prismatic joints, and cylinders

Plan of record for extending PMKS+ from "revolute joints plus one grounded slider" to the
joint set needed for the standard 2D kinematics curriculum.

Branch: `floating-sliders`.

---

## 1. Scope

### In

| Joint | Grounded | Floating | Driven |
| --- | --- | --- | --- |
| Pin (R) | have | have | grounded: have · floating: **new** |
| Slot (RP) | have | **new** | grounded: have · floating: **new** |
| Slide (P) | **new** | **new** | **new** (this is the cylinder) |

### Explicitly out

- **Gear (G) joints.** A gear is irreducibly a 2-DOF relation between two named links with no
  block-body decomposition available. Excluding it is what lets us keep the point-centric model
  (see §2.2).
- **Driving the R half of an RP.** Kinematically it is a reparameterisation of driving the P half
   — same configurations, different time mapping — and a rotary actuator on a linear carriage is
  rare. Excluding it means every joint type has exactly one drivable DOF, so **"driven" stays a
  plain boolean** with no "which DOF?" follow-up control.
- **Stroke limits.** See §2.6.
- **Multiple simultaneous inputs.** Still one input, still `dof === 1`
  ([`mechanism.ts:97-98`](../src/app/model/mechanism/mechanism.ts)). See §6 — the error message
  matters more than it used to.

---

## 2. Locked decisions

### 2.1 The joint model is a 2×2, not a 3-way type

`isWelded` is already a boolean on `RealJoint`
([`joint.ts:55`](../src/app/model/joint.ts)). Keep it that way — weldedness is a property of the
*joint*, and any link attached there inherits it. Combined with "does this joint have a slider",
that gives:

|  | Not welded | Welded |
| --- | --- | --- |
| **No slider** | Pin (R) | rigid joint → compound link |
| **Slider** | Slot (RP) | Slide (P) |

This is a property of the **assembly**, not of one serialized joint — `isPrismatic` lives on the
`PrisJoint` and `isWelded` on the coincident `RevJoint`. See §2.10 before implementing anything
that reads or writes it.

Consequences:

- The panel has **two toggles** (Slider, Weld), not a three-way Type control plus a Weld button.
- Unweld at a Slide gives a **Slot**, not a pin. Each control changes exactly one axis.
- The `+` glyph is the same mark in both welded cells because it is the same flag.
- **Cost:** no compound rider on a Slot (two links rigidly joined to each other but both free to
  rotate in the slot). None of the scoped mechanisms need it. Recoverable later by promoting the
  weld flag to a per-link-pair set.

### 2.2 Keep the zero-length-block decomposition

A slider stays `PrisJoint` + zero-length `SliderBlock` link + `RevJoint`
([`mechanism.service.ts:1033-1050`](../src/app/services/mechanism.service.ts)). This already gives
the invariant that a full joint-between-two-links refactor would buy: every joint relates exactly
two bodies, and "which pair slides" can never be ambiguous because the block mediates.

### 2.3 Carrier recording: Option A

The `PrisJoint` gets a **`carrier` reference**. It does *not* become a member of the carrier's
`joints` array.

```
Option A (chosen)                    Option B (rejected)
Link3.joints = [B, C]                Link3.joints = [B, C, P]
P.links      = [block]               P.links      = [block, Link3]
P.carrier    = Link3   ← new field   P.slidesOnLink = true  ← new flag
```

Why: a link's hull comes from `this.joints.map(...)`
([`link.ts:317`](../src/app/model/link.ts)) and its reference angle from `joints[0]`/`joints[1]`
([`link.ts:275-276`](../src/app/model/link.ts)). `P` slides, so under Option B every consumer of a
link's joint list must skip it — and `.joints` has **284 usages across 20 files**, including all
five solvers.

Option A's URL cost is three appended tokens (carrier id, slot joint A, slot joint B — see §2.4).
`encodeJoint` emits `flags + id, name, x, y, angle`
([`string-transcoder.ts:49-63`](../src/app/services/transcoding/string-transcoder.ts)); old URLs
have five tokens and the disassembler returns `""` for the missing ones, which decodes as
**grounded**. See §2.4a for why that default is safe.

### 2.4 A floating slot is defined by two joints of its carrier — no offset angle

**There is no offset angle.** A floating slot is the line through two ordinary joints of the
carrier link:

```
PrisJoint (floating) = { carrier: Link, slotJointA: Joint, slotJointB: Joint }
PrisJoint (grounded) = { ground: true, angle_rad: world angle }   ← unchanged
```

Why no offset is needed: every mechanism in scope has its slot collinear with two of the carrier's
joints — Whitworth (pivot → far pin), Geneva (centre → rim), oscillating cylinder (pivot → piston
pin), hydraulic cylinder (pin → pin), Oldham (one joint pair per slot). The offset only existed
because an earlier draft measured the slot against a link's *global* axis, which is derived from
`joints[0]`/`joints[1]` ([`link.ts:275-276`](../src/app/model/link.ts)) and therefore unstable
across edits and URL round-trips. Two named joints remove the offset **and** the instability.

What this buys:

- **Multiple slots per link.** Each `PrisJoint` names its own joint pair, so a link with many
  joints can host many slots.
- **Both solver primitives get simpler.** Forward: the line is through two known points — no
  `tan`, no derived link angle. Inverse (§2.5a): with A known and B unknown, B lies on ray A→P at
  distance |AB|; the α term disappears entirely.
- **The reference-angle risk is gone**, and with it the "convert the number to preserve the
  geometry" dance on every carrier change.

What it costs: a slot that is not collinear with any two of the carrier's joints — laterally
offset, or angled across a plate. Recoverable by adding joints to define it; those joints are
legitimately part of the link's geometry.

**Store the carrier anyway.** Two joints can be shared by several links at a ternary joint, so the
carrier is what disambiguates and what everything validates against.

**Asymmetry to keep straight:** the two slot-defining joints **are** ordinary members of
`carrier.joints` and do shape the link. The `PrisJoint` is still **not** a member (§2.3), because
it slides.

### 2.4a "Grounded" and "floating with no carrier" must not be confusable

If an absent carrier token simply meant "grounded", a broken or half-edited floating slider would
decode as a *working grounded* one — silently changing the mechanism instead of failing. The two
states are distinguished by making the second one **impossible**:

1. A `PrisJoint` is either grounded (`angle_rad`, no carrier) or floating (carrier + two slot
   joints, all resolving). There is no third state, and the model never persists one.
2. The UI cannot produce one. A floating slot is born from the drop-on-link gesture, which supplies
   the carrier and the joint pair. Un-grounding an existing slider requires choosing them in the
   same action.
3. Lifecycle rules (§2.8a) reground or remove a slider whose carrier — or either slot joint — is
   deleted or absorbed, so an orphan never survives an edit.
4. Decode validates: carrier resolves, both slot joints resolve, both belong to the carrier, and
   they are distinct. A partial or inconsistent set is a **decode error surfaced to the user**, not
   a silent downgrade to grounded.

With those in place, "no tokens" unambiguously means a pre-feature URL, i.e. grounded.

### 2.5 No "Slot on" dropdown

The carrier is chosen at creation by dropping the joint onto a specific link, and the slot is
drawn as a hole in that link. The panel shows **`Slot on: Link 3` read-only**. Changing a carrier
is delete-and-recreate.

### 2.6 Slot length is an output, never an input

Compute it from the solved travel range plus padding. Nobody may type it.

Stroke limits are out of v1. For a *driven* slider a limit is structurally identical to a rocker
toggle and would reuse `findFullMovementPos`'s reversal path — cheap. For a *passive* slider it is
an inequality constraint in a solver that has none, plus a new "mechanism jams" state to animate,
graph, and explain. Keeping slot length = computed travel means the drawing can never contradict
the solver.

### 2.7 The cylinder is a skin, not a state

A piston is **Slide / floating / driven**. Draw the cylinder skin when carrier and rider each carry
exactly one other joint, on opposite sides of the block, collinear with the slot — that is the
two-pin strut case and nothing else produces it. (Under §2.4 the slot is always collinear with two
of the carrier's joints, so the old "offset is 0°" clause is subsumed.) Provide a manual override;
auto-switching a glyph is startling the first time.

The override makes the skin **tri-state** (`auto` / `cylinder` / `slotted`), which is state, not
just rendering. Decision: it is a **view preference, not mechanism state** — it does not serialize
into the URL and does not enter the undo stack. A shared link always opens in `auto`. If that turns
out to be wrong, it becomes a fourth joint flag, not an ad-hoc side channel.

Selecting any member of the assembly (barrel, rod, or the Slide joint) overlays the slot axis and
stroke ghosts **additively** — same size, same position, nothing moves. The revealed block is
draggable. Rule is "collapsed skins expand on selection", so future skins inherit it.

### 2.8 Visual grammar

Five composable primitives, not twelve hand-drawn glyphs: hatch, block, channel, marker, arrow.

**Link colours are randomly generated per link and carry no meaning.** Nothing in the grammar may
depend on which colour a link has. Carrier and rider are distinguished *structurally*: the slot is
a hole in the carrier, the block sits in the hole, the rider attaches at the marker.

- circle marker = rotation allowed · `+` marker = welded/rigid
- hatching = the other body is ground; a link body in its place = the other body is a moving link
- **Slot**: block is a fixed dark neutral — it is its own body (`SliderBlock`) and belongs to no
  link, so it must not borrow a link colour
- **Slide**: block is a **darkened derivative of the rider's colour** — same hue, forced low
  lightness. That preserves "same colour family ⇒ same body" without depending on *which* colour
  the rider got, and it guarantees the block is dark enough for the next rule.
- arrow = the driven freedom; curved for rotation, straight for translation; **always white**.
  This is why both block treatments are forced dark: a white arrow on a randomly-coloured light
  block would be invisible.
- the selection ring stays purely interaction state (`getJointCSSClass`,
  [`mechanism.service.ts:1353-1373`](../src/app/services/mechanism.service.ts)) — never overloaded
  with joint type

Rendering rules that follow: the break in a grounded slot's rail must track the rod's actual
direction; hatching never rotates, carrier bars always do.

### 2.9 An actuator is an ordered record, not a boolean

An input prescribes a *relative* freedom between **two bodies**. `input: boolean` on a joint cannot
name them. It survives today only because a grounded crank has an obvious answer, and the solvers
guess: `kinematic-solver` reaches for the input joint's first link
([`kinematic-solver.ts:141-160`](../src/app/model/mechanism/kinematic-solver.ts)) and `force-solver`
for the first incident real body ([`force-solver.ts:269-280`](../src/app/model/mechanism/force-solver.ts)).
Both are **already wrong** for a grounded input joint carrying more than one link. A driven floating
pin makes that latent bug unavoidable.

Model an actuator as an ordered record:

```
{ joint, referenceBody, drivenBody, kind: 'angle' | 'length', initialPhase }
```

**v1 restriction:** a driven joint must have **exactly two incident bodies**. The panel refuses
Driven otherwise and says why. That keeps the record derivable rather than hand-authored — but the
ordering must be canonical and must survive a URL round-trip, since `joint.links` order *is* the
serialization order. Assert that in Phase 0's template test.

Reportedly MotionGen's engine represents an actuator with three ordered joints rather than a joint
flag, for the same reason — noted from review, not verified against the paper text.

### 2.10 The slot assembly, and where each flag lives

The 2×2 of §2.1 is a property of an **assembly**, not of one serialized joint. A single
user-visible "slot joint" is three objects:

```
carrier ──── P   (PrisJoint: isPrismatic; carrier + slotJointA/B, or ground + angle_rad)
              │
         SliderBlock   (zero-length Link — NOT a RealLink)
              │
             R   (RevJoint: isWelded)  ──── rider
```

- `isPrismatic` lives on the **PrisJoint**; `isWelded` lives on the **RevJoint**. They are separate
  records in the URL. The 2×2 is *derived from the pair*, and nothing in the model enforces that
  pairing today.
- `SliderBlock extends Link`, not `RealLink` — and `weldJointTopology` filters
  `link instanceof RealLink` ([`mechanism.service.ts:1418`](../src/app/services/mechanism.service.ts)).
  A block therefore **cannot** enter a compound through the generic weld path. See Phase 3.

Invariants to assert on every rebuild:

1. A `PrisJoint` has exactly one `SliderBlock` in `links`; that block has exactly two joints — the
   `PrisJoint` and one `RevJoint`.
2. The two are coincident at every timestep.
3. A `PrisJoint` is **exactly one of**: grounded (`ground`, `angle_rad`, no carrier) or floating
   (carrier + `slotJointA` + `slotJointB`, all resolving). Never neither, never both (§2.4a).
4. When floating: both slot joints exist, are members of `carrier.joints`, have distinct ids, and
   are **not coincident in space** — two coincident joints leave the slot line undefined, which a
   Phase 1.2 snap that stops short of merging could produce.
5. `PrisJoint.carrier` is never a link the paired `RevJoint` belongs to — no link sliding on itself.
6. The `PrisJoint` is **not** a member of `carrier.joints`; the two slot joints **are** (§2.4).
7. Weld state at the `RevJoint` and presence of the `PrisJoint` are independent; all four
   combinations are legal and round-trip.

---

## 3. Phases

Each phase is a PR. Gates are hard — do not start the next phase with a red gate.

### Phase 0 — Groundwork (no user-visible change) — **DONE** (PR #223)

| # | Task | Files | Status |
| --- | --- | --- | --- |
| 0.1 | Rename `Piston` → `SliderBlock` | [`link.ts`](../src/app/model/link.ts) + 15 files | done |
| 0.2 | Template URL regression test | [`template-url.spec.ts`](../src/tests/verification/template-url.spec.ts), [`template-baseline.ts`](../src/tests/verification/template-baseline.ts) | done |
| 0.3 | Rewrite `circleLineIntersection` in parametric form | [`utils.ts`](../src/app/model/utils.ts), [`position-solver.ts`](../src/app/model/mechanism/position-solver.ts), [`slider-guide-angle.spec.ts`](../src/tests/verification/slider-guide-angle.spec.ts) | done |

**0.3 turned out to be a correctness fix, not just a robustness one.** The clamp treated any
`|m| > 1000` as `Number.MAX_VALUE` and switched to a constant-`x` branch. `tan(89.95°) = 1146`, so a
guide a twentieth of a degree off vertical was solved as *exactly* vertical — the slider drifted
0.0044 off its true position with `x` pinned to its starting value for the whole cycle. Any
mechanism a user built on a steep guide has been quietly wrong.

Guide angles are asserted against the closed form (§4.3), not sampled data: 0°, 30°, 60°, 89.95°,
exactly 90°, 120°. MATLAB cases covering the same angles exist and pass their full pipeline in
`KohmeiK/PMKS_Verification#1`; wiring them in as an independent cross-check is follow-up work and
needs an upstream-provenance decision first, since PMKSWeb currently pins a `PMKS-Web/` commit.

Two things left in place deliberately:

- The circle-line branch index is still chosen once and held, which is not safe through a tangency
  — the same failure `solutionNearestCurrent` fixes for circle-circle. Commented in place; Phase 2.
- `incrementPrisInput` still has no coverage (see Phase 5).

**0.1 first**, before anything else — `Piston` currently means "slider block" and we are about to
add a feature users call a piston that is a different thing.

**0.2** locks the compatibility surface before anything moves. Decode all five entries in
`TEMPLATE_LINKAGES`, assert topology and solved positions. `Slider_Crank` is the one that matters:
its payload encodes joints `C` and `D` at identical coordinates with link `YPCD` between them —
the coincident RevJoint/PrisJoint pair. `TEMPLATE_LINKAGES` is already imported by
`analysis-graph`, `analysis-panel`, and `force-solver.fixture` specs, so the hook exists.

**0.3** replaces `y = mx + n` with point + unit vector. A *fixed* slot only hits `m → ∞` if the
user types 90°; a slot on a rotating carrier crosses vertical twice per revolution. This deletes
the `Number.MAX_VALUE` clamp ([`position-solver.ts:645-647`](../src/app/model/mechanism/position-solver.ts))
and the separate NaN branch ([`:543-571`](../src/app/model/mechanism/position-solver.ts)).

> **Gate 0 — met.** 263 specs green (was 215); `Slider_Crank` template decodes and solves
> bit-identically; guide-angle cases match closed form at every tested angle; production build clean.

### Phase 1 — Drag foundation

Independent of joint types, and a prerequisite for Phase 4's slot drags. This is where the drag
logic currently living only in the author's head gets written down.

| # | Task | Files | Status |
| --- | --- | --- | --- |
| 1.1 | Extract the drag state machine out of `new-grid.component.ts` | [`drag-state.service.ts`](../src/app/services/drag-state.service.ts) | done |
| 1.2 | Joint-onto-joint drag to snap/merge | [`drop-target.ts`](../src/app/model/drop-target.ts), `MechanismService.mergeJoints` | done |
| 1.3 | Whole-link drag | `GridUtilsService.dragLink` | done |
| 1.4 | Save-on-release discipline | `DragStateService.release` | done |

**1.1** moved the four interaction enums off the component and behind named transitions. The
component held `gridStates`/`jointStates`/`linkStates`/`forceStates` as private fields assigned from
roughly a dozen sites, so a gesture that forgot one of them left the canvas in a state no single
field described. The enums themselves stay in `utils.ts`; only their ownership moved.

Two things fell out of the extraction rather than being planned:

- The three-way "can I edit right now?" guard was duplicated at three call sites, and none of them
  covered Analyze mode. Analyze already refused the edit context menu, so it *presented* as
  read-only while dragging went straight through. Whole-link drag would have widened that hole, so
  the guard now covers every drag.
- `GridUtilsService` reached the mechanism through `NewGridComponent.instance.mechanismSrv`. It now
  resolves `MechanismService` through `Injector` at call time — the cycle-breaking pattern the rest
  of the codebase already uses — which removes one static channel and is what makes `dragLink`
  testable without a DOM.

**1.2** splits into a pure refusal/nearest-target module and a topology merge on MechanismService.
The refusal reasons are returned rather than a bare boolean because a joint that silently declines
to snap reads as a broken drag.

What a merge is *allowed* to land on is the part that took two passes to get right.

| Target | Result |
| --- | --- |
| a plain pin | a pin, with the arriving links added |
| **the revolute half of a slider** | a pin-in-slot: two or more links riding one block |
| **a welded joint** | the arriving link joins the compound — the survivor re-welds |
| a slider, when the dragged joint also carries one | refused; two blocks on one pin is a different joint type |
| the prismatic half of a slider | refused; the slot is not a pin |
| two joints of one link | refused; the link would collapse to zero length |

The slider and weld rows started out as refusals deferred to Phases 2 and 3. They are not deferrable:
dropping a pin onto a slider's pin *is* how a pin-in-slot gets built, and it is the gesture the whole
slot feature is heading towards. Both work on the existing decomposition with no new model —
the block already carries any number of links at its revolute end.

A weld is a joint flag plus a compound link built around it, so the merge unwelds both ends, moves
the topology, and welds the survivor again through `weldJointTopology`. Going through the weld path
rather than editing compounds by hand is what makes the result a real compound instead of a joint
flagged welded with a stray link beside it. `canBeWelded` declines a grounded, driven, or
slider-carrying joint, so a merge that grounds the survivor takes the weld away — reported, not
silent.

**The Weld button reaches the same geometry, and warns instead of refusing.** Welding fuses the
links meeting at a joint into one compound, and that compound can end up holding a pair of joints
some other link already holds. The kinematics survive — `groupRigidBodies` merges them and the
mobility comes out right (§ below) — but the statics do not: a redundant pin carries a share of the
load rigid-body equilibrium cannot determine, and the force solver has no unique answer.

**Blocking and warning are split by how easily the gesture is made by accident.** Dropping a joint
somewhere is a slip; clicking Weld on a named joint is a decision. So the drag is refused, with the
red ring saying so before the drop commits, and the weld goes through with a snackbar. The force
side already degrades honestly on its own (`unsupported-topology`), so the user is told twice and
nothing is silently wrong.

Refusing the weld as well was the first attempt, and it was wrong for a reason worth recording: it
made a mechanism the app can *open* one the app cannot *author*. Unwelding the coupler of the
linkage that prompted the mobility fix, then welding it back, was refused — a one-way door on a
file the user had already built. A teaching tool that loads a linkage it will not let you draw is
harder to explain than an indeterminate force panel.

The warning names the pair the weld *creates*, comparing redundancies before and after rather than
asking whether anything is redundant afterwards. Since a mechanism may legitimately arrive already
holding one, the latter would blame every later weld for a condition it did not cause and name
joints nowhere near the click.

Both this and the drag refusal read [`rigid-bodies.ts`](../src/app/model/rigid-bodies.ts), so
"what counts as one rigid body" has exactly one definition and cannot drift between them.

**Over-constraint is the one refusal that was not in the plan, and the first version of it was too
narrow.** It tested for an exact duplicate: links A–B and A–C, with B dropped on C, leave two bars
spanning the same pair. That misses the case one step out — a bar B–C landing on a *ternary* link
B–C–G. B and C are already fixed relative to each other by the ternary body, so the bar adds no
freedom and the solvers see a redundant constraint, but the joint sets are not equal so nothing
fired. The test is now that the merged link and an existing link must not share **two** joints,
which catches both: any pair shared by two bodies is a pair each one fixes on its own.

The merge itself reuses `rebuildJointGraph`, so it only has to rewrite `link.joints`, the link id,
and the `fixedLocations` entries; connectivity is re-derived, and the weld and slider fixups run
after that rebuild because both read `joint.links`. Ground and input transfer to the survivor,
because dropping either would quietly change what the mechanism is. A slider carried across by the
merge is repositioned onto its new pin, since a block and the pin it rides are coincident by
construction.

#### 1.2a The snap visual language

Adopted from the user's design prototype (`Joint Snap A`), so the canvas says which of three things
is about to happen *before* the drop rather than after it.

| State | Mark |
| --- | --- |
| legal target in range | solid amber ring on the target, and the dragged joint **jumps onto it** rather than trailing the cursor |
| refused target in range | red ring on that joint, no capture |
| the other end of the link being dragged | **nothing at all** — see below |
| release over a refused target | the dragged joint shakes in place, and a snackbar names the rule |
| **Alt** held at any point, including at the release | no rings, no capture, no merge |
| a merge that lands | the survivor pops, and **nothing is said** — a gesture that did what it looked like needs no receipt |

While a capture is held the two joints sit on the same point, so their names overlap into a smudge.
One label replaces both and names the merge — `B → D` — which is also the only place the canvas says
*which of the two survives*. The arrow points the way the joint travelled, and is latched when the
ring appears: recomputing it per frame would flip it as the cursor wandered across the target, and
by then the joint has been parked on top of it anyway, so there is nothing left to read from.

Holding **Alt** suppresses both rings and the capture, for placing a joint on top of another without
merging them. The release reads Alt from the pointerup event rather than from the last cached
target: pressing a modifier emits no pointermove, so a drag called off after the ring was acquired
would otherwise still merge.

A joint on the dragged joint's own link is not a target and gets no mark. Red would be explaining
something the drawing already says — there is a bar between the two — and a rule the user never
tried to break should not be announced. It is skipped rather than refused, so a legal joint slightly
further out can still win the drop.

Capture carries the most: locking the dragged joint to the target's exact position is what makes the
drop predictable, and it is why the ring radius equals the snap radius rather than being drawn as a
tight collar — the ring then shows the catch zone honestly.

Two deliberate departures from the prototype. A refused drop does **not** return the joint to where
it started: in the prototype the drag is abandoned, but here moving a joint is a legitimate edit in
its own right, and reverting it would silently discard the user's move. And the shake is a
percentage of the joint's own fill-box rather than the prototype's 7px, because a pixel offset
inside the zoomed SVG grows with the canvas transform instead of holding its proportion.

**1.3** treats a link drag as a rigid translation rather than as "drag each joint in turn". That
distinction is visible: the body's own centre of mass and forces translate exactly, so a
hand-placed CoM survives, while only the *neighbouring* links are deformed and recomputed.

A neighbour's **forces** are recomputed too, and that is easy to get wrong twice over. A load is
fixed to the body it acts on, so leaving it at its old world position silently slides it to a
different point of the link — and the drag saves that as the real load. But the transform has to
scale as well as rotate: a neighbour is *deformed*, its two reference joints changing separation,
so the rigid transform used elsewhere for link geometry would hold the load's absolute distance
from the joint and walk it off the end of a shortened link. `pointThroughFrame` scales with the
frame, which is the invariant `dragJoint` already preserves for a binary link.

`dragJoint` is unconstrained free-drag and already keeps the PrisJoint glued to the RevJoint;
`dragLink` maintains the same invariant. Phase 4 inverts it: the block becomes the constrained
thing and the pin follows.

**Drop-target arbitration.** 1.2 and Phase 4.3 both add drop targets. Joint snap must win when a
joint and a link body are both in range, with a visible indicator of which you're about to get. The
joint half is in; the precedence obligation is recorded at `resolveJointDropTarget` for Phase 4.3.

`linkStates.resizing` is still declared and still unused — link resizing is not a Phase 1 gesture.

#### What only the browser caught

The unit suite was green and the link drag was still broken on screen. `SvgGridService.handleBeforePan`
suppressed panning by *enumerating* the drag states — joint dragging, both force endpoints, synthesis
poses — so a link drag panned the canvas underneath itself. The content moved with the cursor, the
pointer barely moved in SVG coordinates, and the link translated by about a twentieth of a unit for a
sixty-pixel drag. Every unit test passed because none of them involve a viewport.

The fix is the reason 1.1 was worth doing: `handleBeforePan` now asks `DragStateService.isDragging`
instead of listing states, so it is right for gestures that do not exist yet. That also removed two
more reads of the `NewGridComponent.debugGet*State()` statics.

Anchoring fell out of the same investigation. A link drag accumulates offsets, so every pointer-move
held back by the click threshold was lost motion and the body trailed the cursor by however long the
hold lasted. It now measures from where the body was last placed, which makes the suppressed
distance catch up on the first applied move — matching what joint dragging already did by virtue of
positioning absolutely.

A third case came from using the app rather than from either suite: with no button held, the canvas
sometimes followed the cursor after a merge. It took three attempts, and the first two were wrong in
ways worth recording, because both were confidently argued from evidence that had not been checked.

- **Attempt one blamed Hammer** and guarded its `panstart panmove` handler. Hammer cannot cause this
  at all: its `MouseInput.handler` turns any `mousemove` with `which !== 1` into `INPUT_END`, so a
  buttonless move *ends* its gesture.
- **Attempt two blamed the merge for destroying the node the pointer went down on**, leaving
  svg-pan-zoom's `mousedown`-set `state === "pan"` with no `mouseup` to clear it. The DOM removal is
  real — Angular's change detection drains in the microtask checkpoint between `pointerup` and
  `mouseup` — but Chrome re-aims a release whose target was deleted mid-gesture at the nearest
  *connected* ancestor. Traces show it landing on `g#jointHolder` and reaching the library.
- Both attempts shipped browser checks that **passed with the fix removed**. The measurement was at
  fault: svg-pan-zoom's viewport is `#canvas > g[id^="viewport-"]`, not `.svg-pan-zoom_viewport`,
  and `ShadowViewport.setCTM` defers its DOM write to `requestAnimationFrame`, so reading the
  transform inside the dispatch showed nothing either way. That produced the conclusion "synthetic
  mouse events do not drive svg-pan-zoom", which is false, and everything reasoned from it was void.

What is established: the runaway pan **is** svg-pan-zoom's `state === "pan"` outliving the release,
confirmed by driving the library into that state and moving a real CDP mouse with no button held.
What is **not** established is how the release goes missing in the field — 30 CDP scenarios across
five drags and six release timings, with the guard disabled, produced zero ghost pans.

So `guardAgainstStuckPan` holds the invariant rather than chasing the cause: **a `mousemove`
carrying no held button cannot belong to a pan**, so it ends the gesture at the source. The release
is watched on the root — a window-level listener would clear the flag for exactly the releases the
library missed — and the move on the window, because on the root the two race by registration order
at `AT_TARGET` and the library registered first, so one pan frame slips through. `handleBeforePan`
cannot host the test: by then a buttonless pan is indistinguishable from `fit`, `center` and wheel
zoom, all legitimate.

Its regression check enters the stuck state synthetically, since the field trigger will not
reproduce, and **it discriminates** — proven by commenting out the guard, polling the served bundle
until the call was gone, and watching exactly that one check fail with the viewport moving
`(965, 507) → (1145, 627)`.

The rest is covered by [`e2e/phase1-drag.mjs`](../e2e/phase1-drag.mjs), which asserts in model
coordinates rather than on screenshots and exits non-zero on any failure.

> **Gate 1 — met.** 310 specs green (was 263); dragging a joint onto another merges them and the
> result round-trips through the URL; dragging a link moves all its joints and leaves the mechanism
> valid at DOF 1; every gesture is exactly one undo entry, and a click that only selects is zero.
> Production build clean. Each new assertion was mutation-checked, and all 46 browser checks in
> `e2e/phase1-drag.mjs` pass.

### Phase 2 — Floating Slot: model and solvers

| # | Task | Files |
| --- | --- | --- |
| 2.1 | `PrisJoint`: `carrier` + `slotJointA/B`; allow `ground = false`; grounded keeps `angle_rad`; three URL tokens + validation (§2.4a) | `joint.ts`, `mechanism-builder.ts`, `string-transcoder.ts`, `transcoder-data.ts` |
| 2.2 | `Ground` toggle stops destroying sliders; carrier reassignment converts the angle | [`mechanism.service.ts:939-976`](../src/app/services/mechanism.service.ts) |
| 2.3 | DOF: a prismatic ground must clear `groundNotFound` | [`mechanism.ts:274-301`](../src/app/model/mechanism/mechanism.ts) |
| 2.4 | Fix global single-slider lookups | [`mechanism.service.ts:956`](../src/app/services/mechanism.service.ts), [`force-solver.ts:278`](../src/app/model/mechanism/force-solver.ts) |
| 2.5 | **Inverse slot primitive**: solve the carrier's pose from a known block point, then place all its joints | new multi-target step kind |
| 2.6 | Forward slot primitive: recompute the slot line per timestep | [`position-solver.ts:175-176, 218-222`](../src/app/model/mechanism/position-solver.ts) |
| 2.7 | `detJointOrder`: defer-and-retry, multi-target steps | [`position-solver.ts:135-271`](../src/app/model/mechanism/position-solver.ts) |
| 2.8 | Carrier lifecycle and topology — see 2.8a | many |
| 2.9 | Kinematic solver: add the carrier's ω×r term | [`kinematic-solver.ts:186-202, 269-270`](../src/app/model/mechanism/kinematic-solver.ts) |
| 2.10 | Force solver: rotate the reaction direction, drop the `.ground` guard, add carrier-side incidence | [`force-solver.ts:476-486, 551`](../src/app/model/mechanism/force-solver.ts) |
| 2.11 | ~~IC solver: prismatic IC is at infinity ⊥ to a direction that now rotates~~ **De-scoped** — the IC solver is dead code (see status below) | [`ic-solver.ts:107-112`](../src/app/model/mechanism/ic-solver.ts) |

**Status: 2.1–2.10 done, 2.11 de-scoped, Gate 2 met.**

Verified: the model and its three URL tokens with §2.4a decode validation; mobility for grounded
guides; the inverse and forward position primitives; defer-and-retry ordering with a named-joints
exit; the §2.8a lifecycle rules; static forces including carrier-side incidence and
equal-and-opposite reactions across the slot; and velocity and acceleration through a moving slot,
carrying the carrier's own rotation and the Coriolis term, matched against closed form in both
directions.

Kinematic loops are now lists of typed edges rather than strings of joint letters, which is what
let a slot appear in a loop at all — see
[`floating-slot-kinematics-design.md`](floating-slot-kinematics-design.md).

**2.11 (instant centres): de-scoped, not parked.** Pre-implementation review for 2.9 found the IC
solver is dead code: nothing imports `ic-solver.ts` (the only references are a commented-out import
and call at [`mechanism.ts:7`](../src/app/model/mechanism/mechanism.ts) and `:547`),
`MechanismService.ics` is initialized empty and never filled, and no spec exercises it. The
instant-center feature was never wired into the app, so there is nothing for a floating slot to
break. 2.11 and verification case 10 are removed from Gate 2; if the feature is ever revived, that
is its own project, starting with characterization tests
(`docs/floating-slot-kinematics-design.md` §6). The `slotAngle` seam it would need is delivered by
2.9 regardless.

**The Scotch yoke (case 3) belongs to Phase 3, not here.** §4.1 lists it as isolating floating Slot
**plus grounded Slide**, and Slide is Phase 3: without the assembly-level weld there is nothing to
stop the yoke rotating about its guide, so the mechanism is DOF 2 and cannot be built yet.

#### 2.5a The inverse direction is the primary case, not an edge case

An earlier draft of this plan assumed the forward direction — carrier pose known, find the rider's
pin on the slot — and treated the inverse as rare. **That was wrong.** Work the solve order for the
classic floating-slot mechanisms:

- **Whitworth / inverted slider-crank / oscillating cylinder.** Crank is driven, so the crank pin
  (and therefore the block) is located first. The *slotted lever's* pose is the unknown, determined
  by its ground pivot plus the requirement that its slot passes through the block.
- **Scotch yoke.** Same shape — crank pin known, yoke position unknown.
- **Geneva.** Driver pin known, Geneva wheel pose unknown.

All three are the inverse direction. Driving the crank is the natural input, and the slot lives on
the output — so for floating slots, **inverse is the common case and forward is the rare one**
(forward needs the carrier fully determined before the rider, e.g. a four-bar with a slotted
coupler).

The primitive: the slot is the line through `slotJointA` and `slotJointB` (§2.4). If one of them —
call it `A` — is already known and a point `P` on the slot is known, then `L`'s pose follows from
`atan2(P − A)`, and every other joint of `L` places by rigid transform. That solves **a set of
joints at once**, which is why multi-target steps (§2.7a item 1) are a Phase 2 requirement rather
than future-proofing.

Because the slot is two named joints rather than an anchor plus an offset, there is no α term and
no derived link angle in either primitive.

The general case — neither slot joint known, or no solved joint on `L` — does not reduce. Those
hand to the §2.7a strategy, which in v1 reports unsolvable.

**2.7 is the structural one.** `detJointOrder` is a single-pass DFS that emits a
`circleLineIntersectionPoints` step as soon as it sees a `PrisJoint` neighbour — safe today
because a grounded slot is known before the walk starts. It now has to choose between the forward
and inverse primitives based on what is already known, and may reach either before its
prerequisites. Wrap the walk in repeat-until-no-progress. That also gives a real error path for
non-dyadic mechanisms instead of today's silent no-motion.

#### 2.7a The "no progress" exit is a seam, not a dead end

MotionGen's current engine (Lyu, Purwar & Liao, *A Unified Real-Time Motion Generation Algorithm
for Approximate Position Analysis of Planar N-Bar Mechanisms*, J. Mech. Des. 146(6):063302, 2024)
keeps a fast dyadic decomposition and falls back to an optimisation-based solve when decomposition
doesn't apply. That is the natural evolution of this loop: **when a pass makes no progress, the
remaining unsolved joints are a simultaneous system**, not a failure.

We are **not building the fallback in v1.** We are only shaping 2.6 so it can be added later
without redesigning the ordering:

1. **Steps target a set of joints, not one.** The step record carries a target *set*, and the
   switch in `determinePositionAnalysis`
   ([`position-solver.ts:295-334`](../src/app/model/mechanism/position-solver.ts)) gets a case
   that can write several positions at once. If v1 hardcodes one-joint-per-step, adding a block
   solver later means changing the step representation — exactly the retrofit we're avoiding.
2. **`known` holds link poses as well as joint positions**, even though v1 only ever adds joints
   to it. This is also what a reverse-direction primitive would need (§7.1).
3. **Write the constraint residual for every closed-form step as a small pure function**, and use
   it as a v1 test assertion: assert that the closed-form answer satisfies its own constraint to
   tolerance. The fallback needs a residual library; this way it exists before it's needed and
   earns its keep as tests in the meantime.
4. The exit calls a **strategy**. v1 ships exactly one: report unsolvable, naming the joints it
   could not order.

If the fallback does land, it is Newton–Raphson (or Levenberg–Marquardt for damping near
singularities) over the unsolved joint coordinates, with equations of the form
`(xᵢ−xⱼ)² + (yᵢ−yⱼ)² − Lᵢⱼ² = 0` for rigid links and `(P − A) × û = 0` for slots, **seeded from
the previous timestep**. The seed is what selects the assembly branch — the same job
`solutionNearestCurrent` and `concentricSolution` already do for the closed-form path
([`position-solver.ts:421-490`](../src/app/model/mechanism/position-solver.ts)) — so branch
tracking is inherited rather than reinvented. Non-convergence at a timestep means the mechanism
cannot assemble there, which is the existing toggle semantic that `findFullMovementPos` already
answers by reversing.

**Hard constraint if it ever lands:** a numerical solve is approximate, and the regression suite
verifies against exact MATLAB values. Any fallback must be gated so that dyadically decomposable
mechanisms still take the closed-form path bit-identically. The fallback is for mechanisms that
have no answer today — never a replacement for ones that do.

#### 2.8a Carrier lifecycle and topology

Option A (§2.3) stores the carrier outside both `carrier.joints` and `PrisJoint.links`, so every
consumer that walks those structures is blind to it. Each of the following is a task, not a
consequence to discover later:

| Consumer | Problem | Fix |
| --- | --- | --- |
| `cloneJointAt` / per-timestep copies | copies `input`, `ground`, `angle_rad` only ([`mechanism.ts:116-128`](../src/app/model/mechanism/mechanism.ts)); the carrier pointer would still reference the *editable* link | rebind the carrier to the per-timestep copy by id — the same class of bug the code already documents at [`kinematic-solver.ts:180-185`](../src/app/model/mechanism/kinematic-solver.ts) |
| `LoopSolver` | traverses `connectedJoints` only ([`loop-solver.ts:5-43`](../src/app/model/mechanism/loop-solver.ts)) | slot relationships must appear in loop enumeration or kinematic loops are wrong |
| `incidentBodies` | built from `joint.links` + `body.joints` membership ([`force-solver.ts:551-560`](../src/app/model/mechanism/force-solver.ts)) | dropping the `.ground` guard is **not sufficient** — the carrier-side reaction is omitted entirely |
| link deletion | carrier reference dangles | reground or remove dependent sliders |
| **slot joint deletion** | either `slotJointA` or `slotJointB` may be deleted or merged away by the Phase 1.2 snap | reground or remove the slider; a slot cannot survive losing a defining joint |
| weld / compound | carrier may be absorbed into a compound `RealLink` | remap the carrier to the compound and re-check that both slot joints are still members |
| URL decode | carrier or slot joint ids may be absent, unknown, duplicated, or not members of the carrier | resolve and **validate** per §2.4a — a partial or inconsistent set is a surfaced decode error, never a silent downgrade to grounded |

The appended tokens are syntactically backward-compatible. **Semantic validity is not "by
construction"** and needs its own tests — see §4.2.

**2.8 and 2.9 will produce plausible-looking wrong numbers rather than errors.** In a teaching
tool that is the worst failure mode available. Do not defer them past this phase.

> **Gate 2:** inverted slider-crank and Whitworth (both **inverse** direction) and the slotted-coupler
> four-bar (**forward** direction) match closed form for position, velocity, and acceleration; the
> force case matches; carrier lifecycle regressions pass; `Slider_Crank` template still bit-identical.
> (The IC case was removed when 2.11 was de-scoped — the IC solver is dead code.)
>
> **Gate 2 — met.** 425 specs green (was 346 at the end of Phase 1). The inverted slider-crank
> matches closed form for travel, travel acceleration, lever angular velocity and lever angular
> acceleration; Whitworth proportions hold the same forms on the rotating branch and turn the lever
> exactly once per crank revolution; the slotted-coupler four-bar holds the slot constraint in
> position, velocity and acceleration form, the last only once Coriolis is accounted for. Reactions
> are equal and opposite across the slot and normal to it. Every §4.2 lifecycle regression passes,
> and all five template URLs re-encode their joints, links and forces byte-identically. Each new
> assertion was mutation-checked: dropping the carrier term fails six of seven kinematic
> assertions, and dropping Coriolis alone fails exactly the one named for it.

### Phase 3 — Slide (pure prismatic)

Slide is an **assembly-level** state (§2.10), and the generic weld path cannot express it: a
`SliderBlock` is not a `RealLink`, so `weldJointTopology` filters it out
([`mechanism.service.ts:1418`](../src/app/services/mechanism.service.ts)). Lifting the `canBeWelded`
exclusion alone therefore does nothing useful — it neither admits the block to a compound nor
prevents the rider from rotating.

| # | Task |
| --- | --- |
| 3.1 | Lift the `PrisJoint` exclusion in `canBeWelded` ([`joint.ts:119-128`](../src/app/model/joint.ts)) |
| 3.2 | **Assembly-level weld/unweld**: a dedicated path that rigidly binds rider ↔ block, separate from `weldJointTopology`'s compound-`RealLink` logic |
| 3.3 | DOF: a welded slot assembly contributes one fewer freedom than an unwelded one |
| 3.4 | `cloneJointAt` / per-timestep copies carry the weld across the assembly, not just the `RevJoint` |
| 3.5 | Serialization: assert the `isPrismatic`/`isWelded` pair round-trips as an assembly, including all four 2×2 cells |
| 3.6 | Solvers: a welded rider has no relative rotation at the block |
| 3.7 | Guard: Weld/Unweld buttons in the panel act on the assembly when a slider is present, on the compound otherwise — never ambiguously |

**Status: done, Gate 3 met.** Implementation spec and what it cost:
[`phase-3-slide-spec.md`](phase-3-slide-spec.md).

Three of the seven tasks turned out to be already satisfied — `isWelded` round-trips through the
URL, `cloneJointAt` carries it to every timestep, and Phase 2's typed loop edges enumerate a Scotch
yoke unchanged — so 3.4 and 3.5 became assertions. The one described as "a welded rider has no
relative rotation at the block" was the substantive one, and it understated the work: the yoke's
joints could not be *reached* by any existing ordering primitive, so Phase 3 adds one that slides a
non-rotating assembly along its guide until its own slot meets the block riding in it.

**Statics for a welded assembly is deliberately out.** A prismatic pair welded to a body with a
moment equation transmits a couple, and `ForceAnalysisFrame` carries reactions as vectors — so the
schema, the reaction index and the analysis panel all move with it. Phase 3 ships a refusal that
names the joint and the cause rather than a number; the work is specified in
[`phase-3-slide-spec.md`](phase-3-slide-spec.md) §9.

**A Slide on a *moving* carrier is also out**, and for a sharper reason than it sounds: the rider's
angle tracks a carrier that is itself unknown, so the ordering deadlocks and it resolves as a
simultaneous two-unknown solve — exactly what §2.7a hands to the "report unsolvable" strategy. It
belongs with the cylinder in Phase 5. Encoding round-trips regardless; only solving is deferred.

Slide still needs **no new type bit**: `isPrismatic` + `isWelded` are both already in `JointData`
([`transcoder-data.ts:19-32`](../src/app/services/transcoding/transcoder-data.ts)). But that is a
statement about *encoding*, not about behaviour — the assembly invariants of §2.10 are what make the
pair meaningful, and they must be asserted rather than assumed.

> **Gate 3:** Scotch yoke matches `x = r cos θ`, `ẋ = −rω sin θ`, `ẍ = −rω² cos θ`; all four 2×2
> cells round-trip; assembly invariants hold after weld, unweld, clone, and carrier deletion.
>
> **Gate 3 — met.** 485 specs green (was 435 at the end of Phase 2). The Scotch yoke holds all
> three closed forms across a revolution, its yoke never rotates and never leaves its guide, and the
> crank pin stays on the slot to the position solver's own rounding. All four 2×2 cells round-trip
> and re-encode byte-identically. The assembly invariants hold after welding, unwelding, Unweld All,
> a joint-onto-joint merge, per-timestep cloning at the last frame, and removing the slider.
> Production build clean.
>
> Each new assertion was mutation-checked. Three are worth naming because they guard *plausible
> pictures* rather than crashes: measuring the slot from a joint that is not on it moves the
> assembly somewhere believable and wrong; gating one of the three angular-unknown registration
> paths passes every Scotch-yoke assertion while leaving a welded rider a spurious column in any
> other loop shape; and leaving the sliding joint behind stretches a zero-length block a little
> further every timestep while the closed form sails through. Each has a fixture whose only job is
> to tell those apart.

### Phase 4 — UI

| # | Task |
| --- | --- |
| 4.1 | Panel: Slider + Weld toggles; read-only `Slot on: Link 3 (joints B–C)`; the angle field appears **only for grounded** sliders, labelled "from +x axis" |
| 4.2 | Canvas: the twelve glyphs, composed from the five primitives |
| 4.3 | Creation gesture: drop a joint onto a link between two of its joints → slot on that link, defined by that pair. **Pair resolution:** unambiguous on a binary link; on a link with *n* joints there are up to *n*(*n*−1)/2 candidate pairs, so pick the segment whose line the drop point is nearest and show which pair is about to be chosen before release |
| 4.4 | Slot drag: block along the slot sets s₀ — **that is the only slot-specific drag** |

Today the panel **disables Ground whenever Slider is on**
([`edit-panel.component.ts:215-217`](../src/app/component/edit-panel/edit-panel.component.ts)) and
`toggleSlider` always produces a grounded slider
([`mechanism.service.ts:1021, 1038`](../src/app/services/mechanism.service.ts)). Both go away.

Stash the slot angle and carrier on the RevJoint when a slider is removed, so toggling back
restores them. Today they are destroyed.

**§2.4 deletes work here.** With the slot defined by two of the carrier's joints, there is no
rotate-the-slot handle and no snapping — you change a floating slot's direction by dragging its
defining joints, which is ordinary joint dragging from Phase 1. The angle field disappears for
floating sliders entirely, and with it the "which reference frame is this number in?" labelling
problem.

**One drag changes one quantity.** Block-drag moves s₀ and nothing else.

> **Gate 4:** every cell of the 2×2 reachable in ≤2 clicks from every other; each control change
> alters exactly one visual mark; all twelve states round-trip through the URL.

**Phase 4 is done; Gate 4 is met.** Reachability and one-axis-per-control are asserted across all
sixteen transitions of the 2×2 in `joint-type-2x2.spec.ts`; the round trip covers fourteen states in
`mark-states-round-trip.spec.ts`. Two changes to what is written above, both settled with the user
before implementation:

- **The glyph count is 8 + 1, not 12.** The axes generate eight base marks — {slider} × {weld} ×
  {ground, moving link} — and *driven* composites onto any of them in two forms rather than
  multiplying the set. Twelve would have smuggled combinatorics back into the renderer, which is
  the thing the five primitives exist to prevent.
- **A slider can now dangle.** §2.4a held that a slot is grounded-xor-floating; a third state was
  needed because the Slider toggle can be turned on for a joint with no carrier, and a carrier is
  geometry rather than a boolean. It keeps its block, loses its direction, is drawn in the same red
  the orphan-joint mark uses, and makes the mechanism invalid until a drag gives it a carrier.
  `reconcileSlots` produces it too, where it used to silently re-ground a slot at its last angle —
  reversing a Phase 2 decision, because inventing a direction nobody chose is worse than saying so.

Deferred out of Phase 4, with reasons: **Make Input refusing at 3+ incident bodies** and **a
redundant-weld warning** were both proposed in the design handoff. Neither is a UI question — the
first restricts something that works today and could break shared URLs, the second needs a
redundancy detector that does not exist. Both want their own spec.

§2.7's cylinder skin shipped here rather than in Phase 5: it is a rendering question, and the
fixture that exercises it is deliberately an invalid mechanism, since a Slide on a moving carrier is
still out of the solver's scope until 5.1.

### Phase 5 — Driven prismatic and the cylinder

| # | Task |
| --- | --- |
| 5.1 | Driven floating Slide: prescribe s(t) |
| 5.2 | **Linear speed units and persistence** — `inputSpeed` is documented "Always RPM" ([`settings.service.ts:22-23`](../src/app/services/settings.service.ts)) and every rebuild converts via `× π/30` ([`mechanism.service.ts:144`](../src/app/services/mechanism.service.ts)). A linear input needs its own unit family, its own default, and its own URL setting. |
| 5.3 | **Sample Δt and cycle termination** — the timeline assumes one-degree crank samples (`STEPS_PER_REVOLUTION = 360`, [`mechanism.ts:305-320`](../src/app/model/mechanism/mechanism.ts)) and prismatic stepping is a hardcoded `0.1` length increment ([`position-solver.ts:372`](../src/app/model/mechanism/position-solver.ts)). A linear input has no revolution to close on; its cycle ends at a reversal, so only the return-to-start tolerance applies. |
| 5.4 | Velocity scaling and playback period follow from 5.2/5.3 — audit every place that assumes angular input |
| 5.5 | Direction terminology: CW/CCW → extend/retract, including `isInputCW` ([`settings.service.ts:21`](../src/app/services/settings.service.ts)) and the analysis-panel text |
| 5.6 | Cylinder skin + detection rule (§2.7) |
| 5.7 | Reveal-on-select overlay; decide whether it persists during playback |
| 5.8 | Link panel shows length at t = 0, not a constant, for variable-length links |

**`incrementPrisInput` has no test coverage at all today.** Mutation-testing during Phase 0 showed
that perturbing it changes nothing in any spec: no built-in template drives the slider, so
([`position-solver.ts:372-381`](../src/app/model/mechanism/position-solver.ts)) is dead code in
the suite. Anything this phase changes there is unguarded until a driven-prismatic case exists —
write that case first, not last.

**The constraint is the easy part of this phase.** It reduces to `|P₁P₂| = s(t)`, a
per-timestep entry in `jointDistMap` feeding the existing circle-circle dyad
([`position-solver.ts:501-518`](../src/app/model/mechanism/position-solver.ts)) — no slot line, no
ordering problem. The work is 5.2–5.5: the entire timing and units stack currently assumes an
angular input, and none of it is parameterised.

Decide which entry point is canonical: the joint panel's Driven toggle, or the link panel's
"driven length". Two ways to reach one piece of state is fine; two sources of truth is not.

> **Gate 5:** cylinder-driven boom matches the law-of-cosines solution; a linear input completes a
> cycle, reverses correctly, and its speed round-trips through the URL in its own units.

### Phase 6 — Driven floating Pin

Two problems, not one.

**Ordering.** `determineJointOrder` locates the input joint and walks outward from it
([`position-solver.ts:82-125`](../src/app/model/mechanism/position-solver.ts)), assuming its
position is known. A floating input joint's position is not. Needs the Phase 2.7 defer-and-retry
machinery, which is why this comes last.

**Actuator identity.** Driving a floating pin means prescribing the relative angle between two
moving bodies, which the `input` boolean cannot express (§2.9). This phase is where the ordered
actuator record actually gets exercised; the v1 two-body restriction must already be enforced by
the panel before this lands.

> **Gate 6:** a standard four-bar **driven at its coupler–rocker pin** instead of at the crank
> reproduces the same coupler curve as the crank-driven version, with velocities rescaled by the
> joint-angle relationship.

An earlier draft proposed a "geared-five-bar-style" gate. That was incoherent: gears are out of
scope (§1), and an ungeared five-bar is DOF 2, which the engine rejects. The four-bar driven at a
floating joint is DOF 1, uses no out-of-scope features, and has an exact reference — the same
mechanism solved the ordinary way.

---

## 4. Test ladder

### 4.1 Mechanism cases

| # | Mechanism | Direction | Isolates | Verification |
| --- | --- | --- | --- | --- |
| 1 | Offset slider-crank, slot at 90° and 89.9° | grounded | parametric-line rewrite | closed form |
| 2 | Inverted slider-crank (oscillating cylinder) | **inverse** | floating Slot | closed form: `s = √(r² + d² − 2rd·cos θ₂)` |
| 3 | Scotch yoke | **inverse** | floating Slot **+** grounded Slide | closed form: pure sinusoid |
| 4 | Whitworth quick-return | **inverse** | full-rotation branch | published time ratio |
| 5 | Four-bar with a slotted coupler driving a grounded lever | **forward** | the forward primitive, which nothing else covers | four-bar closed form, then circle ∩ known line |
| 6 | Elliptical trammel | grounded ×2 | two grounded slides at once | traces an exact ellipse |
| 7 | Cylinder-driven boom | driven | driven floating Slide + linear timing | law of cosines |
| 8 | Four-bar driven at its coupler–rocker pin | — | driven floating Pin, actuator record | same coupler curve as the crank-driven four-bar |
| 9 | #2 with a load | — | force reaction direction **and** carrier-side incidence | MATLAB free-body; assert reactions are equal and opposite across the slot |
| 10 | ~~#2 instant centres~~ | — | ~~IC solver~~ | **De-scoped with 2.11** — the IC solver is dead code; nothing to verify |

Case 5 exists because 2, 3, and 4 are all the inverse direction (§2.5a) and would leave the forward
primitive untested.

### 4.2 Model and lifecycle regressions

These are not mechanisms; they are the failure modes that Option A and the slot assembly introduce.

| Regression | Asserts |
| --- | --- |
| Carrier and slot-joint URL resolution | valid ids resolve to the right link and joints after decode |
| Invalid / dangling / duplicated / self-referential ids | surfaced as a decode error; **never** a silent downgrade to grounded (§2.4a) |
| Slot joints not members of the carrier | rejected at decode |
| Missing carrier tokens (pre-existing URL) | decodes as grounded, geometry unchanged |
| Per-timestep cloning | carrier **and both slot joint** references point at the *copies*, not the editable objects |
| Carrier link deleted | dependent sliders are regrounded or removed; no dangling reference |
| Either slot joint deleted or merged by snap | same — a slot cannot outlive a defining joint |
| Carrier link welded into a compound | carrier remaps; both slot joints still members |
| Two slots on one link | independent joint pairs on the same carrier both solve |
| All four 2×2 cells | round-trip through the URL and rebuild identically |
| Driven joint with 3+ incident bodies | refused by the panel with a reason (§2.9) |
| Assembly invariants (§2.10, items 1–5) | hold after every structural edit |

### 4.3 Method notes

- For 1, 3, 5, 6, and 8 assert against the analytic formula rather than sampled MATLAB output —
  stronger, and no reference data to drift.
- Given the known defects in the existing MATLAB data, generate new references by an independent
  route wherever a closed form exists rather than trusting a single script.
- Follow the shape of `app.component.spec.ts` / `SixBarVerification.m`: sample position, velocity,
  and acceleration at N input angles.

---

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| `angle_rad` reinterpretation silently changes existing shared URLs | Grounded sliders keep reading the old way (carrier = ground, where the definitions coincide). Gate 0 locks this. |
| The generic weld path silently cannot express Slide | `SliderBlock` is not a `RealLink` and is filtered out ([`mechanism.service.ts:1418`](../src/app/services/mechanism.service.ts)). Phase 3 builds an assembly-level path instead of extending the compound path. |
| Force solver ships wrong-but-plausible numbers | Gates 2 and 4 include force cases; no phase completes on motion alone. (The IC half of this risk dissolved with 2.11 — the IC solver is dead code and ships no numbers at all) |
| Carrier pointer survives into the per-timestep copies unrebound | Phase 2.8a; the codebase already documents this exact bug class at [`kinematic-solver.ts:180-185`](../src/app/model/mechanism/kinematic-solver.ts) |
| ~~Carrier reference angle unstable across edits or URL round-trips~~ | **Eliminated by §2.4** — the slot is two named joints, so nothing is measured against a derived link angle |
| A floating slot silently degrades to grounded on decode | §2.4a — the intermediate state is made impossible and decode validates rather than defaults |
| A slot outlives one of its defining joints (deletion, or a Phase 1.2 snap merge) | §2.8a lifecycle rules plus the §4.2 regressions |
| Actuator body pair is ambiguous at a joint with 3+ links | §2.9 — pre-existing latent bug, made unavoidable by driven floating pins. v1 restricts to two incident bodies. |
| Phase 5 is scoped as "the constraint" and the timing stack is missed | 5.2–5.5 are the phase; the constraint is the small part |
| Twelve glyphs get hand-coded in `new-grid` | §2.8 — five composable primitives, or the combinatorics move from the panel into the renderer |
| Users build multi-cylinder booms and get nothing | §6 |

---

## 6. Known limitation to communicate

An excavator boom is three cylinders — three DOF. Scope is one input and `dof === 1`. The failure
must say *"this mechanism has N degrees of freedom — remove a driven joint or add a constraint"*,
not silently fail to animate. This is the single most likely source of user disappointment once
cylinders exist.

---

## 7. Open questions

1. ~~**Grounded pin riding a moving slot**~~ — **resolved.** This is not an edge case; it is the
   same inverse direction that Whitworth, the oscillating cylinder, the Scotch yoke, and Geneva all
   need. §2.5a promotes the inverse primitive into Phase 2 as first-class work. The retry loop
   itself has **no direction** — it only reorders; what is directional is the step catalogue, which
   is why "run it both ways" was never a thing that could be switched on. Cases the closed-form
   inverse primitive cannot reduce still hand to the §2.7a strategy.
2. **General inverse cases.** The primitive in §2.5a assumes the slot's anchor is a known joint of
   the carrier. Offset slots, and carriers with no solved joint, do not reduce. Decide whether v1
   refuses them explicitly in the panel or lets them reach the "unsolvable" strategy.
3. **Two links riding one block** — drawn as a normal multi-joint link over the block. Confirm the
   assembly weld semantics of §2.10 give the intended result.
4. **Reveal-on-select during playback** — keep or suppress (5.7).
5. **Canonical entry point for driven cylinder length** — joint panel or link panel (§Phase 5).
6. **Naming.** "Slider" currently means RP to existing users. If the panel keeps two toggles
   (Slider, Weld) the word survives unchanged — confirm that reads correctly for Slide.
