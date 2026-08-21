# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PMKS+ (Planar Mechanism Kinematic Simulator Plus) — an educational Angular 22 web app for creating, editing, and analyzing 2D planar linkages (kinematic + force analysis). Single-page app rendered as an interactive SVG grid; no routing.

Requires Node ≥22.22 (or 24.x). The esbuild `application` builder is used; `outputPath.browser` is pinned to `""` so output stays flat at `dist/pmksweb` for the Netlify publish dir. Runtime `require()` calls are not supported by the bundler — use ES imports.

## Commands

- `npm start` — dev server at http://localhost:4200 (live reload)
- `npm run build` — production build to `dist/pmksweb`
- `npm test -- --watch=false` — Vitest suite (jsdom) via `@angular/build:unit-test`; drop the flag for watch mode

There is no lint target (`tslint.json` is vestigial). Formatting follows `.prettierrc`: 100-char width, single quotes, 2-space indent. `npm run format:check` reports the state; `npm run format` fixes it.

**About 50 files predate the config and do not satisfy it.** Running Prettier across one of them rewrites code you did not touch and buries your change — so format only the files you actually edited, and check first, because a file being unformatted is the normal case rather than the exception. Cleaning up the backlog belongs in its own PR. `.prettierignore` deliberately excludes Markdown (Prettier pads every table cell and rewrites `*emphasis*` as `_emphasis_`, so a one-line doc edit lands as hundreds of lines of realignment) and the generated `src/test-data/verification` tables.

## UI validation: run it yourself, then have GPT-5.6 sol review it

**Run UI validation, browser automation, screenshots, and end-to-end interaction checks
directly**, following the `ui-validate` skill (`.claude/skills/ui-validate/SKILL.md`): Playwright
from `/tmp/pmks-playwright`, a disposable Chrome profile under `/tmp`, screenshots and JSON
reports into gitignored `artifacts/`. Inspect your own screenshots rather than trusting an exit
code. Do not use claude-in-chrome (`mcp__claude-in-chrome__*`) in this repo — it drives the user's
real, logged-in browser, which the skill's profile rules exist to keep out of automation.

**Then send the same UI work to GPT-5.6 sol for review**, through the Codex CLI:

```bash
codex exec -m gpt-5.6-sol --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true "<what to check, and what correct looks like>"
```

**Say what to review, not how to review it.** GPT-5.6 sol has its own browser skills on its end,
so describe the change, the URL or flow, and what "correct" means — never which tools to call,
which profile to open, or how to drive the page. Prescribing its tool use overrides skills that
know the job better than the prompt does.

The same command is how to get a second opinion on a hard non-UI problem.

**The model id is `gpt-5.6-sol`, and the suffix is load-bearing.** Plain `gpt-5.6` is rejected —
*"not supported when using Codex with a ChatGPT account"* — behind a misleading
`Model metadata for 'gpt-5.6' not found. Defaulting to fallback metadata` warning that reads like
it worked. Verified against codex-cli 0.146.0.

Tests are Vitest but written in Jasmine style (globals via `vitest/globals`). Vitest errors on spec files containing no tests.

