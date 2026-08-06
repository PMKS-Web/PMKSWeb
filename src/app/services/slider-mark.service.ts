import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import { Cylinder, sealedCylinders } from '../model/cylinder';
import {
  barrelCollapsedPath,
  blockPath,
  borePath,
  cylinderArrowPaths,
  cylinderBlockPath,
  MARK,
  orientedCapsulePath,
  GuideBand,
  railGeometry,
  Segment,
  rodBodyPath,
  cylinderContourPath,
  cylinderMotionDash,
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
  /**
   * The fused body alone, and the channels cut from it, kept apart so a caller
   * can merge one more hole in before subtracting. The drag preview needs this:
   * appended to `path` after the fact it lands on top of a committed channel,
   * the overlap is wound twice, and the even-odd fill paints the slot back in.
   */
  outline: string;
  cuts: string[];
  /** The links this plate stands in for, so it can be selected like one. */
  links: Link[];
}

/** One link pinned to a block, ready to draw in the block's own frame. */
export interface RiderDraw {
  link: Link;
  fill: string;
  path: string;
  /** Same split as `WeldPlate`, for the same preview-merging reason. */
  outline: string;
  cuts: string[];
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

/** One sealed cylinder, drawn as the part rather than as a block in a channel. */
export interface CylinderMark {
  id: string;
  pin: Joint;
  /** The resolved assembly, for selection, menus and drags. */
  cylinder: Cylinder;
  /** The link a click on any part of the skin selects — the body. */
  body: Link;
  x: number;
  y: number;
  rotation: number;
  /** The links whose ordinary drawing this skin stands in for. */
  barrelId: string;
  rodId: string;
  /**
   * The barrel's inner joint, buried where rod and barrel overlap. A sealed
   * cylinder never reveals, so this joint has no hitbox at all; only the two
   * outer mounts stay visible.
   */
  hiddenJointId: string;
  barrel: string;
  barrelFill: string;
  rod: string;
  rodFill: string;
  block: string;
  /** The exact silhouette, for the selection stroke. */
  contour: string;
  /** The dotted linear-motion cue inside the barrel. */
  dash: { x1: number; x2: number; width: number; dashArray: string };
  driven: boolean;
  arrows: { line: Segment; head: string; emphasised: boolean }[];
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
    //
    // Welded blocks are exempt: a rider welded to two blocks makes all three one
    // rigid body, and the plate that draws it has to contain all three. Letting
    // the first assembly claim the rider left the second with nothing to plate,
    // so of two identically welded sliders one came out fused to the link and
    // the other stayed a bare black block.
    const claimed = new Set<string>();
    const bands = this.bands(joints, r, guides);
    const marks = joints
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
    this.fuseSharedPlates(marks, r, joints);
    return marks;
  }

  /**
   * One plate per rigid weld group, however many blocks are in it.
   *
   * Two welded blocks on one link are one body: drawing a plate per block would
   * paint the shared link twice at its own alpha, and drawing only the first
   * leaves the second bare. The group's blocks and riders are unioned together
   * once, in the frame of whichever block leads it, and the rest keep their
   * black block underneath with no plate of their own.
   */
  private fuseSharedPlates(marks: SliderMark[], r: number, joints: Joint[]): void {
    const welded = marks.filter((mark) => mark.welded);
    const groupOf = new Map<string, SliderMark[]>();
    for (const mark of welded) {
      const riders = this.ridersOn(mark.pin as RealJoint);
      const leader = riders
        .map((rider) => groupOf.get(rider.id))
        .find((group): group is SliderMark[] => group !== undefined);
      const group = leader ?? [];
      group.push(mark);
      for (const rider of riders) groupOf.set(rider.id, group);
    }

    for (const group of new Set(groupOf.values())) {
      if (group.length < 2) continue;
      const [leader, ...rest] = group;
      leader.plate = this.groupPlate(group, r, joints);
      for (const member of rest) member.plate = undefined;
    }
  }

  /** The links pinned to a block, which are what a weld fuses it to. */
  private ridersOn(pin: RealJoint): RealLink[] {
    return pin.links.filter(
      (link): link is RealLink => link instanceof RealLink && !(link instanceof SliderBlock)
    );
  }

