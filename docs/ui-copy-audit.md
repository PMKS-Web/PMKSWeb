# What the app says, and how it says it

An inventory of every string a user can read — context-menu items, panel labels,
tooltips, snackbars, and the messages the model produces when it refuses
something — with the inconsistencies called out and a proposal for each.

This is a proposal, not a change. Nothing here has been applied.

The project has been written by several hands over several years and it shows in
the words more than anywhere else in the code: three different verbs for adding
a thing, two different casings for a label, and two quite different ideas about
what a message is *for*. None of it is wrong, exactly. It just doesn't sound
like one program.

---

## 1. The verbs don't agree

The context menus use four verbs for one act, and two different pairings for
undoing it.

| Where | Now | |
| --- | --- | --- |
| grid | `Add Link` | |
| grid | `Create Cylinder` | ← a third verb for the same act |
| joint, link | `Attach Link` | |
| link | `Attach Cylinder` | |
| joint | `Add Ground` / `Remove Ground` | Add/Remove |
| joint | `Add Slider` / `Remove Slider` | Add/Remove |
| joint | `Make Input` / `Remove Input` | Make/**Remove** |
| joint | `Weld Joint` / `Unweld Joint` | Weld/Unweld |
| force | `Make Force Global` / `Make Force Local` | two states, no pair |

**There is a real distinction worth keeping** between *Add* and *Attach*: on the
bare grid you add a new free-standing member; on an existing object you attach
one to it. That reads well and users will pick it up without being told. What
does not read is `Create Cylinder` sitting beside `Add Link` on the same menu
for the same kind of act.

**Proposed**

- `Create Cylinder` → **`Add Cylinder`**. One verb per surface: *Add* on the
  grid, *Attach* on an object.
- `Make Input` / `Remove Input` → **`Add Input` / `Remove Input`**, matching
  Ground and Slider. "Make" survives only in `Make Force Global/Local`, where
  it is genuinely a different shape — a switch between two states rather than
  the presence or absence of one.
- `Weld Joint` / `Unweld Joint` — **keep**. Weld/unweld is the engineering pair
  and no other wording is better. It is the one place a different pattern earns
  itself.
- `Make Force Global` / `Make Force Local` — **keep**, but see §4: the label
  names the state you will move *to*, while every toggle above names the state
  you will move *away from*. Worth a decision either way; changing it is not
  free, because "Make Force Global" is unambiguous and "Global" alone is not.

---

## 2. Two different ideas of what a message is for

The snackbar carries two voices that have nothing to do with each other.

**The older voice** is a terse Title Case fragment naming a field:

```
Check Force Angle
Check Force ID
Check Force Magnitude
Check Force X Position
Check Joint ID
Check Joint Value
Check Link Mass
Check Link Mass MoI
Deleted Selected Object.
Select an object to delete.
This feature is not available yet
Don't link a joint to itself
Cannot edit while animation is running
```

**The newer voice** is a sentence that names the cause and the way out:

```
Nothing is holding this mechanism in place. Ground a joint, or ground a
slider's guide.

No joint is driven. Right-click a joint and choose Make Input to say what
moves the mechanism.

This joint joins 3 bodies, so "driven" would not say which pair moves. Drive
a joint where exactly two meet.

Slider F has nothing to slide along. Drag it onto a link to cut a slot, or
ground it to fix its direction.
```

The second is better and I would not argue the point: it tells you what
happened, why, and what to do. The first tells you that a thing named "Force X
Position" is somehow unsatisfactory and leaves the rest to you.

**Proposed** — rewrite the `Check ...` family. They all fire from the linkage
table when a typed value will not parse, so they all have the same shape:

| Now | Proposed |
| --- | --- |
| `Check Joint ID` | `A joint's name has to be letters or numbers, and cannot be one already in use.` |
| `Check Joint X Value` | `That is not a length. Type a number, optionally with a unit — 2, 2 cm, 0.75 in.` |
| `Check Force Angle` | `That is not an angle. Type a number of degrees.` |
| `Check Link Mass` | `That is not a mass. Type a number.` |
| `Check Link Mass MoI` | `That is not a moment of inertia. Type a number.` |

Four messages instead of eleven, because the eleven differ only in the field
name and the field is already on screen, highlighted, under the cursor.

Also in this family:

| Now | Proposed | Why |
| --- | --- | --- |
| `Deleted Selected Object.` | *(nothing)* | The object is gone from the screen. Announcing it is the same reflex that produced `Redo Called!`. |
| `Select an object to delete.` | keep, lowercase the mood: `Select something first — Delete removes whatever is selected.` | |
| `This feature is not available yet` | `Not built yet.` | Shorter, and the current phrasing promises a schedule the project does not have. |
| `Sorry, the tutorial is not ready yet.` | `The tutorial is not built yet.` | Same, and the apology is doing no work. |
| `Don't link a joint to itself` | `A link needs two different joints.` | States the rule rather than scolding. |
| `Don't link to a joint on the same link` | `Those two joints are already on one link.` | Same. |
| `Cannot edit while animation is running` | `Stop the animation to edit.` | Says the way out instead of the wall. |
| `Cannot open context menu while animating. Stop animation to edit` | fold into the above | Two messages for one situation. |
| `Context menu cannot be used while simulation is running` | fold into the above | Three, in fact — and this one calls it a "simulation" where the others call it an "animation". |
| `Analysis mode is read-only. Switch to Edit mode to edit` | `Switch to Edit to change the mechanism.` | |
| `Cannot edit while in Synthesis mode. Switch to Edit mode to edit` | `Switch to Edit to change the mechanism.` | Identical situation, identical words. |
| `Reset to T=0 (or push stop button` | unbalanced parenthesis, and `T=0` is jargon the rest of the app spells "the start" | `Stop the animation, or step back to the start.` |

---

## 3. One thing, three names

The app calls the same thing different things in different rooms.

| The thing | Names in use |
| --- | --- |
| playing the mechanism | **animation** (snackbars, `AnimationBarComponent`), **simulation** (one snackbar), **playback** (`playbackTimeSeconds`, internal) |
| a driven joint | **input** (menus, panel), **driven** (canvas marks, model messages), **actuator** (`describeActuator`) |
| the whole thing on the grid | **mechanism** (DOF readout, model messages), **linkage** (Templates dialog, `Open`/`Save`), **project** (`Share Project`, `New Project`) |

**Proposed** — pick one per row for anything a user reads, and leave the code
names alone:

- **animation**. It is what the bar is called, so it is what the words should
  say. "Simulation" goes.
- **input** in controls, **driven** in prose about the mechanism. These are
  genuinely different registers — a button that says "Add Input" and a sentence
  that says "no joint is driven" both read correctly — but `actuator` should
  not reach the user at all.
- **mechanism**. "Linkage" is a narrower word that stops being true the moment
  there is a cylinder in it, and "project" belongs to the file, not the thing.
  `Share Project` and `New Project` are about the document and can stay.

---

## 4. Casing

Labels are Title Case, which is right for controls and consistent almost
everywhere. Three exceptions:

- `Distance To Joints` — "To" should not be capitalised in title case.
- `Degress of freedom must be one` — a typo (**Degress**), and sentence case
  where its neighbours in the same list are Title Case.
- `X-Comp` / `Y-Comp` — abbreviated where nothing else is. `X` and `Y` alone
  would match the dual-input blocks everywhere else.

Messages are a mix of Title Case fragments (`Check Force Angle`) and sentences.
§2 resolves this: **messages are sentences, controls are Title Case.**

---

## 5. The help tooltips

Two different populations live behind the `?` icons, and they read as two
different products.

**Length.** The median panel tooltip is about 45 characters. Six are over 100,
and the two longest are both new, both on the cylinder:

| Chars | Field | Now |
| --- | --- | --- |
| 204 | Starts at | `Where the piston sits at the start of the cycle: as a percentage of the stroke, or as the length the ram is at. A length outside the travel resizes the ram to reach it, exactly as dragging the mount does.` |
| 183 | Force Analysis Type | `Determines whether the force analysis is done at static equilibrium or under dynamics conditions. The input speed for the dynamic analysis is set on the input joint in the Edit panel.` |
| 156 | Input Speed | `How fast this input joint turns, in the unit picked beside the value...` |
| 155 | Travel | `How far the rod travels. Stroke is the travel itself; closed and open are the mount-to-mount length at each end of it. One number, three ways of saying it.` |
| 138 | Expansion Speed | `How fast the rod extends along the cylinder's axis...` |
| 130 | Input Speed (slider) | `How fast this block travels along its slot...` |

A tooltip is read standing up, one-handed, while the pointer is being held
still. Two sentences is the ceiling; the second sentence of each of these is
doing documentation's job.

**Proposed** — first sentence says what the number is, second says what it
affects, and anything else goes. The overlays now on the canvas do more for
Travel and Starts at than a third clause ever did.

| Field | Proposed |
| --- | --- |
| Travel | `How far the rod moves. The picker switches between the stroke itself and the closed and open lengths — one number, three ways of saying it.` |
| Starts at | `Where the rod begins its cycle: a share of the travel, or a length. Outside the travel, the cylinder resizes to reach it.` |
| Input Speed | `How fast this joint turns. Negative reverses it.` |
| Expansion Speed | `How fast the rod extends. Negative retracts it.` |
| Force Analysis Type | `Static holds the mechanism still; In-motion includes the forces of movement.` |

**Vocabulary — open, and the one thing here still to decide.**

Six words are in play for one part and its pieces:

| Word | Names | Appears in |
| --- | --- | --- |
| **cylinder** | the whole part | panel title, menus, every message, one tooltip |
| **ram** | the whole part | two tooltips, two clamp messages |
| **barrel** | the fat outer body | code, one tooltip (`barrel mount`) |
| **rod** | the thin bar that slides out | panel tooltips, messages |
| **piston** | the black block on the rod | one tooltip, one clamp message |
| **mount** | either end joint | tooltips, messages |

Two of them name the same whole part, and *piston* names something that has no
label anywhere on screen.

### The options

**A — One name for the whole part, keep the pieces.** *cylinder* everywhere for
the assembly; *barrel*, *rod*, *mount* stay for the pieces; *ram* and *piston*
go. The block loses its prose name and is only ever described by what it does
("where the rod begins its cycle").

- Fewest words, and the one the menus and title already use.
- Cheapest: it is a find-and-replace over four tooltips and two messages.
- Loses the ability to say anything specific about the black block.

**B — One name for the whole part, and give the block a label.** As A, but the
block gets a visible name on the canvas or in the panel — *piston*, most
naturally — so the word is earned before it is used in prose.

- Every term a reader meets is one they can point at.
- Costs a label on the drawing, which is the thing this skin has spent the most
  effort *removing* (the notches, the dotted line, the numeric callouts).

**C — Keep *ram* for the whole part, drop *cylinder*.** The engineering-correct
choice: a hydraulic *ram* is the actuator; the *cylinder* is strictly its outer
tube, which the app calls the barrel.

- Most accurate to the domain, and this is a teaching tool.
- Most expensive: renames the menus, the panel title, the class, the messages
  and the docs, and every existing URL's shared vocabulary with them.
- "Add Ram" will read as a typo to most of the students using it.

**D — Leave it.** Both words stay in circulation.

- Free.
- The reader who meets *ram* once has to work out it is the thing they already
  selected, which is exactly the paper cut this whole audit is about.

### Decided: A, with *mount* becoming *joint*

**Applied.** *cylinder* everywhere for the whole part; *barrel*, *rod*, *stroke*
stay for the pieces; *ram* and *piston* are out of the UI.

And *mount* becomes **joint**, which was the right call and not one I had
proposed. A cylinder's two ends genuinely *are* joints — RevJoints with id
letters, selectable, draggable, groundable, and the panel already titles itself
`Edit Cylinder GC` after them. The objection would be ambiguity, since the part
has five joints; but the other three have no hitbox and no name a user ever
sees, so from the user's side a cylinder has exactly two joints and there is
nothing to be ambiguous with. It takes the last special word out of the
cylinder's user vocabulary, which is what option A was for.

`mount` stays in the *code*, where it usefully separates the two reachable
joints from the three interior ones — the same split this guide already makes
for `playback` and `actuator`. See `docs/ui-vocabulary.md`.

**Also here**

- `tooltip="TODO"` on the Synthesis pose table ships to users.
- Three tooltips describe the *graph* rather than the value —
  `The velocity of the selected joint graphed`, `...graphed over time`,
  `...graphed`. Three phrasings of one idea, and the fact that it is a graph is
  not in question by the time you are hovering its help icon.
- `The angle of the selected above the horizontal of the link graphed over time`
  has lost a word and cannot be parsed.
- `Copy a URL to clipboard that contains your linakge` — *linakge*.
- `Scales all links, joints, and forces. A save and reload is for changes to
  take effect. (Default: 1)` — the middle sentence is missing a word and, as far
  as I can tell, is no longer true: Object Scale takes effect immediately.
- `end-effector` / `end effector` / `COM` / `CoM` / `center of mass` all appear
  in tooltips within two panels of each other.

---

## 6. Smaller things

- `tooltip="TODO"` ships to users. It is on the Synthesis panel's pose table.
- `Scales all links, joints, and forces. A save and reload is for changes to
  take effect. (Default: 1)` — the middle sentence is missing a word and, as
  far as I can tell, is no longer true: Object Scale takes effect immediately.
- `The x and y components of the force in Newtons | lbf.` — the `|` is a
  developer's shorthand for "or", visible to users.
- `An input joint doubles as a ground joint.` — reads as a statement of fact;
  it is one of the mobility checklist's conditions, and its neighbours are
  phrased as conditions (`At least one joint is grounded`).
- `Joint T is internal to one welded body and has no independent pin reaction.`
  — shown for any joint with only one link, including a plain tracer point on an
  ordinary unwelded bar. Nothing is welded, and "pin reaction" is a third name
  for what the graph beside it calls a "reaction force" and the section calls
  "Force Analysis". Something like `A tracer point rides on one body, so no
  reaction is carried through it. Select a joint where two bodies meet.` says
  the same thing without claiming a weld that is not there.
- The synthesis panel sends structured data through the snackbar channel
  (`sendNotification('Midpoint;' + val + ';' + index)`, `'quality3c:' + ...`).
  These are debug traces on a user-facing surface; they should not be able to
  reach it at all.

---

## What I would do first

1. The `Check ...` family and the three animation-mode messages. They are the
   ones a user meets while doing ordinary work, and they are the ones that read
   as another program.
2. `Create Cylinder` → `Add Cylinder`, `Make Input` → `Add Input`. Two words,
   and the menus stop contradicting themselves.
3. The two cylinder tooltips, which are the longest strings in the app and
   introduce a second name for a part that already has one.
4. `tooltip="TODO"`, `Degress`, *linakge*, the unparseable angle tooltip, and
   the synthesis debug traces. Small, and each is visibly unfinished work rather than a choice.
