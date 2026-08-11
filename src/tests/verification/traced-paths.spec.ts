// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app/app.module';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { AnimationBarComponent } from '../../app/component/animation-bar/animation-bar.component';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';

/**
 * When a joint's traced path is drawn, and when it is not.
 *
 * The rule is about the mechanism, not about the caller: a path is hidden only
 * while the mechanism is *parked* at its start pose, because nothing has been
 * traced yet and a path there would claim motion that has not happened. Once it
 * is playing, the trace stays drawn — including on the frame the cycle wraps
 * back through the start.
 */
describe('the traced path of a joint', () => {
  let mechanism: MechanismService;
  const wasAnimating = AnimationBarComponent.animate;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    mechanism = TestBed.inject(MechanismService);
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(cylinderBoomFixture()),
      false,
      true,
      false
    );
  });

  afterEach(() => {
    AnimationBarComponent.animate = wasAnimating;
  });

  it('is drawn while the mechanism is parked at its start pose', () => {
    // It used to be hidden here, on the grounds that nothing had been traced
    // yet. That belonged to a time when every joint traced by default and the
    // path was a by-product; a path is asked for a joint at a time now, and the
    // whole cycle is precomputed the moment the mechanism is valid — so hiding
    // it until the user presses play hides the thing they just switched on.
    mechanism.animate(0, false);
    expect(mechanism.showPathHolder).toBe(true);
  });

  it('stays drawn through the wrap, which is where it used to blink out', () => {
    // The playback loop calls `animate(step)` with no animation state: omitting
    // it means "leave the play/stop state alone", and it was read as "stopped".
    // So every frame the loop landed on step 0 — once per cycle, and at the far
    // end of a reversing machine's out-and-back — hid every trace on the canvas.
    mechanism.animate(0, true);
    expect(mechanism.showPathHolder).toBe(true);

    mechanism.animate(5);
    expect(mechanism.showPathHolder).toBe(true);

    mechanism.animate(0);
    expect(mechanism.showPathHolder, 'the wrap back through the start').toBe(true);
  });

  it('answers with no path at all rather than throwing, when there is none yet', () => {
    // This runs from a template binding, so a throw does not lose one path — it
    // aborts the change-detection pass and the whole frame goes unrendered.
    const joint = mechanism.joints[0];
    mechanism.mechanisms = [];
    expect(() => mechanism.getJointPath(joint)).not.toThrow();
    expect(mechanism.getJointPath(joint)).toBe('');
  });
});