  /**
   * The cylinders to draw. Sealed ⇔ skinned, always: there is no reveal on
   * selection and no per-session preference — a sealed assembly is one part,
   * and a hand-built slide is never skinned at all.
   */
  cylinderMarks(joints: Joint[], r: number, driveForward = true): CylinderMark[] {
    return sealedCylinders(joints).map((found) => this.cylinderMark(found, r, driveForward));
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

  private cylinderMark(found: Cylinder, r: number, driveForward: boolean): CylinderMark {
    const { pin, rodFar, barrelNear } = found;
    const angle = Math.atan2(rodFar.y - pin.y, rodFar.x - pin.x);
    const rodReach = Math.hypot(rodFar.x - pin.x, rodFar.y - pin.y);
    const barrelReach = -Math.hypot(found.barrelFar.x - pin.x, found.barrelFar.y - pin.y);
    const driven = found.slider.input || pin.input;
    // The mark's frame runs +x toward the rod; the drive direction is declared
    // along the slot, which may point either way along the same line.
    const leading: 1 | -1 =
      (driveForward ? 1 : -1) * (Math.cos(found.slider.slotAngle - angle) >= 0 ? 1 : -1) > 0
        ? 1
        : -1;
    return {
      id: pin.id,
      pin,
      cylinder: found,
      // A click anywhere on the skin selects the body; the barrel link is the
      // canonical handle for it.
      body: found.barrel,
      x: pin.x,
      y: pin.y,
      // +x runs toward the rod, so the barrel is the negative side and the
      // geometry reads the same whichever way round the slot was declared.
      rotation: toDegrees(angle),
      barrelId: found.barrel.id,
      rodId: found.rod.id,
      hiddenJointId: barrelNear.id,
      barrel: barrelCollapsedPath(r, barrelReach),
      barrelFill: (found.barrel as RealLink).fill ?? '#000000',
      rod: rodBodyPath(r, rodReach),
      // One part, one colour: the rod wears the barrel's fill, always.
      rodFill: (found.barrel as RealLink).fill ?? '#000000',
      block: cylinderBlockPath(r),
      contour: cylinderContourPath(r, barrelReach, rodReach),
      dash: cylinderMotionDash(r, barrelReach),
      driven,
      arrows: driven ? cylinderArrowPaths(r, leading) : [],
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
      outline: fused.path,
      cuts,
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
          outline,
          cuts,
        },
      ];
    });
  }

  /**
   * Every block and every rider of a weld group, fused into one outline in the
   * leader's frame.
   *
   * Built in world coordinates and carried into that frame at the end, because
   * the members sit at different points on different slot angles and there is
   * no local frame all of them are already in.
   */
  private groupPlate(group: SliderMark[], r: number, joints: Joint[]): WeldPlate | undefined {
    const leader = group[0];
    const links = new Map<string, RealLink>();
    const shapes: string[] = [];
    for (const mark of group) {
      const angle = (mark.rotation * Math.PI) / 180;
      shapes.push(this.placed(blockPath(r), mark.pin, angle));
      for (const rider of this.ridersOn(mark.pin as RealJoint)) {
        if (links.has(rider.id) || !rider.d) continue;
        links.set(rider.id, rider);
        shapes.push(rider.d);
      }
    }
    if (links.size === 0) return undefined;

    const fused = buildCompoundPath(shapes, MARK.plateFillet * r);
    const leaderAngle = (leader.rotation * Math.PI) / 180;
    const intoLeader = (path: string) =>
      transformRigidPath(
        path,
        leader.pin,
        { x: leader.pin.x + Math.cos(leaderAngle), y: leader.pin.y + Math.sin(leaderAngle) },
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      );
    const cuts = [...links.values()].flatMap((rider) =>
      this.channelsInLocalFrame(rider, leader.pin as RealJoint, leaderAngle, r, joints)
    );
    const outline = intoLeader(fused.path);
    return {
      fill: [...links.values()][0].fill ?? '#000000',
      path: [outline, mergedChannels(cuts)].join(' ').trim(),
      outline,
      cuts,
      links: [...links.values()],
    };
  }

  /** A local-frame shape put where a mark sits, in world coordinates. */
  private placed(path: string, at: Joint, angle: number): string {
    return transformRigidPath(path, { x: 0, y: 0 }, { x: 1, y: 0 }, at, {
      x: at.x + Math.cos(angle),
      y: at.y + Math.sin(angle),
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
