import { MechanismFixture, BuiltMechanism, buildMechanism } from './fixture';
import {
  fourBarDrivenAtFixture,
  sliderCrankTracerFixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from './fixtures';
import {
  cylinderBoomFixture,
  cylinderSkinFixture,
  gripperFixture,
  pinchingGripperFixture,
  ellipticalCrankFixture,
  ellipticalTrammelFixture,
  invertedSliderCrankFixture,
  loadedInvertedSliderCrankFixture,
  scotchYokeFixture,
  scotchYokeGuidedAtFarEndFixture,
  scotchYokeWithTracerFixture,
  motionGenGripperFixture,
  pivotingGripperFixture,
  chebyshevStraightLineFixture,
  radialEngineFixture,
  windshieldWiperFixture,
  slottedCouplerFixture,
  squareRodSliderCrankFixture,
  WHITWORTH_CRANK,
  WHITWORTH_OFFSET,
} from './slot-fixtures';
import {
  excavatorBucketFixture,
  jansenLegFixture,
  scissorLiftFixture,
  shaperQuickReturnFixture,
  togglePressFixture,
} from './library-fixtures';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { ColorService } from '../../app/services/color.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { Link, RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * Every mechanism the verification suite asserts on, as something a reviewer
 * can open.
 *
 * A fixture is a TypeScript object; the app only speaks URLs. Encoding one into
 * the other means anybody reviewing a solver change can load the exact linkage a
 * failing test is about, instead of reading coordinates out of a spec file and
 * rebuilding it by hand.
 */
/**
 * The scale a freshly opened app uses; pinned so payloads do not drift. In
 * internal units: the encoder divides by MODEL_SCALE, so the URL stores 1.
 */
const DEFAULT_OBJECT_SCALE = 1 * MODEL_SCALE;

/**
 * Lift a fixture-built mechanism from user units into the internal model
 * world (render-scale.ts).
 *
 * Fixtures stay in the user's units because the solver specs assert MATLAB
 * numbers against them directly. Encoding, though, happens at the codec
 * boundary, where coordinates are internal and divide by MODEL_SCALE on the
 * way out — so the copy built for a URL scales up first, and the published
 * payload carries exactly the numbers it always has.
 */
function scaleBuiltToModelUnits(built: BuiltMechanism): void {
  built.joints.forEach((joint) => {
    joint.x *= MODEL_SCALE;
    joint.y *= MODEL_SCALE;
  });
  const scaleLink = (link: Link): void => {
    if (!(link instanceof RealLink)) return;
    link.CoM.x *= MODEL_SCALE;
    link.CoM.y *= MODEL_SCALE;
    link.subset.forEach(scaleLink);
  };
  built.links.forEach(scaleLink);
  built.forces.forEach((force) => {
    force.startCoord.x *= MODEL_SCALE;
    force.startCoord.y *= MODEL_SCALE;
    force.endCoord.x *= MODEL_SCALE;
    force.endCoord.y *= MODEL_SCALE;
  });
}

export interface GalleryEntry {
  name: string;
  /** What this mechanism is for — one line, as it appears in the published table. */
  purpose: string;
  /** Where it is asserted, so the link and the assertions stay findable together. */
  spec: string;
  /** True when the mechanism uses a slot cut into a moving link. */
  floatingSlot: boolean;
  /** True when a rider is welded rigid to its block — a Slide (§2.1). */
  slide?: boolean;
  /**
   * How large the app should draw pins and bar widths, in model units.
   *
   * Omitted means the default a fresh app uses, which suits the mechanisms
   * built at single-digit sizes — nearly all of them. Set it where the
   * mechanism is built at a much larger scale, or it draws as hairlines.
   */
  objectScale?: number;
  fixture: MechanismFixture;
}

export const FIXTURE_GALLERY: GalleryEntry[] = [
  {
    name: 'Hydraulic cylinder',
    purpose: 'Cylinder skin (§2.7): a rod welded to a block sliding in a barrel, all on one line',
    spec: 'cylinder.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: cylinderSkinFixture(),
  },
  {
    name: 'Cylinder-driven boom',
    purpose: 'Gate 5: the cylinder is the drive, and the boom follows the law of cosines',
    spec: 'driven-cylinder.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: cylinderBoomFixture(),
  },
  {
    name: 'Cylinder-driven gripper',
    purpose: '§2.7a: no chain of dyads solves this — the plate and both arms settle together',
    spec: 'gripper.spec.ts, anchored-bar-mobility.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: gripperFixture(),
  },
  {
    name: 'Gripper the cylinder closes',
    purpose: 'Counter-rotating jaw levers: extending the cylinder pinches them shut',
    spec: 'pinching-gripper.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: pinchingGripperFixture(),
  },
  {
    name: 'Backhoe bucket',
    purpose: 'A driven ram feeding an ordinary four-bar: bell crank, link, and the bucket curls',
    spec: 'excavator-bucket.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: excavatorBucketFixture(),
  },
  {
    name: 'Toggle press',
    purpose:
      'A ram closing a toggle onto a block: travel traded for force as it approaches straight',
    spec: 'toggle-press.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: togglePressFixture(),
  },
  {
    name: 'Scissor lift',
    purpose:
      'Ram, supporting block and a slot in the moving platform — all three parts, three jobs',
    spec: 'scissor-lift.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scissorLiftFixture(),
  },
  {
    name: "Shaper's quick-return drive",
    purpose: 'A floating slot handing off to a grounded one: the ram cuts slow and returns fast',
    spec: 'shaper-quick-return.spec.ts',
    floatingSlot: true,
    slide: false,
    fixture: shaperQuickReturnFixture(),
  },
  {
    name: 'Slider-crank whose rod comes square to the guide',
    purpose: 'The slot tangent to the rod circle: the two roots meet and trade places',
    spec: 'square-rod-tangency.spec.ts',
    floatingSlot: false,
    fixture: squareRodSliderCrankFixture(),
  },
  {
    name: 'MotionGen gripper',
    purpose:
      "A second engine's mechanism, rebuilt: over-constrained, so PMKS+ reports DOF 0 and refuses it",
    spec: 'motiongen-gripper.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: motionGenGripperFixture(),
  },
  {
    name: 'Gripper with the redundancy removed',
    purpose: 'The same gripper, jaws pivoting instead of railed: DOF 1, and it runs',
    spec: 'pivoting-gripper.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: pivotingGripperFixture(),
  },
  {
    name: 'Radial engine, three cylinders',
    purpose: 'Three sliders on one crank pin; piston stroke is exactly twice the throw',
    spec: 'radial-engine.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: radialEngineFixture(),
  },
  {
    name: 'Chebyshev straight-line linkage',
    purpose: 'Approximate straight-line generation: the coupler midpoint runs flat along the top',
    spec: 'chebyshev-straight-line.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: chebyshevStraightLineFixture(),
  },
  {
    name: 'Windshield wiper',
    purpose: 'Crank-rocker: continuous rotation into a bounded sweep, against the closed form',
    spec: 'windshield-wiper.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: windshieldWiperFixture(),
  },
  {
    name: 'Jansen leg',
    purpose: "One leg of a Strandbeest: eight bars on Jansen's holy numbers, and the foot walks",
    spec: 'jansen-leg.spec.ts',
    floatingSlot: false,
    slide: false,
    // Jansen's holy numbers run to 65 units where the rest of the gallery is
    // single-digit, and pin radius and bar width are absolute rather than
    // relative to the linkage. At the default the leg draws as hairlines with
    // no visible pins. Scaling the drawing rather than the fixture keeps the
    // published numbers exactly as Jansen quotes them.
    objectScale: 14 * MODEL_SCALE,
    fixture: jansenLegFixture(),
  },
  {
    name: 'Elliptical crank',
    purpose: 'A six-bar no dyad reaches: the coupler and its guided end have to be solved together',
    spec: 'elliptical-crank.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: ellipticalCrankFixture(),
  },
  {
    name: 'Inverted slider-crank',
    purpose: 'Inverse slot direction: position, velocity and acceleration against closed form',
    spec: 'inverted-slider-crank.spec.ts, slot-kinematics.spec.ts',
    floatingSlot: true,
    fixture: invertedSliderCrankFixture(),
  },
  {
    name: 'Whitworth proportions',
    purpose: 'Crank longer than the ground offset, so the lever turns instead of rocking',
    spec: 'slot-kinematics.spec.ts',
    floatingSlot: true,
    fixture: invertedSliderCrankFixture(WHITWORTH_OFFSET, WHITWORTH_CRANK),
  },
  {
    name: 'Inverted slider-crank with a load',
    purpose: 'Reactions equal and opposite across the slot, and normal to it',
    spec: 'slot-forces.spec.ts',
    floatingSlot: true,
    fixture: loadedInvertedSliderCrankFixture(),
  },
  {
    name: 'Four-bar with a slotted coupler',
    purpose: 'Forward slot direction: the only case where the carrier is solved first',
    spec: 'slotted-coupler.spec.ts',
    floatingSlot: true,
    fixture: slottedCouplerFixture(),
  },
  {
    name: 'Scotch yoke',
    purpose: 'Slide: a welded assembly translating on its guide, x = r cos theta',
    spec: 'scotch-yoke.spec.ts, scotch-yoke-kinematics.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scotchYokeFixture(),
  },
  {
    name: 'Scotch yoke with a tracer',
    purpose: 'The slot measured from a joint on it, not from whichever member came first',
    spec: 'scotch-yoke.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scotchYokeWithTracerFixture(),
  },
  {
    name: 'Scotch yoke guided at the far end',
    purpose: 'Same motion, but the loop reaches the welded rider along a link edge',
    spec: 'scotch-yoke-kinematics.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scotchYokeGuidedAtFarEndFixture(),
  },
  {
    name: 'Elliptical trammel',
    purpose: 'Mobility for a linkage held only by its guides — no pin touches ground',
    spec: 'slot-mobility.spec.ts',
    floatingSlot: false,
    fixture: ellipticalTrammelFixture(),
  },
  {
    name: 'Four-bar driven at its coupler-rocker pin',
    purpose: 'Gate 6: a floating pin as the input \u2014 same coupler curve as driving the crank',
    spec: 'driven-floating-pin.spec.ts',
    floatingSlot: false,
    fixture: fourBarDrivenAtFixture('C'),
  },
  {
    name: 'TeachingLab four-bar',
    purpose: 'MATLAB-verified positions, velocities, accelerations and forces',
    spec: 'teaching-lab-four-bar.spec.ts',
    floatingSlot: false,
    fixture: teachingLabFourBarFixture(),
  },
  {
    name: 'TeachingLab slider-crank',
    purpose: 'The grounded-guide path this phase had to leave byte-identical',
    spec: 'teaching-lab-slider-crank.spec.ts',
    floatingSlot: false,
    fixture: teachingLabSliderCrankFixture(),
  },
  {
    name: 'Slider-crank with a tracer',
    purpose: 'A tracer point on the coupler of a grounded slider',
    spec: 'slider-crank-tracer.spec.ts',
    floatingSlot: false,
    fixture: sliderCrankTracerFixture(),
  },
  {
    name: 'Stephenson III',
    purpose: 'Six-bar, MATLAB-verified',
    spec: 'stephenson-iii-ex2.spec.ts',
    floatingSlot: false,
    fixture: stephensonIiiEx2Fixture(),
  },
  {
    name: 'Watt I',
    purpose: 'Six-bar, MATLAB-verified',
    spec: 'watt-i.spec.ts',
    floatingSlot: false,
    fixture: wattIFixture(),
  },
];

/**
 * Encode a fixture into the query string the app decodes on load.
 *
 * Two pieces of global state are pinned first and put back afterwards: the link
 * colour cursor, and the object scale. Both are process-wide, so without this a
 * payload depends on what every earlier spec happened to do — the table would
 * differ between a full suite run and a single-file one, and the drift check
 * would fail for reasons with nothing to do with the mechanisms.
 *
 * `objectScale` is how large the app draws pins and bar widths, in model units;
 * it is a display setting rather than geometry, and the default is what a fresh
 * app uses. A mechanism whose bars are tens of units long needs a larger one or
 * it renders as hairlines — see the Jansen leg in template-fixtures.ts.
 */
export function fixturePayload(
  fixture: MechanismFixture,
  objectScale: number = DEFAULT_OBJECT_SCALE
): string {
  const previousColors = ColorService.instance;
  const previousScale = SettingsService.objectScale;
  new ColorService();
  SettingsService._objectScale.next(objectScale);
  try {
    const built = buildMechanism(fixture);
    scaleBuiltToModelUnits(built);
    return new UrlGenerationService(
      {
        joints: built.joints,
        links: built.links,
        forces: built.forces,
        mechanismTimeStep: 0,
      } as unknown as MechanismService,
      new SettingsService(),
      new ActiveObjService()
    ).generateUrlQuery();
  } finally {
    ColorService.instance = previousColors;
    SettingsService._objectScale.next(previousScale);
  }
}

/**
 * The published table.
 *
 * `baseUrl` is a parameter because a floating-slot payload only decodes on a
 * build that has Phase 2 in it — pointed at a release that predates this work,
 * those links fail validation rather than opening anything.
 */
export function galleryMarkdown(baseUrl: string): string {
  const rows = FIXTURE_GALLERY.map((entry) => {
    const link = `${baseUrl}/?${fixturePayload(entry.fixture, entry.objectScale)}`;
    const slot = entry.floatingSlot ? 'yes' : '—';
    const slide = entry.slide ? 'yes' : '—';
    return `| [${entry.name}](${link}) | ${entry.purpose} | ${slot} | ${slide} | \`${entry.spec}\` |`;
  });
  return [
    '<!-- Generated by src/tests/verification/fixture-gallery.spec.ts. Run `npm run fixture-urls` to refresh. -->',
    '',
    '# Verification mechanisms, as links',
    '',
    'Every mechanism the verification suite asserts on, encoded into a URL so a',
    'reviewer can open the exact linkage a test is about instead of rebuilding it',
    'from coordinates in a spec file.',
    '',
    `Links point at \`${baseUrl}\`. **A mechanism marked "floating slot" only decodes on a`,
    'build that includes Phase 2** — on an older release the three extra URL tokens',
    'are refused rather than silently ignored, which is deliberate (§2.4a). A',
    'mechanism marked "Slide" decodes anywhere, because its weld is an existing',
    'flag — but it only *solves* on a build that includes Phase 3. For a pull',
    'request, regenerate against its deploy preview:',
    '',
    '```bash',
    'PMKS_FIXTURE_BASE_URL=https://deploy-preview-227--pmksprod.netlify.app npm run fixture-urls',
    '```',
    '',
    '| Mechanism | What it is for | Floating slot | Slide | Asserted in |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
