# Words this app uses

A reference for anyone adding a label, a message or a tooltip. It exists
because the words drifted further than the code did: four verbs for adding a
thing, three names for playing the mechanism, and two ideas about what a message
is for. See `docs/ui-copy-audit.md` for the survey this came out of.

The rule underneath all of it: **one thing, one name — and say what happened,
why, and what to do about it.**

---

## Voice

**Controls are Title Case. Everything else is a sentence.**

| | |
| --- | --- |
| Buttons, menu items, section headings, field labels | `Add Cylinder`, `Input Settings`, `Starts at` |
| Messages, tooltips, refusals, warnings | `Switch to Edit mode to change the mechanism.` |

**Write to the person, about their mechanism.** Not about the program.

| Instead of | Write |
| --- | --- |
| `Check Force Angle` | `That is not an angle. Type a number of degrees.` |
| `Cannot edit while in Synthesis mode. Switch to Edit mode to edit` | `Switch to Edit mode to change the mechanism.` |
| `This feature is not available yet` | `Not built yet.` |
| `Don't link a joint to itself` | `A link needs two different joints.` |

**Say the way out.** A refusal that only names the wall makes the user guess. A
refusal that names the door costs the same number of words.

**Do not announce what the user just did.** Deleting something removes it from
the screen; pressing Undo moves the mechanism. `Deleted Selected Object.` and
`Redo Called!` both shipped, and both told the user something they had just
done on purpose. The snackbar is the one channel for saying something they
*could not* see, so spending it on confirmations is expensive.

**Two sentences is a tooltip's ceiling.** It is read one-handed with the pointer
held still. If a third sentence is needed, the control needs a better label or
the canvas needs to show it.

---

## Naming things

### Verbs

| Where | Verb | Examples |
| --- | --- | --- |
| On the bare grid — a new free-standing member | **Add** | `Add Link`, `Add Cylinder` |
| On an existing object — a member joined to it | **Attach** | `Attach Link`, `Attach Cylinder`, `Attach Tracer Point`, `Attach Force` |
| A property that is present or absent | **Add** / **Remove** | `Add Ground` / `Remove Ground`, `Add Input` / `Remove Input`, `Add Slider` / `Remove Slider` |
| Fusing bodies | **Weld** / **Unweld** | `Weld Joint`, `Unweld Joint`, `Un-weld All` |
| Removing anything | **Delete** | `Delete Joint`, `Delete Link`, `Delete Cylinder` |

`Make` survives in exactly one place — `Make Force Global` / `Make Force Local`
— because that pair is a switch between two states rather than the presence or
absence of one. Do not reach for it anywhere else.

**Delete means the thing you named goes**, along with anything that cannot
stand without it. `Delete Cylinder` on one of a cylinder's joints deletes the
cylinder and leaves the joint if another link still holds it; `Delete` on that
joint deletes the joint. If those two want different outcomes, they need different labels — which
is why they have them.

### The mechanism

| Use | For | Not |
| --- | --- | --- |
| **mechanism** | the thing on the grid | ~~linkage~~ (stops being true the moment it has a cylinder), ~~assembly~~ |
| **project** | the saved document | — |
| **animation** | playing the mechanism | ~~simulation~~, ~~playback~~ (internal only) |
| **input** | in controls: the driven joint | — |
| **driven** | in prose about the mechanism | ~~actuator~~ (internal only) |
| **Edit / Analyze / Synthesis** | the three modes, capitalised as the tabs spell them | ~~analysis mode~~ |

`Share Project` and `New Project` are about the document, and stay.

### Parts

| Use | For |
| --- | --- |
| **joint** | a pin, a slider, a tracer point — anything with an id letter |
| **link** | a bar between joints |
| **compound** | several links welded into one rigid body |
| **ground** | a joint fixed to the frame |
| **slider** / **block** | a joint that slides, and the black block drawn on it |
| **slot** | the channel a floating slider runs in |
| **force** | an applied load |

### Units and numbers

Show the unit the mechanism is currently in — never a list of the alternatives.
`in {{ forceUnitLabel }}`, not `in Newtons | lbf`. The parser accepts a bare
number or a number with a unit, and messages should say so once:
`Type a number, with or without a unit — 2, 2 cm, 0.75 in.`

Spell it **centre of mass** in prose and **CoM** in a label. Not `COM`, not
`center of mass`, not both in one panel.

---

## The cylinder

| Use | For | Not |
| --- | --- | --- |
| **cylinder** | the whole part | ~~ram~~ |
| **barrel** | the fat outer body it slides in | ~~cylinder~~ (that is the whole part here) |
| **rod** | the thin bar that slides out | — |
| **joint** | either end, where it attaches | ~~mount~~ |
| **stroke** / **travel** | how far the rod moves | — |
| **closed** / **open** | the two ends of the travel | ~~retracted~~, ~~extended~~ |

The black block on the rod has **no user-facing name**. Describe what it does —
"where the rod begins its cycle" — rather than calling it a piston. If it ever
needs discussing on its own it should get a label on the drawing first, and then
the word is earned.

**`mount` is a code word, not a user word.** `barrelFar`, `rodFar`,
`dragCylinderMount` keep it, because in code it usefully separates the two
joints a user can reach from the three interior ones that have no hitbox. A user
never sees those three, so from their side a cylinder has exactly two joints and
"joint" is unambiguous. Same treatment as `playback` and `actuator`.

**`ram` survives in code comments** — 113 of them — and was left there
deliberately. This guide governs what the app *says*; rewriting a hundred
explanations to change a synonym would churn a lot of carefully-worded prose for
no reader's benefit. Do not use it in new comments, and never in the UI.
