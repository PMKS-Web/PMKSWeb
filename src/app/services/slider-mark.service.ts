import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import { Cylinder, cylinders, SkinPreference } from '../model/cylinder';
import {
  barrelCollapsedPath,
  blockPath,
  borePath,
  cylinderArrowPaths,
  cylinderMarkerPath,
  MARK,
  orientedCapsulePath,
  GuideBand,
  railGeometry,
  Segment,
  rodBodyPath,
  slotHalfLength,
  straightArrowPaths,
} from '../model/joint-marks';
import { buildCompoundPath, mergedChannels, transformRigidPath } from '../model/compound-link-path';

/**
 * The rider's own paint, redrawn over the black block so a Slide reads as one
 * body with it. Visual only: `fill` is the link's colour, never a function of
 * it, so a random palette can never break the cue (§2.8 rule 4).
 */
export interface WeldPlate {
  fill: string;
  /**
   * Rider and block fused into one outline, with the rider's channels cut back
   * out of it. Deliberately a single path: the rider used to be approximated by
   * a capsule, laid over the block, and patched at the two internal angles with
   * separate fillet wedges — four shapes at three different widths, every seam
   * between them visible through the plate's own alpha. A Boolean union has no
   * seams to show, and it draws the rider's real outline rather than a stand-in
   * for it, so a welded slider is the same body it was before it was welded.
   */
  path: string;
  /** The links this plate stands in for, so it can be selected like one. */
  links: Link[];
}

/** One link pinned to a block, ready to draw in the block's own frame. */
export interface RiderDraw {
  link: Link;
  fill: string;
  path: string;
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
  /** Links pinned to this block, redrawn above it. Empty when it is welded. */
  riders: RiderDraw[];
  arrows: { line: Segment; head: string; emphasised: boolean }[];
  /**
   * A grounded guide, carrying its own frame.
   *
   * Deliberately not drawn in the block's frame like everything else here: the
   * guide is fixed in the world and the block slides along it, so anchoring the
   * rails to the block makes the track travel with the thing that is supposed to
   * be moving through it. Only visible once the mechanism is playing.
   */
  rails?: {
    rails: Segment[];
    /** Where this guide passes through another one, drawn broken (§2.8). */
    dashedRails: Segment[];
    ticks: Segment[];
    x: number;
    y: number;
    rotation: number;
  };
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

/** One piston, drawn as the part rather than as a block in a channel (§2.7). */
export interface CylinderMark {
  id: string;
  pin: Joint;
  x: number;
  y: number;
  rotation: number;
  /** The links whose ordinary drawing this skin stands in for. */
  barrelId: string;
  rodId: string;
  /** The barrel's far joint, hidden while the skin is collapsed. */
  hiddenJointId: string;
  barrel: string;
  barrelFill: string;
  rod: string;
  rodFill: string;
  block: string;
  marker: string;
  driven: boolean;
  arrows: { line: Segment; head: string }[];
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
   * The transform that puts a group into the slot's frame: local +x along the
   * slot, local +y along its normal, origin on the joint.
   *
   * Plainly a rotation, and it has to be. It was written as `rotate(-theta)
   * scale(1 -1)` to "undo" the y-flip on the holder above -- but the holder's
   * flip is what turns model coordinates into screen ones, and everything
   * inside it is already in model coordinates. The extra flip therefore
   * composed to a *reflection*: local +x landed on model angle -theta and local
   * +y pointed the wrong way entirely.
   *
   * Every mark in the set is symmetric about both axes -- block, channel,
   * rails, arrows -- so a mirror was invisible in all of them. The weld plate
   * and its fillets are the only asymmetric geometry here, and they were drawn
   * pointing away from the rider they belong to: on a Scotch yoke the plate ran
   * three units below joint C when its rider runs three units above it.
   */
  frame(mark: { x: number; y: number; rotation: number }): string {
    return `translate(${mark.x} ${mark.y}) rotate(${mark.rotation})`;
  }

