# PMKS+ tests

Two layers, organized by what they exercise:

| Layer | Where | Runner | What it covers |
| --- | --- | --- | --- |
| Unit / solver | `src/**/*.spec.ts` (co-located with source, Angular convention) | Vitest — `npm test -- --watch=false` | Components; `src/app/app.component.spec.ts` is the MATLAB-verified solver regression suite |
| E2E / UI | `e2e/*.mjs` (this folder) | Playwright via plain Node | Real-browser interaction: grid clicks/drags, context menus, panels, animation, mobile viewport |

Unit specs stay in `src/` because `tsconfig.spec.json` discovers them via
`src/**/*.spec.ts` and Angular component specs resolve templates relative to
their source. Everything browser-driven lives here.

## E2E scripts

- `full-tour.mjs` — broad tour: panels, templates, settings, share URL, help, and a fresh load at
  phone size. Looks for a NaN degrees-of-freedom, a page wider than its viewport, a Save that starts
  no download and a template dialog that will not close; exits non-zero on any of them
- `interaction-sweep.mjs` — every context-menu action on every kind of object (joint, link, force,
  bare grid) across several mechanisms: each enabled item is clicked, the model and drawing are read
  back, and it is undone. Catches the silent click — enabled, pressed, and nothing happened and
  nothing was said. `ONLY=4-Bar,Cylinder_Boom` narrows it
- `phase1-drag.mjs` — drag gestures: joint snap ring and merge, merging onto a slider's pin,
  refusing an over-constraining merge, whole-link drag, one undo entry per gesture,
  click-without-nudge, the canvas staying put after a merge, and an analysis mode refusing drags.
  Prints a PASS/FAIL check list and exits non-zero on any failure, so it can gate a change.
- `force-analysis-panels.mjs` — Force Analysis rows on the joint and link analysis panels, and the shared Force Analysis Type toggle
- `left-nav-modes.mjs` — mode navigation in the top strip that replaced the rail: the four modes, the
  panel following the mode, the sliding highlight, the readiness chips, an analysis mode refusing to
  open, and the rewind on leaving one
- `template-open.mjs` — the template library: loads in place on an empty grid, and shows a new-tab / replace / cancel choice (with replace undoable) when the grid already holds work
- `template-graphs.mjs` — every template in the library, checked for *correct* kinematic graphs: opens each payload, selects each moving joint in the Kinematic mode, reads the plotted series out of `AnalysisGraphComponent` (numbers, not pixels) and cross-checks position against the solved joint positions and velocity/acceleration against difference quotients of the series above them. Reversals and dead centres are identified from the source series and reported by sample index rather than tolerated silently. Exits non-zero on any failure
- `template-thumbnails.mjs` — regenerates the library cards' images in `src/assets/gifs/` by opening each generated template payload and clipping the canvas. Not a check: it writes assets, so run it after `npm run template-payloads` changes a payload
- `playback-timing.mjs` — real-time playback: a revolution takes 60/RPM wall-clock seconds, the reported cycle period scales with input speed, and simulation time is held (not the sample index) across a speed change
- `input-settings-and-playback.mjs` — the input joint's Input Settings section (direction, unit-free speed field, RPM / deg/s / rad/s picker), its removal from global Settings, the time field's width, and that playback interpolates between samples at a slow input speed
- `synthesis-redesign.mjs` — Synthesis end to end: the chooser, arming and dropping the three positions (wheel turns the one about to land, and does not zoom), dragging one without panning the canvas, Generate, the candidate gallery and its hover comparison, the six-bar driver, the preview transport, Insert and its Undo, and the design surviving undo and redo
- `context-menu.mjs` — the right-click menu on every kind of part and in every mode: the fixed Attach/State/Machine ladder with Delete alone at the foot, states written as ticked switches rather than labels that flip, the model's own reason in the right-hand slot of every greyed row (a load at a shared pin, a weld with nothing to fuse, a sealed cylinder, a locked part), the deletion cascades named before the click, the counts beside Lock All and Unlock All, and the analysis modes offering the trace and the way back into Edit and nothing that edits

## Running

Prerequisites: dev server on http://127.0.0.1:4200/ (`npm start`) and a
Playwright install at `/tmp/pmks-playwright`
(`mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright`).
Playwright is deliberately **not** a devDependency — it would bloat Netlify
deploy installs. Run these scripts directly for local validation; they are not
part of CI (see `SKILLS.md` and `.claude/skills/ui-validate/SKILL.md`).

```bash
node e2e/interaction-sweep.mjs
```

Environment overrides:

- `PMKS_BASE_URL` — app URL (default `http://127.0.0.1:4200`). `PMKS_URL` is still read by the
  scripts that were written against it, but every script now takes `PMKS_BASE_URL` first, so one
  variable drives the whole folder
- `RUN_PREFIX` — prefix for screenshot/report filenames
- `PMKS_PLAYWRIGHT_DIR` — Playwright install dir (default `/tmp/pmks-playwright`)
- `PMKS_CHROME` — Chrome executable (default `/Applications/Google Chrome.app/...`)
- `PMKS_HEADED=1` — show the browser window (headless by default)

Each run launches Chrome with a disposable profile under `/tmp` (never your
real browser session) and writes screenshots plus a `*-report.json` (console
errors, crashes, element counts per checkpoint) to `artifacts/screenshots/`,
which is gitignored — outputs are throwaway, scripts are tracked.

Interaction gotchas baked into these scripts:

- The app places joints from tracked `mousemove`, not click coordinates — always
  hover/move to the target before the finalizing click, and prefer the Edit
  panel's HTML controls over the SVG context menu (its hitboxes drift at some
  viewports).
- Modes are the `.tabButton`s in the top strip: Synthesis, Edit, Kinematic, Force.
  What used to be called Analyze is **Kinematic**. Pressing a mode is idempotent —
  they no longer toggle their own panel — so `page.locator('.tabButton', { hasText: 'Kinematic' })`
  can be clicked without checking first. Below 1080px the labels are hidden, and
  `hasText` stops matching with them; size the viewport wider than that.
- File actions (Templates, Open, Save, Share Project, Settings, Help / Feedback) live
  behind the hamburger: click `.topStrip .iconButton`, then the `.projectMenu .menuItem`.
  Undo and Redo are `.historyButton`s in the strip itself, in every mode.
- The playback controls (play/pause, speed, `#slider`, `#animationBar-input`) live in
  `app-playback-bar`, which renders only in the Kinematic and Force modes. The scrubber
  is now a plain horizontal `input[type=range]`.
- An analysis mode that cannot be entered does not open at all: the press raises the
  `app-analysis-setup` drawer instead, so an absent play button — not a disabled one —
  is what "this mechanism will not run" looks like.
- `#bottomBar` is a read-only status strip (mode, status phrase, units, version) with
  `pointer-events: none`. It no longer prints the degrees of freedom; read the mobility
  from `mechanismSrv.mechanisms[i].dof`, or from the setup drawer's `.factGrid`.
