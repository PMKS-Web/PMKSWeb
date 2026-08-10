import { Injector } from '@angular/core';
import { AnimationBarComponent } from '../../app/component/animation-bar/animation-bar.component';
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
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { LEGACY_FORCE_MECHANISM } from '../fixtures/mechanism-fixtures';

/** A real MechanismService (not a stub) loaded with the fully rotating four-bar template. */
function createLoadedService(payload: string = TEMPLATE_LINKAGES['4-Bar']) {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  // GridUtilsService resolves MechanismService at call time, so it has to be
  // handed an injector that reads the binding below rather than a finished one.
  let service!: MechanismService;
  const grid = new GridUtilsService(
    new SynthesisBuilderService(parser, settings),
    // The injector is only reached when something asks the canvas to re-frame
    // itself, which nothing here does — there is no canvas in this test.
    new SvgGridService(settings, new DragStateService(), {} as unknown as Injector),
    { get: () => service } as unknown as Injector
  );
  const active = new ActiveObjService();
  const injector = { get: () => ({ save: () => {} }) } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);

  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(service, decoder, settings, active).build(true);
  service.updateMechanism();

  return { service, settings };
}

function setInputSpeed(service: MechanismService, settings: SettingsService, rpm: number) {
  settings.inputSpeed.next(rpm);
  service.updateMechanism();
}

/** Degrees of crank rotation represented by a sample index (1 degree per sample). */
function crankDegreesAt(step: number): number {
  return step;
}

describe('Cycle closure', () => {
  it('closes a full crank revolution on exactly one sample per degree', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);

    // 360 one-degree steps plus the pose at t=0.
    expect(service.mechanisms[0].joints.length).toBe(361);
  });

  it('produces an identical sample count at every input speed', () => {
    const { service, settings } = createLoadedService();
    const counts = [5, 10, 20, 60, 240].map((rpm) => {
      setInputSpeed(service, settings, rpm);
      return service.mechanisms[0].joints.length;
    });

    expect(counts).toEqual([361, 361, 361, 361, 361]);
  });

  it('reports the analytic period 2*pi/w, scaling exactly with input speed', () => {
    const { service, settings } = createLoadedService();

    setInputSpeed(service, settings, 10);
    const slowPeriod = service.cyclePeriod();
    setInputSpeed(service, settings, 20);
    const fastPeriod = service.cyclePeriod();

    // 10 RPM = pi/3 rad/s, so one revolution takes exactly 6 s.
    expect(slowPeriod).toBeCloseTo(6, 12);
    expect(fastPeriod).toBeCloseTo(3, 12);
    expect(slowPeriod / fastPeriod).toBeCloseTo(2, 12);
  });

  it('still ends a rocker on its return to the start', () => {
    const { service, settings } = createLoadedService(LEGACY_FORCE_MECHANISM);
    setInputSpeed(service, settings, 10);

    // A rocker cannot complete a revolution; it sweeps out and back instead, so its
    // cycle is longer than 360 samples and only the position check can close it.
    expect(service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(service.mechanisms[0].joints.length).toBeGreaterThan(361);

    const slowPeriod = service.cyclePeriod();
    setInputSpeed(service, settings, 20);
    expect(slowPeriod / service.cyclePeriod()).toBeCloseTo(2, 9);
  });

  it('lands the closing sample back on the starting pose', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 20);

    const frames = service.mechanisms[0].joints;
    const first = frames[0];
    const last = frames[frames.length - 1];

    last.forEach((joint, index) => {
      expect(Math.abs(joint.x - first[index].x)).toBeLessThan(0.005);
      expect(Math.abs(joint.y - first[index].y)).toBeLessThan(0.005);
    });
  });
});

