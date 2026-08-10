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
  click-without-nudge, the canvas staying put after a merge, and Analyze mode refusing drags.
  Prints a PASS/FAIL check list and exits non-zero on any failure, so it can gate a change.
- `force-analysis-panels.mjs` — Force Analysis rows on the joint and link analysis panels, and the shared Force Analysis Type toggle
- `left-nav-modes.mjs` — mode-scoped left nav rail: Edit/Analyze tool sections, the absorbed view controls, and the rewind-on-leaving-Analyze behavior
- `template-open.mjs` — the template library: loads in place on an empty grid, and shows a new-tab / replace / cancel choice (with replace undoable) when the grid already holds work
- `template-graphs.mjs` — every template in the library, checked for *correct* kinematic graphs: opens each payload, selects each moving joint on the Analyze tab, reads the plotted series out of `AnalysisGraphComponent` (numbers, not pixels) and cross-checks position against the solved joint positions and velocity/acceleration against difference quotients of the series above them. Reversals and dead centres are identified from the source series and reported by sample index rather than tolerated silently. Exits non-zero on any failure
- `template-thumbnails.mjs` — regenerates the library cards' images in `src/assets/gifs/` by opening each generated template payload and clipping the canvas. Not a check: it writes assets, so run it after `npm run template-payloads` changes a payload
- `playback-timing.mjs` — real-time playback: a revolution takes 60/RPM wall-clock seconds, the reported cycle period scales with input speed, and simulation time is held (not the sample index) across a speed change
- `input-settings-and-playback.mjs` — the input joint's Input Settings section (direction, unit-free speed field, RPM / deg/s / rad/s picker), its removal from global Settings, the time field's width, and that playback interpolates between samples at a slow input speed

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

- `PMKS_URL` — app URL (default `http://127.0.0.1:4200/`)
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
- The playback controls (play/pause, speed, scrubber, time field) live in the
  left nav rail's Analyze group, so they only exist while Analyze is the open
  mode. Open Analyze before touching them — and check first, because the rail
  buttons toggle their own panel, so a blind click closes what you need.
- The scrubber is a horizontal Material slider rotated 90°, so drag it down its
  height (min at the top), not across its width.
