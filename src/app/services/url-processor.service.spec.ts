import { TestBed } from '@angular/core/testing';
import { AppModule } from '../app.module';
import { MechanismService } from './mechanism.service';
import { UrlProcessorService } from './url-processor.service';
import { AnimationBarComponent } from '../component/animation-bar/animation-bar.component';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';

/**
 * Opening a linkage over one that is already running.
 *
 * The rebuild that follows a load puts the editable joints back on sample 0
 * first, because those joints are both what the grid draws and what the rebuild
 * reads as t = 0. When the load is a *different* linkage, that pairs the joints
 * that have just arrived against the solved samples of the ones they replaced —
 * matched up by array index, with nothing checking that the two describe the
 * same mechanism. A short linkage opened over a long one came up wearing the
 * old one's pose; a long one opened over a short one ran off the end of the
 * samples and drew at NaN.
 */
describe('opening a linkage while another is animating', () => {
  let mechanism: MechanismService;
  let urls: UrlProcessorService;

  // A four-bar has fewer joints than a Jansen leg, so loading the second over
  // the first is the case with no sample left to pair against — the one that
  // produced NaN rather than merely the wrong picture.
  const SHORT = TEMPLATE_LINKAGES['4-Bar'];
  const LONG = TEMPLATE_LINKAGES['Jansen_Leg'];

  const load = (payload: string) => urls.updateFromURL(payload, false, true, false);
  const pose = () => mechanism.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    mechanism = TestBed.inject(MechanismService);
    urls = TestBed.inject(UrlProcessorService);
  });

  // A static, so it outlives the TestBed and a spec that leaves it playing
  // fails whatever runs next.
  afterEach(() => {
    AnimationBarComponent.animate = false;
    mechanism.animate(0, false);
  });

  it('opens the new linkage at its own start pose, not the old one at its', () => {
    load(LONG);
    const rested = pose();
    expect(rested.length).toBeGreaterThan(0);

    load(SHORT);
    // Well away from the start pose, and playing: only paused-at-zero counts as
    // resting, because playback draws blended past its own sample.
    mechanism.animate(40, true);
    expect(mechanism.joints.some((joint) => joint.x !== 0)).toBe(true);

    load(LONG);
    expect(pose()).toEqual(rested);
  });

  it('never leaves a joint at NaN when the new linkage is the longer one', () => {
    load(SHORT);
    mechanism.animate(40, true);
    load(LONG);

    for (const joint of mechanism.joints) {
      expect(Number.isFinite(joint.x), `${joint.id}.x`).toBe(true);
      expect(Number.isFinite(joint.y), `${joint.id}.y`).toBe(true);
    }
  });

  it('stops playback rather than running the new linkage on the old clock', () => {
    load(SHORT);
    mechanism.animate(40, true);
    expect(AnimationBarComponent.animate).toBe(true);

    load(LONG);
    expect(AnimationBarComponent.animate).toBe(false);
    expect(mechanism.mechanismTimeStep).toBe(0);
  });
});