  /**
   * `travel` is how far each slider's block runs across the solved timesteps,
   * keyed by joint id. Absent entries fall back to the drawn rail length.
   */
  marks(
    joints: Joint[],
    r: number,
    guides?: Map<string, Guide>,
    driveForward = true
  ): SliderMark[] {
    // A link pinned to two different blocks would otherwise be drawn as a rider
    // by both of them, at double its own alpha where they overlap. The first
    // assembly to reach it draws it; the second leaves it alone.
    const claimed = new Set<string>();
    const bands = this.bands(joints, r, guides);
    return joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
      .map((slider) =>
        this.markFor(
          slider,
          r,
          guides?.get(slider.id),
          joints,
          claimed,
          driveForward,
          [...bands.entries()].filter(([id]) => id !== slider.id).map(([, band]) => band)
        )
      )
      .filter((mark): mark is SliderMark => mark !== undefined);
  }

  /**
   * How the user asked each assembly to be drawn, by weld-joint id.
   *
   * A view preference, deliberately held here rather than on the joint: it does
   * not serialize into the URL and does not enter the undo stack, so a shared
   * link always opens on Auto and nobody can undo their way into a different
   * picture of the same mechanism.
   */
  private readonly skinPreference = new Map<string, SkinPreference>();

  preferenceFor(id: string): SkinPreference {
    return this.skinPreference.get(id) ?? 'auto';
  }

  setPreference(id: string, preference: SkinPreference): void {
    this.skinPreference.set(id, preference);
  }

  /**
   * Forget every override, for when a different mechanism is loaded in place.
   * Joint letters are unique within a mechanism and meaningless across two.
   */
  clearPreferences(): void {
    this.skinPreference.clear();
  }

  /**
   * The cylinders to draw collapsed.
   *
   * `revealedId` is the assembly the user has selected: on Auto it expands, so
   * the block can be aimed at and its travel read — neither of which is
   * possible while it is moving, which is why playback suppresses the reveal
   * and keeps the skin on.
   */
  cylinderMarks(joints: Joint[], r: number, revealedId?: string, playing = false): CylinderMark[] {
    return cylinders(joints)
      .filter((found) => {
        const preference = this.preferenceFor(found.pin.id);
        if (preference === 'slotted') return false;
        if (preference === 'cylinder') return true;
        return playing || found.pin.id !== revealedId;
      })
      .map((found) => this.cylinderMark(found, r));
  }

