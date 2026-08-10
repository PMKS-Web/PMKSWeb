---
name: ui-validate
description: Run UI validation, browser automation, screenshots, smoke tests, visual verification, and computer-use tasks directly with Playwright. Use whenever a change needs visual or behavioral verification in the running app, or the user mentions UI validation, browser testing, screenshots, end-to-end checks, or computer use.
---

# Direct UI validation with Playwright

Run browser and computer-use work directly. Reuse or extend the tracked
Playwright scripts in `e2e/*.mjs`, inspect the resulting screenshots and JSON
reports yourself, and return a compact PASS/FAIL summary.

## Safety

- Use a disposable Chrome profile under `/tmp` for routine testing.
- A task-specific persistent profile under `/tmp` is allowed when the user
  explicitly authenticates it for the task.
- Never attach automation to the user's normal browser profile.
- Keep screenshots and reports in gitignored `artifacts/` directories.

## Preconditions

1. For local PMKS+ checks, verify that `http://127.0.0.1:4200/` returns `200`.
   Start `npm start` and wait for compilation if needed.
2. Use the Playwright installation at `/tmp/pmks-playwright`. If it is absent:
   `mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright && npx playwright install chromium`

## Running checks

- Run scripts with plain Node and
  `NODE_PATH=/tmp/pmks-playwright/node_modules` when needed.
- Capture console errors, page crashes, and element counts at meaningful
  checkpoints.
- Inspect screenshots and reports rather than trusting process exit status
  alone.
- Keep browser automation repeatable. Add generally useful PMKS+ workflows to
  `e2e/`; keep one-off external-site or authenticated helpers under `/tmp`.

## Existing PMKS+ scripts

- `e2e/full-tour.mjs` — broad tour: panels, templates, settings, share URL,
  mobile viewport
- `e2e/interaction-sweep.mjs` — every context-menu action on every kind of
  object; narrow it with `ONLY=4-Bar node e2e/interaction-sweep.mjs`
- `e2e/phase1-drag.mjs` — drag gestures, snapping, merging, one undo per gesture

`e2e/README.md` lists the rest. Prefer a suite that asserts and exits non-zero
over one that only takes screenshots: the point is to fail, not to look.

The PMKS+ canvas places joints from tracked mouse movement rather than click
coordinates. Move to the target before the finalizing click, and prefer the
Edit panel's HTML controls over drifting SVG context-menu hitboxes.
