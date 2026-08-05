// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { Joint, PrisJoint } from '../../app/model/joint';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * Two blocks riding one bar, each pushed by its own crank off a common ground
 * pivot. A user's mechanism, and the first one with two floating slots cut into
 * the same carrier.
 *
 * A sliding joint is on its slot or it is not a sliding joint. The second one
 * was solved by a primitive that never looked at its slot, so it left the bar
 * entirely — nearly two units off at the widest, while the first one held its
 * line to four decimal places through the whole cycle.
 */
const SHARED =
  '2P.GQ.K,0.1011.KA,A,1Ds,D6,0.GB,B,0Sc,xS,0.MC,C,Lv,AM,0.GD,D,GM,du,0.HE,E,GM,du,0,AB,A,B.' +
  'GF,F,gt,SL,0.HG,G,gt,SL,0,AB,A,B..YRAB,AB,Fe,Fe,Oe,aH,B2DFDB,A,B,,.YRCD,CD,Fe,Fe,J7,P7,26A69A,' +
  'C,D,,.YPDE,DE,Fe,0,0,0,,D,E,,.YRCF,CF,Fe,Fe,WO,JM,00695C,C,F,,.YPFG,FG,Fe,0,0,0,,F,G,,...JFQ';

function build() {
  const decoder = new StringTranscoder();
  decoder.decodeURL(SHARED);
  const harness = createMechanismHarness();
  new MechanismBuilder(
    harness.service,
    decoder,
    new SettingsService(),
    new ActiveObjService()
  ).build(true);
  harness.service.updateMechanism(false);
  return harness;
}

/** How far a sliding joint sits off the line its slot is cut along. */
function offItsSlot(frame: Joint[]): { id: string; across: number }[] {
  const byId = new Map(frame.map((joint) => [joint.id, joint]));
  return frame
    .filter((joint): joint is PrisJoint => joint instanceof PrisJoint && joint.isFloating)
    .flatMap((slider) => {
      const a = byId.get(slider.slotJointA?.id ?? '');
      const b = byId.get(slider.slotJointB?.id ?? '');
      if (!a || !b) return [];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) return [];
      return [{ id: slider.id, across: ((slider.x - a.x) * dy - (slider.y - a.y) * dx) / length }];
    });
}

describe('two slots cut into one carrier', () => {
  it('keeps every block on its own slot, at every timestep', () => {
    const harness = build();
    const mechanism = harness.service.mechanisms[0];

    expect(mechanism.isMechanismValid(), 'the mechanism solves at all').toBe(true);
    expect(mechanism.joints.length, 'a full cycle of samples').toBeGreaterThan(300);

    const worst = new Map<string, number>();
    for (const frame of mechanism.joints) {
      for (const { id, across } of offItsSlot(frame)) {
        worst.set(id, Math.max(worst.get(id) ?? 0, Math.abs(across)));
      }
    }

    expect(worst.size, 'both sliders were measured').toBe(2);
    for (const [id, across] of worst) {
      // A block off its slot is not sliding on anything. The tolerance is the
      // solver's own rounding, not a licence to drift — measured in user
      // units, since the solved coordinates are model units.
      expect(across / MODEL_SCALE, `${id} stays on its slot`).toBeLessThan(1e-3);
    }
  });
});