  /**
   * The channels cut into `carrier`, expressed in the slot's own frame so they
   * can be appended to a path already drawn there.
   *
   * The frame is centred on the pin with +x along the slot, so a model point is
   * carried into it by subtracting the pin and turning by the slot angle.
   */
  private channelsInLocalFrame(
    carrier: Link,
    pin: RealJoint,
    slotAngle: number,
    r: number,
    joints: Joint[]
  ): string[] {
    const cos = Math.cos(slotAngle);
    const sin = Math.sin(slotAngle);
    const cuts: string[] = [];
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) continue;
      if (!joint.isSlotWellFormed || joint.carrier!.id !== carrier.id) continue;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      const midX = (a.x + b.x) / 2 - pin.x;
      const midY = (a.y + b.y) / 2 - pin.y;
      cuts.push(
        orientedCapsulePath(
          { x: midX * cos + midY * sin, y: -midX * sin + midY * cos },
          joint.slotAngle - slotAngle,
          slotHalfLength(r, Math.hypot(b.x - a.x, b.y - a.y)),
          MARK.channelHalfWidth * r
        )
      );
    }
    return cuts;
  }

  private cylinderMark(found: Cylinder, r: number): CylinderMark {
    const { pin, rodFar, barrelFar } = found;
    const angle = Math.atan2(rodFar.y - pin.y, rodFar.x - pin.x);
    const rodReach = Math.hypot(rodFar.x - pin.x, rodFar.y - pin.y);
    const barrelReach = -Math.hypot(barrelFar.x - pin.x, barrelFar.y - pin.y);
    const driven = found.slider.input || pin.input;
    return {
      id: pin.id,
      pin,
      x: pin.x,
      y: pin.y,
      // +x runs toward the rod, so the barrel is the negative side and the
      // geometry reads the same whichever way round the slot was declared.
      rotation: toDegrees(angle),
      barrelId: found.barrel.id,
      rodId: found.rod.id,
      hiddenJointId: barrelFar.id,
      barrel: barrelCollapsedPath(r, barrelReach),
      barrelFill: (found.barrel as RealLink).fill ?? '#000000',
      rod: rodBodyPath(r, rodReach),
      rodFill: found.rod.fill ?? '#000000',
      block: blockPath(r),
      marker: cylinderMarkerPath(r),
      driven,
      arrows: driven ? cylinderArrowPaths(r) : [],
    };
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

  private markFor(
    slider: PrisJoint,
    r: number,
    guide: Guide | undefined,
    joints: Joint[],
    claimed: Set<string>,
    driveForward: boolean,
    otherGuides: GuideBand[]
  ): SliderMark | undefined {
    const block = slider.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    if (!block) return undefined;
    const pin = block.joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && !(joint instanceof PrisJoint)
    );
    if (!pin) return undefined;

    const angle = slider.slotAngle;
    const welded = pin.isWelded;
    const driven = slider.input || pin.input;
    // The block's own zero-length link is a RealLink subclass and has no
    // outline at all; it is the thing being welded to, not a rider on it.
    const riders = pin.links.filter(
      (link): link is RealLink =>
        link instanceof RealLink && !(link instanceof SliderBlock) && !claimed.has(link.id)
    );
    riders.forEach((rider) => claimed.add(rider.id));

    return {
      id: slider.id,
      pin,
      // The block is drawn at its pin: the two are coincident by construction,
      // and the sliding joint tracks the pin rather than the other way round.
      x: pin.x,
      y: pin.y,
      rotation: toDegrees(angle),
      block: blockPath(r),
      welded,
      driven,
      plate: welded ? this.plateFor(pin, riders, angle, r, joints) : undefined,
      riders: welded ? [] : this.ridersFor(pin, riders, angle, r, joints),
      arrows: driven ? straightArrowPaths(r, driveForward ? 1 : -1) : [],
      rails: slider.ground ? this.railsFor(slider, guide, angle, r, otherGuides) : undefined,
      dangling: !slider.ground && !slider.isFloating,
    };
  }

  private plateFor(
    pin: RealJoint,
    riders: RealLink[],
    slotAngle: number,
    r: number,
    joints: Joint[]
  ): WeldPlate | undefined {
    const outlines = riders
      .map((rider) => this.riderOutline(rider, pin, slotAngle))
      .filter((outline): outline is string => outline !== undefined);
    if (outlines.length === 0) return undefined;

    const fused = buildCompoundPath([...outlines, blockPath(r)], MARK.plateFillet * r);
    // A link can be a slot carrier *and* a welded rider at once -- the Scotch
    // yoke's yoke is both. The plate stands in for that link, so it has to cut
    // the same channels the link itself cuts, or it fills the slot back in and
    // the block appears to ride on a solid bar.
    const cuts = riders.flatMap((rider) =>
      this.channelsInLocalFrame(rider, pin, slotAngle, r, joints)
    );
    return {
      fill: riders[0].fill ?? '#000000',
      path: [fused.path, mergedChannels(cuts)].join(' ').trim(),
      links: riders,
    };
  }

  /**
   * The links pinned to this block, drawn in the block's own frame so they land
   * above it (§2.8 layer 4) instead of behind it.
   *
   * They were left in the link layer, which is layer 2 — under every block on
   * the canvas. A coupler ending at a slider then vanished behind the block for
   * the last bar-width of its length, so it read as passing underneath the
   * block rather than being pinned to it. The joint marker is drawn later still,
   * so the pin stays on top of both.
   */
  private ridersFor(
    pin: RealJoint,
    riders: RealLink[],
    slotAngle: number,
    r: number,
    joints: Joint[]
  ): RiderDraw[] {
    return riders.flatMap((rider) => {
      const outline = this.riderOutline(rider, pin, slotAngle);
      if (!outline) return [];
      const cuts = this.channelsInLocalFrame(rider, pin, slotAngle, r, joints);
      return [
        {
          link: rider,
          fill: rider.fill ?? '#000000',
          path: [outline, mergedChannels(cuts)].join(' ').trim(),
        },
      ];
    });
  }

  /**
   * A rider's own outline, carried into the slot's frame.
   *
   * The link's real path rather than a capsule fitted to it: a rider can be a
   * ternary body or a welded compound, and a capsule drawn from the pin to its
   * furthest joint is only the same shape when it happens to be a bar.
   */
  private riderOutline(rider: RealLink, pin: RealJoint, slotAngle: number): string | undefined {
    const outline = rider.d;
    if (!outline) return undefined;
    const along = { x: pin.x + Math.cos(slotAngle), y: pin.y + Math.sin(slotAngle) };
    try {
      return transformRigidPath(outline, pin, along, { x: 0, y: 0 }, { x: 1, y: 0 });
    } catch {
      return undefined;
    }
  }

  /**
   * The rails of a grounded guide, in the guide's own world-fixed frame.
   *
   * `guide` carries where the guide sits when the mechanism is at rest and how
   * far along it the block travels; without it -- an invalid linkage has no
   * solved timesteps -- the rails fall back to the block's own position and a
   * fixed length, which is right at t = 0 and is the only frame there is.
   */
  private railsFor(
    slider: PrisJoint,
    guide: Guide | undefined,
    angle: number,
    r: number,
    others: GuideBand[]
  ): SliderMark['rails'] {
    const band = this.bandFor(slider, guide, angle, r);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (point: { x: number; y: number }) => ({
      x: band.x + point.x * cos - point.y * sin,
      y: band.y + point.x * sin + point.y * cos,
    });
    return {
      ...railGeometry(r, band.halfLength, others, place),
      x: band.x,
      y: band.y,
      rotation: toDegrees(angle),
    };
  }

  /**
   * Where a grounded guide sits and how far it runs, in world coordinates.
   *
   * Centred on the middle of the block's travel rather than on its resting
   * point, so the block is inside its own track wherever the cycle takes it.
   */
  private bandFor(
    slider: PrisJoint,
    guide: Guide | undefined,
    angle: number,
    r: number
  ): GuideBand {
    const anchor = guide ?? { x: slider.x, y: slider.y, lo: 0, hi: 0 };
    const pad = MARK.blockAlongHalf * r + MARK.railHalfLengthMin * r * 0.25;
    const halfLength = Math.max(MARK.railHalfLengthMin * r, (anchor.hi - anchor.lo) / 2 + pad);
    const middle = (anchor.lo + anchor.hi) / 2;
    return {
      x: anchor.x + middle * Math.cos(angle),
      y: anchor.y + middle * Math.sin(angle),
      angle,
      halfLength,
      halfWidth: MARK.railOffset * r,
    };
  }

  /** Every grounded guide's strip, keyed by its slider, for crossing tests. */
  private bands(joints: Joint[], r: number, guides?: Map<string, Guide>): Map<string, GuideBand> {
    const found = new Map<string, GuideBand>();
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.ground) continue;
      found.set(joint.id, this.bandFor(joint, guides?.get(joint.id), joint.slotAngle, r));
    }
    return found;
  }
}

/**
 * Where a grounded guide sits in the world, and how far along itself its block
 * runs. Measured over the solved timesteps, so it does not move when the block
 * does.
 */
export interface Guide {
  x: number;
  y: number;
  lo: number;
  hi: number;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
