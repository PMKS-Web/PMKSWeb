// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app/app.module';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { RealJoint } from '../../app/model/joint';

/**
 * The two rules that keep a cylinder out of a welded compound.
 *
 * `cylinder.ts` carries machinery for a barrel or rod absorbed into one —
 * `twoJointLeaf` exists for nothing else — and the app cannot currently produce
 * that state. Which is just as well, because the path is not finished:
 * `applyCylinderPose` moves the cylinder's own five joints and no others, so the
 * rest of a compound would be left behind and the body recomputed as if it had
 * deformed.
 *
 * So these are pinned. If either rule is relaxed, that is a deliberate decision
 * to finish the compound path, and this file is where it says so.
 */

/** A ram, plus an elbow of two links whose middle joint is weldable. */
function ramAndElbow(): MechanismFixture {
  const mount = { x: -8, y: 0 };
  const eye = { x: 2, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'A', ...mount, ground: true },
      { id: 'B', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'D', ...eye },
      { id: 'W', x: 6, y: 3 },
      { id: 'X', x: 10, y: 3 },
      { id: 'Y', x: 6, y: 8 },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'WX' }, { joints: 'WY' }],
    sliders: [{ at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

describe('keeping a cylinder out of a welded compound', () => {
  let mechanism: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    mechanism = TestBed.inject(MechanismService);
    grid = TestBed.inject(GridUtilsService);
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(ramAndElbow()),
      false,
      true,
      false
    );
  });

  it('offers Weld on an ordinary joint and not on a cylinder mount', () => {
    const cylinder = mechanism.sealedStructures()[0];
    expect(cylinder, 'the fixture really is a cylinder').toBeDefined();
    const elbow = mechanism.joints.find((joint) => joint.id === 'W')! as RealJoint;
    const mount = mechanism.joints.find((joint) => joint.id === cylinder.rodFar.id)! as RealJoint;

    expect(grid.canToggleWeld(elbow), 'an ordinary joint of two links').toBe(true);
    expect(grid.canToggleWeld(mount), 'a cylinder mount').toBe(false);
  });

  it('refuses a merge that would carry a weld onto a mount', () => {
    // The route around the control: weld somewhere else, then drag that joint
    // onto the mount. A merge takes the weld with it.
    const cylinder = mechanism.sealedStructures()[0];
    const elbow = mechanism.joints.find((joint) => joint.id === 'W')! as RealJoint;
    const mount = mechanism.joints.find((joint) => joint.id === cylinder.rodFar.id)! as RealJoint;
    elbow.isWelded = true;

    expect(mechanism.mergeJoints(elbow, mount)).toBe('welded-mount');
    // And the refusal is total: the elbow is still there and the ram is intact.
    expect(mechanism.joints.map((joint) => joint.id)).toContain('W');
    expect(mechanism.sealedStructures().length).toBe(1);
  });
});