describe('Seeking across an input-speed change', () => {
  it('holds simulation time rather than the sample index', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);

    // A quarter turn in, 1.5 s into the 6 s cycle.
    service.animate(90, false);
    expect(service.timeAtStep(service.mechanismTimeStep)).toBeCloseTo(1.5, 6);

    setInputSpeed(service, settings, 20);

    expect(service.timeAtStep(service.mechanismTimeStep)).toBeCloseTo(1.5, 6);
    // Twice the speed turns the crank twice as far in the same 1.5 s.
    expect(crankDegreesAt(service.mechanismTimeStep)).toBe(180);
  });

  it('moves the mechanism when the time it is held at implies a new pose', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);
    service.animate(90, false);
    const beforeX = service.joints[1].x;
    const beforeY = service.joints[1].y;

    setInputSpeed(service, settings, 20);

    expect(
      Math.hypot(service.joints[1].x - beforeX, service.joints[1].y - beforeY)
    ).toBeGreaterThan(0.01);
  });

  it('wraps a held time that no longer fits inside the shorter cycle', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);

    // 5 s into the 6 s cycle; at 20 RPM the cycle is only 3 s long.
    service.animate(300, false);
    expect(service.timeAtStep(service.mechanismTimeStep)).toBeCloseTo(5, 6);

    setInputSpeed(service, settings, 20);

    expect(service.timeAtStep(service.mechanismTimeStep)).toBeCloseTo(2, 6);
  });
});

describe('Time zero stability', () => {
  /** The pose the mechanism treats as t = 0, as stored in the solved samples. */
  const startPose = (service: MechanismService) =>
    service.mechanisms[0].joints[0].map((j) => `${j.x.toFixed(9)},${j.y.toFixed(9)}`).join('|');

  it('keeps time zero fixed when a rebuild happens at a non-zero time', () => {
    const { service } = createLoadedService();
    const original = startPose(service);

    service.animate(90);
    expect(service.mechanismTimeStep).toBe(90);

    // Opening a panel rebuilds the mechanism without any edit behind it.
    service.updateMechanism();

    expect(startPose(service)).toBe(original);
  });

  it('does not drift over repeated rebuilds at a non-zero time', () => {
    const { service } = createLoadedService();
    const original = startPose(service);

    service.animate(45);
    for (let rebuild = 0; rebuild < 5; rebuild++) {
      service.updateMechanism();
    }

    expect(startPose(service)).toBe(original);
  });

  it('holds the displayed time across a rebuild', () => {
    const { service } = createLoadedService();

    service.animate(120);
    const heldTime = service.timeAtStep(service.mechanismTimeStep);
    service.updateMechanism();

    // The user stays where they were; only the start pose is protected.
    expect(service.timeAtStep(service.mechanismTimeStep)).toBeCloseTo(heldTime, 9);
    expect(service.mechanismTimeStep).toBe(120);
  });

  it('still takes edits made at time zero', () => {
    const { service } = createLoadedService();

    // Editing is only permitted at t = 0, and must not be rewound away.
    service.animate(0);
    const moved = service.joints[0];
    moved.x += 0.5;
    service.updateMechanism();

    expect(service.mechanisms[0].joints[0][0].x).toBeCloseTo(moved.x, 9);
  });
});

