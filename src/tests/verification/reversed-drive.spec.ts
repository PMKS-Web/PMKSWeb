import { createMechanismHarness, withTestInjector } from '../../test-utils/mechanism-harness';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';

/**
 * Turning the drive round is the one thing a reader can do in an analysis mode
 * that re-solves the mechanism — geometry is locked there, so nothing else can.
 *
 * It went unannounced: the cycle was solved again the other way while every
 * open graph went on drawing the answer to the old one, which is the same
 * curves with the sign of every velocity and acceleration wrong.
 */
function loadFourBar() {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES['4-Bar']);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  return harness;
}

/** What a velocity graph of this joint would plot at a given sample. */
function velocityAt(
  settings: SettingsService,
  harness: ReturnType<typeof loadFourBar>,
  at: number
) {
  const samples = withTestInjector(
    [{ provide: SettingsService, useValue: settings }],
    () => new AnalysisSampleService()
  );
  return samples.sampleAt(
    harness.service.mechanisms[0],
    at,
    'kinematic',
    'loop',
    'Linear Joint Vel',
    'B'
  );
}

describe('Reversing the drive', () => {
  it('negates every velocity component and leaves the magnitude alone', () => {
    const harness = loadFourBar();
    const before = velocityAt(harness.settings, harness, 0);
    expect(before.length).toBe(3);
    expect(before.some((value) => Math.abs(value) > 1e-6)).toBe(true);

    expect(harness.service.reverseDrive(0)).toBe(true);

    const after = velocityAt(harness.settings, harness, 0);
    // The same pose driven the other way: each component turns round, and the
    // speed the joint is moving at does not change.
    expect(after[0]).toBeCloseTo(-before[0], 6);
    expect(after[1]).toBeCloseTo(-before[1], 6);
    expect(after[2]).toBeCloseTo(before[2], 6);
  });

  it('tells the graphs the solution has changed under them', () => {
    const harness = loadFourBar();
    const broadcasts: number[] = [];
    const sub = harness.service.onMechUpdateState.subscribe((state) => broadcasts.push(state));

    harness.service.reverseDrive(0);
    sub.unsubscribe();

    // 2 is "redraw what you are plotting"; without it the chart keeps the
    // curves it already had, which are now the wrong sign.
    expect(broadcasts).toContain(2);
  });

  it('tells the export the solution has changed under it, too', () => {
    // A graph notices the new cycle because it holds the object and the object
    // was replaced. The export's sampled tables are cached against a counter
    // instead -- and reversing installs a solved mechanism without going
    // through `updateMechanism`, so the counter stood still and an export
    // taken after a reversal served the rates from before it, every angular
    // velocity carrying the sign it had just been turned round from.
    const harness = loadFourBar();
    const before = harness.service.solveRevision;

    harness.service.reverseDrive(0);

    expect(harness.service.solveRevision).toBeGreaterThan(before);
  });
});
