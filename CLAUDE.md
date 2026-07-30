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

## UI validation / computer use → GPT-5.5 via Codex CLI

**Route ALL computer-use tasks (UI validation, browser automation, screenshots, visual
verification, end-to-end interaction testing) to GPT-5.5 through the Codex CLI.** Do not use
claude-in-chrome (`mcp__claude-in-chrome__*`) tools in this repo, and do not drive a browser
yourself. Delegate via the `ui-validate` skill (`.claude/skills/ui-validate/SKILL.md`):

```bash
codex exec -m gpt-5.5 --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true "<task prompt>"
```

GPT-5.5 runs Playwright with disposable Chrome profiles under `/tmp`, inspects its own
screenshots, and reports back a compact PASS/FAIL summary — keeping heavy browser output out of
the primary context. See `SKILLS.md` for the routing policy and prompt template.

Tests are Vitest but written in Jasmine style (globals via `vitest/globals`). `tsconfig.spec.json` deliberately includes `src/app/app.module.ts` — without it, NgModule-declared components lose their template scope under the per-file test compile and fail with NG8001. Vitest errors on spec files containing no tests.

Unit specs stay co-located in `src/**/*.spec.ts`; browser-driven E2E tests are Playwright scripts in `e2e/*.mjs` (run by the GPT-5.5 subagent — see below), with outputs in gitignored `artifacts/`. Details in `e2e/README.md`.

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

`services/mechanism.service.ts` (root singleton) owns the **editable** mechanism: `joints`, `links`, `forces` arrays representing the state at timestep 0. All create/delete/weld/ground/slider/input mutations live here. `updateMechanism()` rebuilds `this.mechanisms[0]` — a `Mechanism` (`model/mechanism/mechanism.ts`) that deep-copies the current state and, if the linkage is valid (DOF = 1 with an input joint), precomputes joint/link/force positions for **all** timesteps up front. The `mechanisms` array only ever uses index 0 (multi-mechanism support was planned, never built).

`onMechUpdateState` (BehaviorSubject<number>) broadcasts mechanism state: 0 = normal, 1 = being dragged (graphs disabled), 2 = pending graph redraw, 3 = pending analysis after add/remove.

Animation (`animate()`) steps through the precomputed timesteps on a ~16 ms setTimeout loop, mutating the editable joints/links/forces in place. Editing is only allowed when the animation is paused at timestep 0.

### Solvers (`src/app/model/mechanism/`)

Pure computation, mostly static classes: `loop-solver` (finds kinematic loops), `position-solver`, `kinematic-solver` (velocity/acceleration), `force-solver`, `ic-solver` (instant centers). `app.component.spec.ts` numerically verifies these against MATLAB results (`SixBarVerification.m`) for a sixbar linkage — treat it as the regression test for solver changes.

### Model classes (`src/app/model/`)

- Joints: `Joint` → `RealJoint` → `RevJoint` (revolute) / `PrisJoint` (prismatic). Code frequently narrows with `instanceof RealJoint` guards.
- Links: `Link` → `RealLink` / `Piston`. A **welded** compound link is a `RealLink` whose `subset` holds its constituent sub-links; weld/unweld logic in MechanismService restructures joints' `links`/`connectedJoints` arrays and link IDs (link IDs are the concatenated, sorted joint letters).
- Joint IDs are single letters assigned alphabetically (`determineNextLetter`).
- `utils.ts` is a large grab-bag: interaction state enums (`gridStates`, `jointStates`, `linkStates`, `forceStates`), unit enums (`LengthUnit`, `GlobalUnit`, ...), and geometry helpers.

### UI layer

- `AppComponent` is just a shell that registers SVG icons; `component/new-grid/new-grid.component.ts` is the real center — the SVG canvas handling the mouse/touch interaction state machine and context menus, with pan/zoom via `SvgGridService` (svg-pan-zoom + hammerjs).
- Left panel tabs (Synthesis / Edit / Analyze) are coordinated by `SelectedTabService` (`TabID` enum); the Edit and Analyze panels operate on whatever `ActiveObjService` says is selected (joint, link, force, or synthesis pose).
- `SettingsService` exposes global settings as RxJS BehaviorSubjects (units, input speed, gravity, grid visibility).
- `component/BLOCKS/` holds the reusable form primitives (input, toggle, radio, dual-input, panel-section, ...) that the panels are composed from; `component/MODALS/` holds dialogs.
- Components also communicate through static members (e.g. `NewGridComponent.sendNotification()`, `AnimationBarComponent.animate`) — grep for the static before assuming a service is the only channel.
- Four-bar synthesis (generating a linkage from desired end-effector poses) lives in `services/synthesis/`.

### Misc

- `netlify/functions/getEmailJSKey.ts` is a Netlify serverless function supplying the EmailJS key for the feedback form.
- Circular service dependencies are broken with Angular's `Injector` (`injector.get(...)` at call time) in MechanismService, SaveHistoryService, and UrlProcessorService — keep that pattern in mind before adding constructor injections between those services.

## Conventions (from README)

- Keep classes under ~200 lines and functions short; comment *why*, not *how*.
- Standard Angular naming: dash-delimited filenames with type suffixes (`foo-bar.service.ts`), `Component`/`Service`/`Module`/`Pipe` class suffixes, `app-` selector prefix.