describe('Real-time playback', () => {
  let clockMs = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    clockMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  });

  afterEach(() => {
    AnimationBarComponent.animate = false;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Play for `wallSeconds` of real time and report the crank angle reached. */
  function playFor(service: MechanismService, wallSeconds: number): number {
    AnimationBarComponent.animate = true;
    service.animate(0, true);
    const frames = Math.round((wallSeconds * 1000) / 16);
    for (let frame = 0; frame < frames; frame++) {
      clockMs += 16;
      vi.advanceTimersByTime(16);
    }
    AnimationBarComponent.animate = false;
    return crankDegreesAt(service.mechanismTimeStep);
  }

  it('turns the crank twice as far per real second at twice the input speed', () => {
    const slow = createLoadedService();
    setInputSpeed(slow.service, slow.settings, 10);
    const slowDegrees = playFor(slow.service, 1);

    const fast = createLoadedService();
    setInputSpeed(fast.service, fast.settings, 20);
    const fastDegrees = playFor(fast.service, 1);

    // 10 RPM sweeps 60 deg/s, 20 RPM sweeps 120 deg/s. One frame of slack for the
    // first frame, which has no previous frame to measure elapsed time against.
    expect(slowDegrees).toBeGreaterThan(57);
    expect(slowDegrees).toBeLessThanOrEqual(60);
    expect(fastDegrees / slowDegrees).toBeCloseTo(2, 1);
  });

  it('completes one revolution in 60/RPM seconds of real time', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 30); // 2 s per revolution

    // Just short of a full cycle, so the wrap does not hide an overshoot.
    const degrees = playFor(service, 1);

    expect(degrees).toBeGreaterThan(175);
    expect(degrees).toBeLessThanOrEqual(180);
  });

  it('scales playback with the animation speed multiplier', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);

    service.animationSpeedMultiplier = 1;
    const single = playFor(service, 1);
    service.animationSpeedMultiplier = 2;
    const double = playFor(service, 1);

    expect(double / single).toBeCloseTo(2, 1);
  });

  it('draws poses between samples instead of snapping to them', () => {
    const { service, settings } = createLoadedService();
    // 1 RPM: 60 s per revolution, one sample every 0.167 s. Without interpolation
    // a 16 ms frame would leave the mechanism on the same sample ten frames running.
    setInputSpeed(service, settings, 1);

    AnimationBarComponent.animate = true;
    service.animate(0, true);

    const seen = new Set<string>();
    for (let frame = 0; frame < 8; frame++) {
      clockMs += 16;
      vi.advanceTimersByTime(16);
      seen.add(service.joints.map((j) => `${j.x.toFixed(6)},${j.y.toFixed(6)}`).join('|'));
    }
    AnimationBarComponent.animate = false;

    // Every frame is a distinct pose even though they all sit on one sample.
    expect(service.mechanismTimeStep).toBe(0);
    expect(seen.size).toBe(8);
  });

  it('keeps time zero fixed when a rebuild lands mid-blend at sample 0', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 1); // one sample spans 167 ms
    const startPose = () =>
      service.mechanisms[0].joints[0].map((j) => `${j.x.toFixed(9)},${j.y.toFixed(9)}`).join('|');
    const original = startPose();

    AnimationBarComponent.animate = true;
    service.animate(0, true);
    for (let frame = 0; frame < 4; frame++) {
      clockMs += 16;
      vi.advanceTimersByTime(16);
    }
    // The step is still 0, but the drawn joints are blended past the start pose —
    // the one displaced pose the step alone cannot reveal.
    expect(service.mechanismTimeStep).toBe(0);

    service.updateMechanism();
    AnimationBarComponent.animate = false;

    expect(startPose()).toBe(original);
  });

  it('keeps interpolated joints on their link outlines', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 1);

    AnimationBarComponent.animate = true;
    service.animate(0, true);
    clockMs += 80; // land mid-sample, where the blend is largest
    vi.advanceTimersByTime(16);
    AnimationBarComponent.animate = false;

    // A rigid link's joint separation must survive interpolation, otherwise the
    // outline and the joints would drift apart on screen.
    service.links.forEach((link) => {
      if (link.joints.length < 2) return;
      const [a, b] = link.joints;
      const solved = service.mechanisms[0].links[0].find((candidate) => candidate.id === link.id);
      if (!solved || solved.joints.length < 2) return;
      const restLength = Math.hypot(
        solved.joints[1].x - solved.joints[0].x,
        solved.joints[1].y - solved.joints[0].y
      );
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(restLength, 3);
    });
  });

  it('reports the drawn time, not the sample it blended from', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 1);

    AnimationBarComponent.animate = true;
    service.animate(0, true);
    // The first frame only anchors the clock, so four frames advance 48 ms.
    for (let frame = 0; frame < 4; frame++) {
      clockMs += 16;
      vi.advanceTimersByTime(16);
    }

    const drawn = service.currentTimeSeconds();
    AnimationBarComponent.animate = false;

    // 48 ms in, between sample 0 (t=0) and sample 1 (t=0.167 s).
    expect(drawn).toBeCloseTo(0.048, 3);
    expect(drawn).toBeGreaterThan(service.timeAtStep(service.mechanismTimeStep));
  });

  it('stops scheduling frames once playback is paused', () => {
    const { service, settings } = createLoadedService();
    setInputSpeed(service, settings, 10);

    AnimationBarComponent.animate = true;
    service.animate(0, true);
    clockMs += 16;
    vi.advanceTimersByTime(16);

    service.animate(service.mechanismTimeStep, false);
    const pausedAt = service.mechanismTimeStep;
    clockMs += 320;
    vi.advanceTimersByTime(320);

    expect(service.mechanismTimeStep).toBe(pausedAt);
  });
});
