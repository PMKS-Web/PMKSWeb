/**
 * One known drawing scale at the start of every test.
 *
 * `SettingsService.objectScale` is a process-wide static, and the solver
 * measures real things against it: a cylinder's stroke, the ends of a slot, the
 * tolerance a sealed cylinder's collinearity is judged by. Specs that need a
 * particular scale set it — and, until this file existed, walked away, so the
 * next spec in the worker inherited whatever the last one wanted.
 *
 * That is what made the suite intermittently red in a way that moved around:
 * `url-sealed-cylinder`, `cylinder-lifecycle`, `mechanism.service` and
 * `input-toggle` all failed on different runs of the same commit, each time
 * because a mechanism had been solved at a scale its assertions were not
 * written for.
 *
 * Fixtures built through `buildMechanism` pin their own scale and put it back;
 * this covers everything else — anything assembled by hand, or through
 * `MechanismBuilder` or the test harness.
 */
import { beforeEach } from 'vitest';
import { SettingsService } from './app/services/settings.service';
import { MODEL_SCALE } from './app/model/render-scale';

beforeEach(() => {
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
