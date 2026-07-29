// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Injector } from '@angular/core';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { ColorService } from '../../app/services/color.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { NumberUnitParserService } from '../../app/services/number-unit-parser.service';
import { SettingsService } from '../../app/services/settings.service';
import { SvgGridService } from '../../app/services/svg-grid.service';
import { DragStateService } from '../../app/services/drag-state.service';
import { SynthesisBuilderService } from '../../app/services/synthesis/synthesis-builder.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

// The linkage from issue #199. An exact parallelogram four-bar: A->B and D->C are
// the same vector, so every revolution the crank lines up with the ground link and
// the two circle-circle roots trade places. Joint C used to jump ~9.9 units there,
// into the crossed assembly mode.
const PARALLELOGRAM_FOUR_BAR =
  '2P.SI.K,0.1011.MA,A,01oO,LA,0.GB,B,029z,1Vm,0.GC,C,0xr,1Vm,0.KD,D,0aG,LA,0..YRAB,AB,Fe,Fe,01_B,wT,c5cae9,A,B,,.YRBC,BC,Fe,Fe,01Yv,1Vm,303e9f,B,C,,.YRCD,CD,Fe,Fe,0m3,wT,c5cae9,C,D,,...N_z';

// The same linkage reduced to a square: every link is 5 units, so the crank is as
// long as the ground and joint B passes exactly through ground joint D once per
// revolution. There the two circles locating C share a centre and C is undefined;
// half a turn later they are externally tangent. Both are singular, and neither is
// a toggle — a parallelogram rotates straight through.
const SQUARE_FOUR_BAR =
  '2P.SI.K,2q.1011.MA,A,0,0,0.GB,B,0,1E8,0.GC,C,1E8,1E8,0.KD,D,1E8,0,0..YRAB,AB,Fe,Fe,0,d4,c5cae9,A,B,,.YRBC,BC,Fe,Fe,d4,1E8,303e9f,B,C,,.YRCD,CD,Fe,Fe,1E8,d4,c5cae9,C,D,,...JDn';

function loadMechanism(payload: string) {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  // GridUtilsService resolves MechanismService at call time, so it has to be
  // handed an injector that reads the binding below rather than a finished one.
  let service!: MechanismService;
  const grid = new GridUtilsService(
    new SynthesisBuilderService(parser, settings),
    new SvgGridService(settings, new DragStateService()),
    { get: () => service } as unknown as Injector
  );
  const active = new ActiveObjService();
  const injector = { get: () => ({ save: () => {} }) } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);

  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(service, decoder, settings, active).build(true);
  service.updateMechanism();
  return service;
}

/** Largest distance any single joint travels between consecutive samples. */
function largestStep(service: MechanismService) {
  const frames = service.mechanisms[0].joints;
  let worst = { distance: 0, joint: '', sample: -1 };
  for (let sample = 1; sample < frames.length; sample++) {
    const previous = frames[sample - 1];
    const current = frames[sample];
    for (let i = 0; i < current.length; i++) {
      const distance = Math.hypot(current[i].x - previous[i].x, current[i].y - previous[i].y);
      if (distance > worst.distance) {
        worst = { distance, joint: current[i].id, sample };
      }
    }
  }
  return worst;
}

describe('Assembly mode tracking', () => {
  it('carries a parallelogram four-bar through its collinear pose without switching modes', () => {
    const service = loadMechanism(PARALLELOGRAM_FOUR_BAR);
    expect(service.mechanisms[0].isMechanismValid()).toBe(true);

    // One degree of crank per sample: no joint on this linkage moves more than a
    // fraction of a unit per step. The old branch flip moved joint C by ~9.9.
    const worst = largestStep(service);
    expect(worst.distance).toBeLessThan(0.5);
  });

  it('keeps every link rigid across the full revolution', () => {
    const service = loadMechanism(PARALLELOGRAM_FOUR_BAR);
    const frames = service.mechanisms[0].joints;

    // A branch flip preserves link lengths, so this is not what caught the bug —
    // it guards the opposite failure, a solver that drifts instead of flipping.
    for (const link of service.links) {
      if (link.joints.length < 2) continue;
      const [a, b] = link.joints.map((j) => j.id);
      const lengths = frames.map((frame) => {
        const ja = frame.find((j) => j.id === a)!;
        const jb = frame.find((j) => j.id === b)!;
        return Math.hypot(jb.x - ja.x, jb.y - ja.y);
      });
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.001);
    }
  });

  it('rotates a square parallelogram a full turn instead of treating a fold as a toggle', () => {
    const service = loadMechanism(SQUARE_FOUR_BAR);
    expect(service.mechanisms[0].isMechanismValid()).toBe(true);

    // Reversing at the fold used to nearly double the sample count; one clean
    // revolution is 360 one-degree steps plus the pose at t = 0.
    expect(service.mechanisms[0].joints.length).toBe(361);
    expect(largestStep(service).distance).toBeLessThan(0.5);
  });

  it('keeps a square parallelogram in parallelogram mode the whole revolution', () => {
    const service = loadMechanism(SQUARE_FOUR_BAR);

    // Parallelogram mode means the coupler only translates: C stays exactly one
    // ground-link vector away from B. The crossed mode rotates it instead.
    for (const frame of service.mechanisms[0].joints) {
      const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => frame.find((j) => j.id === id)!);
      expect(c.x - b.x).toBeCloseTo(d.x - a.x, 2);
      expect(c.y - b.y).toBeCloseTo(d.y - a.y, 2);
    }
  });

  it('holds grounded joints still', () => {
    const service = loadMechanism(PARALLELOGRAM_FOUR_BAR);
    const frames = service.mechanisms[0].joints;
    const grounded = service.joints.filter((j) => (j as { ground?: boolean }).ground);
    expect(grounded.length).toBeGreaterThan(0);

    for (const joint of grounded) {
      const start = frames[0].find((j) => j.id === joint.id)!;
      for (const frame of frames) {
        const here = frame.find((j) => j.id === joint.id)!;
        expect(Math.hypot(here.x - start.x, here.y - start.y)).toBeLessThan(1e-9);
      }
    }
  });
});
