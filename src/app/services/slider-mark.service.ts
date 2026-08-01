import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import {
  blockPath,
  MARK,
  orientedCapsulePath,
  railGeometry,
  riderCapsulePath,
  Segment,
  slotHalfLength,
  straightArrowPaths,
} from '../model/joint-marks';
import { weldPlateFillets } from '../model/weld-plate';

/**
 * The rider's own paint, redrawn over the black block so a Slide reads as one
 * body with it. Visual only: `fill` is the link's colour, never a function of
 * it, so a random palette can never break the cue (§2.8 rule 4).
 */
export interface WeldPlate {
  fill: string;
  riders: string[];
  block: string;
  fillets: string[];
}

/** One slider assembly, ready to draw, in the slot's own frame. */
export interface SliderMark {
  id: string;
  /**
   * The pin the block sits on. The block is a far bigger target than the joint
   * marker at its centre, so the canvas lets a drag start on it and hands the
   * gesture to the pin -- the two are coincident, so it is the same grab.
   */
  pin: Joint;
  x: number;
  y: number;
  /** Slot direction in degrees, already corrected for the canvas y-flip. */
  rotation: number;
  block: string;
  welded: boolean;
  driven: boolean;
  plate?: WeldPlate;
  arrows: { line: Segment; head: string }[];
  rails?: { rails: Segment[]; ticks: Segment[] };
  /** A slider with a block but no carrier and no ground: invalid, drawn red. */
  dangling: boolean;
}

/**
 * A channel window. `path` is in the carrier's own drawing frame so it can be
 * appended to the carrier's path data and subtracted by its even-odd fill --
 * which also makes the carrier's existing stroke trace the new edge in the
 * carrier's own colour, exactly as §2.8 rule 7 asks, with nothing added.
 */
export interface Channel {
  carrierId: string;
  path: string;
}

/**
 * Turns the mechanism into the marks of §2.8.
 *
 * Everything is emitted in the slot's local frame with the joint at the origin
 * and the slot along +x, so the template applies one transform per assembly and
 * the CSS transitions inside it compose against the slot rather than against
 * the world. It also means no path here contains a rotated coordinate, which is
 * what keeps the arithmetic checkable.
 */
@Injectable({ providedIn: 'root' })
export class SliderMarkService {
  /**
   * The transform that puts a group into the slot's frame, given that the
   * holder above it is y-flipped. The inner flip cancels the holder's, and the
   * negated angle compensates for the handedness the flip reverses -- so local
   * +x runs along the slot and local +y along its normal, in model space.
   */
  frame(mark: SliderMark): string {
    return `translate(${mark.x} ${mark.y}) rotate(${mark.rotation}) scale(1 -1)`;
  }

  /**
   * `travel` is how far each slider's block runs across the solved timesteps,
   * keyed by joint id. Absent entries fall back to the drawn rail length.
   */
  marks(joints: Joint[], r: number, travel?: Map<string, number>): SliderMark[] {
    return joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
      .map((slider) => this.markFor(slider, r, travel?.get(slider.id) ?? 0))
      .filter((mark): mark is SliderMark => mark !== undefined);
  }

  channels(joints: Joint[], r: number): Channel[] {
    const found: Channel[] = [];
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) continue;
      if (!joint.isSlotWellFormed) continue;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      const carrier = joint.carrier!;
      const separation = Math.hypot(b.x - a.x, b.y - a.y);
      found.push({
        carrierId: carrier.id,
        path: orientedCapsulePath(
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          joint.slotAngle,
          slotHalfLength(r, separation),
          MARK.channelHalfWidth * r
        ),
      });
    }
    return found;
  }

  private markFor(slider: PrisJoint, r: number, travel: number): SliderMark | undefined {
    const block = slider.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    if (!block) return undefined;
    const pin = block.joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && !(joint instanceof PrisJoint)
    );
    if (!pin) return undefined;

    const angle = slider.slotAngle;
    const welded = pin.isWelded;
    const driven = slider.input || pin.input;
    const riders = pin.links.filter((link): link is RealLink => link instanceof RealLink);

    return {
      id: slider.id,
      pin,
      // The block is drawn at its pin: the two are coincident by construction,
      // and the sliding joint tracks the pin rather than the other way round.
      x: pin.x,
      y: pin.y,
      rotation: -toDegrees(angle),
      block: blockPath(r),
      welded,
      driven,
      plate: welded ? this.plateFor(pin, riders, angle, r) : undefined,
      arrows: driven ? straightArrowPaths(r) : [],
      rails: slider.ground ? railGeometry(r, this.railHalfLength(travel, r)) : undefined,
      dangling: !slider.ground && !slider.isFloating,
    };
  }

  private plateFor(
    pin: RealJoint,
    riders: RealLink[],
    slotAngle: number,
    r: number
  ): WeldPlate | undefined {
    if (riders.length === 0) return undefined;
    const bar = MARK.barHalf * r;
    const paths: string[] = [];
    const fillets: string[] = [];
    for (const rider of riders) {
      const relative = riderDirection(pin, rider) - slotAngle;
      if (!Number.isFinite(relative)) continue;
      const reach = riderReach(pin, rider);
      paths.push(riderCapsulePath(reach, bar, relative));
      fillets.push(...weldPlateFillets(r, relative));
    }
    return {
      fill: riders[0].fill ?? '#000000',
      riders: paths,
      block: blockPath(r),
      fillets,
    };
  }

  /**
   * How long to draw a grounded guide.
   *
   * A fixed 19.2R, as the marks are drawn. Travel would be the better answer --
   * a guide that spans where its block actually goes stops looking like a
   * fixed-length part -- but travel is a property of the solved timesteps, not
   * of the frame being drawn, and the editable mechanism at t = 0 does not have
   * them when the linkage is invalid. `travelHalfLength` takes that number when
   * a caller has it.
   */
  private railHalfLength(travel: number, r: number): number {
    return Math.max(MARK.railHalfLengthMin * r, travel + MARK.blockAlongHalf * r);
  }
}

/** Where a rider points, away from the joint it is welded at. */
function riderDirection(pin: RealJoint, rider: RealLink): number {
  const others = rider.joints.filter((joint) => joint.id !== pin.id);
  if (others.length === 0) return NaN;
  const x = others.reduce((sum, joint) => sum + joint.x, 0) / others.length;
  const y = others.reduce((sum, joint) => sum + joint.y, 0) / others.length;
  return Math.atan2(y - pin.y, x - pin.x);
}

/** How far a rider reaches, so its plate ends where the link does. */
function riderReach(pin: RealJoint, rider: RealLink): number {
  const others = rider.joints.filter((joint) => joint.id !== pin.id);
  return others.reduce(
    (far, joint) => Math.max(far, Math.hypot(joint.x - pin.x, joint.y - pin.y)),
    0
  );
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
