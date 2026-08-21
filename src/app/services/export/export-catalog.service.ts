import { Injectable, inject } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Cylinder, cylinderJoints } from '../../model/cylinder';
import { Link, RealLink, SliderBlock } from '../../model/link';
import { AngleUnit, ForceUnit, LengthUnit } from '../../model/unit-enums';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ExportPart, ExportPartGroup } from './export-model';

/**
 * Every part this drawing has to offer an export, and what to call things.
 *
 * Derivation only: nothing here remembers what was ticked. The drawer's own
 * state lives in `ExportFlowService`, and what a chosen part can be asked for
 * lives in `ExportColumnsService`.
 */
@Injectable({ providedIn: 'root' })
export class ExportCatalogService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);

  /**
   * Every part of every mechanism, grouped by machine.
   *
   * Grounded joints are listed in both modes and tickable in only one: a fixed
   * joint has no motion to report, but it does carry a reaction.
   */
  partGroups(withForces: boolean): ExportPartGroup[] {
    const cylinders = this.mechanism.sealedStructures();
    return this.mechanism.partitions.map((partition, index) => {
      const solved = this.mechanism.mechanisms[index];
      const valid = solved?.isMechanismValid() ?? false;
      const joints = partition.ownJoints
        .filter((joint): joint is RealJoint => joint instanceof RealJoint)
        // Every joint the canvas draws a marker for, and no others. A slot is
        // a joint to the solver and nothing at all to a reader: it has a
        // zero-sized marker, no hitbox and no panel, so a row for it offered
        // numbers no graph in the app can show -- and the force it carries is
        // reachable from the block that rides in it.
        .filter((joint) => !(joint instanceof PrisJoint))
        .filter((joint) => !this.isInsideCylinder(cylinders, joint))
        .map((joint) => this.jointPart(joint, partition.id, index, withForces));
      // Bars, and the rods that stand for rams. A slider's block is a
      // zero-length link binding a pin to a slot: a reader sees one slider
      // where the solver has three bodies, and the block's own reactions are
      // its pin's force negated and the force in the slot -- both of which the
      // pin now carries. See `slotReactionOf`.
      const links = partition.links
        .filter((link): link is RealLink => link instanceof RealLink)
        // A sealed cylinder stands in the list as one part. Its barrel, its
        // piston and the joints buried inside it are pieces of a ram nobody
        // drew and nobody can point at on the canvas.
        .filter((link) => this.standsForCylinder(cylinders, link) !== 'hidden')
        .map((link) => this.linkPart(link, partition.id, index, valid, cylinders));
      return {
        index,
        id: partition.id,
        note: this.noteFor(index),
        forcesReady: this.forcesSolve(index),
        parts: valid ? [...joints, ...links] : [...joints, ...links].map(this.unsolved),
      };
    });
  }

  /** Nothing solves for a mechanism that does not run, so nothing is on offer. */
  private unsolved = (part: ExportPart): ExportPart => ({ ...part, available: false });

  /** The three joints a sealed cylinder keeps to itself: no hitbox, no row. */
  private isInsideCylinder(cylinders: Cylinder[], joint: Joint): boolean {
    return cylinders.some(
      (cylinder) =>
        cylinder.barrelNear.id === joint.id ||
        cylinder.pin.id === joint.id ||
        cylinder.slider.id === joint.id
    );
  }

  /**
   * Whether a body is a piece of a cylinder, and if so which piece.
   *
   * The rod stands for the whole ram — it is the member that moves, and it
   * shares the barrel's angle — so it keeps its row under the cylinder's name;
   * the barrel and the piston are hidden behind it.
   */
  private standsForCylinder(cylinders: Cylinder[], link: Link): 'rod' | 'hidden' | 'none' {
    const cylinder = cylinders.find(
      (candidate) =>
        candidate.rod.id === link.id ||
        candidate.barrel.id === link.id ||
        candidate.block.id === link.id
    );
    if (!cylinder) return 'none';
    return cylinder.rod.id === link.id ? 'rod' : 'hidden';
  }

  private jointPart(
    joint: RealJoint,
    machine: string,
    index: number,
    withForces: boolean
  ): ExportPart {
    const notes: string[] = [];
    if (joint.ground) notes.push('grounded');
    if (joint.input) notes.push('input');
    if (this.mechanism.sliderFor(joint)) notes.push('slider');
    if (joint.showCurve) notes.push('tracer point');
    if (this.mechanism.isSelectedJoint(joint)) notes.push('currently selected');
    return {
      // Qualified by machine, because a joint can belong to two of them: a
      // chain bolted to another's ground shares that pin, and keyed by its
      // letter alone, ticking it under one machine ticked it under both --
      // which wrote a file for a machine the reader had not asked about.
      key: `${machine}|joint:${joint.id}`,
      kind: 'joint',
      id: joint.id,
      label: `Joint ${joint.name || joint.id}`,
      note: notes.join(', '),
      // Every joint of a mechanism that solves. A pinned one has a position
      // worth writing down and a reaction worth reading, and a list that
      // decided for the reader which of those they meant was a list that
      // hid parts they had come looking for.
      available: true,
      part: joint,
      mechanismIndex: index,
    };
  }

  private linkPart(
    link: Link,
    machine: string,
    index: number,
    valid: boolean,
    cylinders: Cylinder[]
  ): ExportPart {
    const notes: string[] = [];
    const ram = this.standsForCylinder(cylinders, link) === 'rod';
    if (ram) notes.push('cylinder');
    else if (link instanceof SliderBlock) notes.push('slider block');
    if (link.joints.some((joint) => (joint as RealJoint).input)) notes.push('input crank');
    if (link instanceof RealLink && link.subset.length > 0) notes.push('compound');
    if (this.mechanism.isSelectedBody(link)) notes.push('currently selected');
    return {
      key: `${machine}|link:${link.id}`,
      kind: 'link',
      id: link.id,
      label: ram ? this.cylinderLabel(cylinders, link) : this.mechanism.bodyLabel(link),
      note: notes.join(', '),
      available: valid,
      part: link,
      mechanismIndex: index,
    };
  }

  /** `Cylinder AC` — the ram by the two mounts a reader can see. */
  private cylinderLabel(cylinders: Cylinder[], link: Link): string {
    const cylinder = cylinders.find((candidate) => candidate.rod.id === link.id)!;
    const mounts =
      (cylinder.barrelFar.name || cylinder.barrelFar.id) +
      (cylinder.rodFar.name || cylinder.rodFar.id);
    return `Cylinder ${mounts}`;
  }

  /**
   * What to call a body anywhere a reader will read it.
   *
   * A cylinder is one part in this drawer, so its pieces answer to the ram's
   * name: a reaction headed `Rod GC` names a body the parts list never offered.
   */
  labelFor(link: Link): string {
    const cylinders = this.mechanism.sealedStructures();
    const cylinder = cylinders.find(
      (candidate) =>
        candidate.rod.id === link.id ||
        candidate.barrel.id === link.id ||
        candidate.block.id === link.id
    );
    return cylinder ? this.cylinderLabel(cylinders, cylinder.rod) : this.mechanism.bodyLabel(link);
  }

  /**
   * The links a body is made of, for asking the force solver about it.
   *
   * One for an ordinary bar. A cylinder is one part to the reader and three
   * links to the solver, and its two mounts sit on different ones — the barrel
   * carries the far mount and the rod the other — so asking about the rod
   * alone listed the force at one end of a ram and nothing at the end it is
   * pushing. The same rule the analysis panel uses, for the same reason.
   */
  memberIdsOf(linkId: string): string[] {
    const body = this.mechanism.links.find((link) => link.id === linkId);
    const sealed = body && this.mechanism.cylinderAt(body);
    return sealed ? [sealed.barrel.id, sealed.rod.id, sealed.block.id] : [linkId];
  }

  /**
   * The joint driving a cylinder, which is buried inside it.
   *
   * A ram is driven from a joint with no marker, no hitbox and no row in any
   * panel, so the effort that drive supplies has to be offered against the
   * part a reader can actually see.
   */
  drivenJointOf(linkId: string): RealJoint | undefined {
    const body = this.mechanism.links.find((link) => link.id === linkId);
    const sealed = body && this.mechanism.cylinderAt(body);
    if (!sealed) return undefined;
    return cylinderJoints(sealed).find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
  }

  /** The slot this pin rides in, where that slot is what drives the mechanism. */
  drivingSlotOf(joint: RealJoint): RealJoint | undefined {
    const slider = this.mechanism.sliderFor(joint);
    return slider?.input ? slider : undefined;
  }

  /** The joints a sealed cylinder keeps to itself, by id. */
  hiddenJointIds(): Set<string> {
    return new Set(
      this.mechanism
        .sealedStructures()
        .flatMap((cylinder) => [cylinder.barrelNear.id, cylinder.pin.id, cylinder.slider.id])
    );
  }

  /** What a machine is, in the one line the section heading has room for. */
  private noteFor(index: number): string {
    const partition = this.mechanism.partitions[index];
    const facts = this.mechanism.readinessOfEachMechanism()[index]?.facts ?? [];
    const speed = facts.find((fact) => fact.label === 'Input speed')?.value;
    const bodies = partition.links.filter((link) => link instanceof RealLink).length;
    const count = `${bodies} ${bodies === 1 ? 'link' : 'links'}`;
    return speed ? `${count} · ${speed}` : `${count} · not running`;
  }

  /**
   * Whether force analysis is set up *and* solves for this machine.
   *
   * Both halves matter. A linkage with nothing loading it solves to a page of
   * zeroes, which is not an answer anyone asked for — so the drawing-wide
   * requirements decide whether forces are on offer at all, and this machine's
   * own frames decide whether it is one of the machines that has them.
   */
  forcesSolve(index: number): boolean {
    const solved = this.mechanism.mechanisms[index];
    if (!solved?.isMechanismValid() || !this.mechanism.forceAnalysisReady()) return false;
    const mode = this.settings.forceAnalysisMode.value;
    return solved.getForceAnalysis(mode).successfulFrames > 0;
  }

  forceUnit(): string {
    return this.settings.forceUnit.value === ForceUnit.LBF ? 'lbf' : 'N';
  }

  torqueUnit(): string {
    return this.settings.forceUnit.value === ForceUnit.LBF ? 'lbf·in' : 'N·m';
  }

  /** The same words the panels put on an axis, so the file agrees with them. */
  unitStr(unit: LengthUnit | AngleUnit): string {
    switch (unit) {
      case AngleUnit.RADIAN:
        return 'rad';
      case AngleUnit.DEGREE:
        return 'deg';
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        return 'cm';
    }
  }

  /** Parts of one mechanism, in the order the drawer lists them. */
  partsOf(groups: ExportPartGroup[], keys: Set<string>): ExportPart[] {
    return groups.flatMap((group) => group.parts.filter((part) => keys.has(part.key)));
  }
}