The app is **fully standalone** — `src/main.ts` calls `bootstrapApplication`, there is no `AppModule` and no `NgModule` anywhere, and components declare their own `imports`. A component spec must therefore import the component itself rather than a declaring module. (`tsconfig.spec.json` used to include `src/app/app.module.ts` to keep NgModule-declared components' template scope under the per-file test compile; that file and that workaround are both gone.)

Unit specs stay co-located in `src/**/*.spec.ts`; browser-driven E2E tests are Playwright scripts in `e2e/*.mjs` (run directly — see above), with outputs in gitignored `artifacts/`. Details in `e2e/README.md`.

**Every verification mechanism is published as a URL.** A fixture is a TypeScript object and the app only speaks URLs, so a reviewer otherwise has to rebuild a linkage by hand to see what a failing test is about. `docs/fixture-urls.md` is generated from `src/test-utils/verification/fixture-gallery.ts`; `npm run fixture-urls` refreshes it, and a spec fails if it is stale, so adding a fixture without regenerating cannot slip through. Add new mechanisms to `FIXTURE_GALLERY` rather than inlining them in a spec.

Regenerate against a PR's deploy preview when you want links a reviewer can click before merge — a mechanism using a feature that has not shipped yet will not decode on production:

```bash
PMKS_FIXTURE_BASE_URL=https://deploy-preview-NNN--pmksprod.netlify.app npm run fixture-urls
```

## Deployment / branch rules

**Never push directly to `main`** — commits to `main` auto-deploy to production (app.pmksplus.com). Work in branches/forks and open PRs. Every non-main branch auto-publishes to `https://[BRANCHNAME]--pmks.netlify.app`.

The `version` in `package.json` is now bumped by hand (the automated bump action was removed). It is what the bottom bar displays, via `environments/environment*.ts`, so raise it in the PR that ships a release.

## Architecture

### State lives in root services, serialized as URLs

The entire mechanism state (joints, links, forces, settings) is encoded into a compact URL-safe string. This one mechanism drives sharing, persistence, **and undo/redo**:

- `services/url-generation.service.ts` encodes current state → URL query string.
- `services/url-processor.service.ts` decodes the query string on app load (in its constructor) and rebuilds the mechanism, then strips the query from the address bar.
- `services/transcoding/` contains the codec: `StringTranscoder` (base-N number packing, flag bitfields, checksum) and `MechanismBuilder` (turns decoded data back into Joint/Link/Force objects).
- `services/save-history.service.ts` implements undo/redo as an array of these URL strings; restoring a state re-runs the URL decoder. Any edit that should be undoable must call `MechanismService.updateMechanism(true)` (the `save` flag) or `save()`.

Changing the encoding format breaks previously shared URLs — the transcoder format is a compatibility surface.

### MechanismService is the central hub

`services/mechanism.service.ts` (root singleton) owns the **editable** drawing: `joints`, `links`, `forces` arrays representing the state at timestep 0. All create/delete/weld/ground/slider/input mutations live here.

`updateMechanism()` first **partitions** the drawing into independently solvable machines (`model/mechanism/mechanism-partition.ts`), then builds one `Mechanism` (`model/mechanism/mechanism.ts`) per partition — each deep-copies its own part of the state and, if that machine is valid (DOF = 1 with an input joint), precomputes joint/link/force positions for **all** its timesteps up front. `partitions[i]` and `mechanisms[i]` are the same machine seen two ways, and stay in the same order. One drawing can therefore hold several machines (M1, M2…), each with its own input, speed, direction and playback row — so **do not assume index 0**; ask `partitions`. Note `partition.joints` is everything the solver must be handed (shared frame pieces included) while `partition.ownJoints` is what that machine is actually made of — the one to ask "is this mine?".

`onMechUpdateState` (BehaviorSubject<number>) broadcasts mechanism state: 0 = normal, 1 = being dragged (graphs disabled), 2 = pending graph redraw, 3 = pending analysis after add/remove.

Animation ticks on a ~16 ms setTimeout (`FRAME_INTERVAL_MS`) but advances by **elapsed real time**, not one precomputed timestep per tick: samples are spaced a fixed amount of input travel apart (1 degree of crank rotation for a pin), so how much simulated time one sample covers depends on the input speed. That is what makes a faster input speed animate faster and one revolution take 60/RPM seconds regardless of frame rate. `animate(progress, playing)` mutates the editable joints/links/forces in place; any external call is treated as a seek. Machines run on one shared clock by default, and can be unsynced to run on their own. Editing is only allowed when the animation is paused at timestep 0 (`isPlaying || mechanismTimeStep !== 0` gates the Edit panel).

### Solvers (`src/app/model/mechanism/`)

Pure computation, mostly static classes: `loop-solver` (finds kinematic loops), `position-solver`, `kinematic-solver` (velocity/acceleration), `force-solver`. `app.component.spec.ts` numerically verifies these against MATLAB results (`SixBarVerification.m`) for a sixbar linkage — treat it as the regression test for solver changes.

### Model classes (`src/app/model/`)

- Joints: `Joint` → `RealJoint` → `RevJoint` (revolute) / `PrisJoint` (prismatic). Code frequently narrows with `instanceof RealJoint` guards.
- Links: `Link` → `RealLink` / `SliderBlock` (the block that rides a slot; there is no `Piston` class any more). A **welded** compound link is a `RealLink` whose `subset` holds its constituent sub-links; weld/unweld logic in MechanismService restructures joints' `links`/`connectedJoints` arrays and link IDs (link IDs are the concatenated, sorted joint letters).
- A driven joint carries its own speed: `Joint.driveSpeed`, signed for direction, in rpm for a pin and length/second for a slider. Zero means "use the document-wide default" — which is what every URL written before this existed says. A drawing with several machines needs one speed per machine, so it lives on the joint rather than in settings.
- `mechanism/readiness.ts` produces the per-machine blocker/warning list the mode chips and setup drawers show; `mechanism/actuator.ts` decides what can be driven.
- Joint IDs are single letters assigned alphabetically (`determineNextLetter`).
- `utils.ts` is a large grab-bag: interaction state enums (`gridStates`, `jointStates`, `linkStates`, `forceStates`), unit enums (`LengthUnit`, `GlobalUnit`, ...), and geometry helpers.

### UI layer

**Where things are on screen.** `app.component.html` is the whole layout, and it is worth reading before describing the UI — the arrangement below replaced an earlier one with a horizontal file toolbar and a *vertical mode rail down the left*, and stale descriptions of that older layout have outlived it in more than one place.

| Region | Component | Holds |
| --- | --- | --- |
| Top strip | `app-top-bar` | project menu + logo · the four **mode tabs**, each with a readiness chip · a corner card that is Undo/Redo in Synthesis/Edit and swaps to **Export Data** in the analysis modes |
| Left card (below the strip, `left: 0`) | `app-left-tabs` | the current mode's panel — Synthesis form, Edit properties, or Analysis graphs. 250px, widening to 400px in analysis |
| Canvas (full bleed, behind everything) | `app-new-grid` | grid, right-click context menus, drag |
| Bottom centre | `app-playback-bar` | transport card (speed · play/pause · stop-to-start) and a scrub card with **one row per machine** |
| Bottom right | `app-view-controls` | centre of mass · joint IDs · traced paths ‖ zoom out · zoom in · reset view |
| Bottom strip | `app-bottombar` | mode name · status · cursor coords · units |
| Right drawer | `app-right-panel` | Settings, Help/Feedback, the two analysis setups, Export Data |

The **modes are tabs in the top strip, not a left rail**, and there are four of them — Synthesis, Edit, Kinematic Analysis, Force Analysis (`TabID`) — not three. The left card is that mode's panel.

- `AppComponent` is just a shell that registers SVG icons; `component/new-grid/new-grid.component.ts` is the real center — the SVG canvas handling the mouse/touch interaction state machine and context menus, with pan/zoom via `SvgGridService` (svg-pan-zoom + hammerjs).
- `SelectedTabService` (`TabID` enum) coordinates the four modes; the Edit and analysis panels operate on whatever `ActiveObjService` says is selected (joint, link, force, mechanism, background image, or synthesis pose).
- The right drawer is addressed by number through statics on `RightPanelComponent`: 1 Settings, 3 Help, 4 Debug (dev only), 5 `KINEMATIC_SETUP_TAB`, 6 `FORCE_SETUP_TAB`, 7 `EXPORT_TAB`. **Tab 2 (`app-equation-panel`) is unreachable** — nothing calls `tabClicked(2)` and its content is placeholder images. It is unfinished work, not a feature.
- `SettingsService` exposes document-wide settings as RxJS BehaviorSubjects (units, gravity, grid and snap visibility, object scale). Input **speed and direction are not global** — they belong to the driven joint (`Joint.driveSpeed`), because a drawing can hold several machines; the SettingsService values are only the default a joint falls back to.
- `component/BLOCKS/` holds the reusable form primitives (input, toggle, radio, dual-input, panel-section, ...) that the panels are composed from; `component/MODALS/` holds the two dialogs (Templates, touchscreen warning).
- Messages to the user go through `NotificationService`, which replaced the old `NewGridComponent.sendNotification()` static. Some components still talk through statics (e.g. `RightPanelComponent.openTab` / `insistOn`) — grep for the static before assuming a service is the only channel.
- Four-bar synthesis (generating a linkage from three desired coupler poses) lives in `services/synthesis/`.
- The first-run tour is five hard-coded `intro.js` steps inside `new-grid.component.ts`'s `ngOnInit`, fired only when the grid loads empty and suppressed for good by its own "don't show again". There is no way to replay it and no separate onboarding component.

### Misc

- `netlify/functions/getEmailJSKey.ts` is a Netlify serverless function supplying the EmailJS key for the feedback form.
- Circular service dependencies are broken with Angular's `Injector` (`injector.get(...)` at call time) in MechanismService, SaveHistoryService, and UrlProcessorService — keep that pattern in mind before adding constructor injections between those services.

## Conventions (from README)

- Keep classes under ~200 lines and functions short; comment *why*, not *how*.
- Standard Angular naming: dash-delimited filenames with type suffixes (`foo-bar.service.ts`), `Component`/`Service`/`Module`/`Pipe` class suffixes, `app-` selector prefix.
