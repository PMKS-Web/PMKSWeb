import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ExportCatalogService } from './export-catalog.service';
import {
  ColumnTab,
  ExportColumn,
  ExportColumnGroup,
  ExportPart,
  ExportSeries,
} from './export-model';

/**
 * What a chosen set of parts turns out to have numbers for.
 *
 * Split from the catalogue of parts because the two questions have different
 * shapes: what a drawing contains is fixed the moment it is drawn, and what
 * that selection can be asked for changes with every tick.
 */
@Injectable({ providedIn: 'root' })
export class ExportColumnsService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private catalog = inject(ExportCatalogService);

  /**
   * The quantities a chosen set of parts turns out to have.
   *
   * Kinematics groups by kind rather than by part: every chosen joint has the
   * same three quantities, and a list that repeated them per joint would be the
   * same three answers asked eleven times.
   */
  columnGroups(parts: ExportPart[], tab: ColumnTab): ExportColumnGroup[] {
    return tab === 'forces' ? this.forceGroups(parts) : this.kinematicGroups(parts);
  }

  private kinematicGroups(parts: ExportPart[]): ExportColumnGroup[] {
    const groups: ExportColumnGroup[] = [];
    const joints = parts.filter((part) => part.kind === 'joint');
    // Bars, and the rods that stand for rams — not slider blocks. The solver
    // leaves a block out of its angular maps and gives it no centre of mass,
    // so a block offered these four choices produced eleven columns of blanks.
    // What a block does have is the reaction it carries, which is the other tab.
    const links = parts.filter((part) => part.kind === 'link' && part.part instanceof RealLink);
    const length = this.catalog.unitStr(this.settings.lengthUnit.value);
    const angle = this.catalog.unitStr(this.settings.angleUnit.value);

    if (joints.length > 0) {
      groups.push({
        key: 'joints',
        title: this.titleOf('Joint', joints),
        tab: 'kinematics',
        columns: [
          this.kinematic(joints, 'j:pos', 'Position', length, [
            ['Position', 'Linear Joint Pos', length, 2],
          ]),
          this.kinematic(joints, 'j:vel', 'Velocity', `${length}/s`, [
            ['Velocity', 'Linear Joint Vel', `${length}/s`, 3],
          ]),
          this.kinematic(joints, 'j:acc', 'Acceleration', `${length}/s²`, [
            ['Acceleration', 'Linear Joint Acc', `${length}/s²`, 3],
          ]),
        ],
      });
    }

    if (links.length > 0) {
      groups.push({
        key: 'links',
        title: this.titleOf('Link', links),
        tab: 'kinematics',
        columns: [
          this.kinematic(links, 'l:ang', 'Angle', angle, [['Angle', 'Angular Link Pos', angle, 1]]),
          this.kinematic(links, 'l:angvel', 'Angular velocity', `${angle}/s`, [
            ['Angular velocity', 'Angular Link Vel', `${angle}/s`, 1],
          ]),
          this.kinematic(links, 'l:angacc', 'Angular acceleration', `${angle}/s²`, [
            ['Angular acceleration', 'Angular Link Acc', `${angle}/s²`, 1],
          ]),
          this.kinematic(links, 'l:com', 'Center of mass', 'pos, vel, acc', [
            ['Center of mass position', "Linear Link's CoM Pos", length, 2],
            ['Center of mass velocity', "Linear Link's CoM Vel", `${length}/s`, 3],
            ['Center of mass acceleration', "Linear Link's CoM Acc", `${length}/s²`, 3],
          ]),
        ],
      });
    }
    return groups;
  }

  /** `Joints B, C` for several, `Joint B` for one — the heading names them. */
  private titleOf(kind: string, parts: ExportPart[]): string {
    const names = parts.map((part) => part.label.replace(/^(Joint|Link) /, ''));
    return `${kind}${names.length === 1 ? '' : 's'} ${names.join(', ')}`;
  }

  private kinematic(
    parts: ExportPart[],
    key: string,
    label: string,
    unit: string,
    series: [string, string, string, 1 | 2 | 3][]
  ): ExportColumn {
    return {
      key,
      label,
      unit,
      appliesTo: parts.map((part) => part.key),
      tab: 'kinematics',
      series: series.map(([seriesLabel, mechProp, seriesUnit, components]) => ({
        label: seriesLabel,
        head: '',
        unit: seriesUnit,
        components,
        analysis: 'kinematic' as const,
        mechProp,
        mechPart: '',
        reactionLinkId: '',
      })),
    };
  }

  /**
   * Every reaction the chosen parts carry, one group per part.
   *
   * Per part rather than per kind, unlike kinematics: a joint's reactions are
   * named after the links it holds, so no two joints have the same list.
   */
  private forceGroups(parts: ExportPart[]): ExportColumnGroup[] {
    const mode = this.settings.forceAnalysisMode.value;
    // A reaction at a joint buried inside a sealed cylinder is a force between
    // two halves of one part, named after a pin the drawing never shows.
    const hidden = this.catalog.hiddenJointIds();
    // Which reactions a row has already claimed. Joints come before bodies in
    // the list, so a pin owns its own force and a body offers only what is left.
    const taken = new Set<string>();
    const groups: ExportColumnGroup[] = [];
    parts.forEach((part) => {
      const solved = this.mechanism.mechanisms[part.mechanismIndex];
      if (!solved?.isMechanismValid()) return;
      const index = solved.getForceAnalysis(mode).reactionIndex;
      const columns: ExportColumn[] =
        part.kind === 'joint'
          ? (index.linksByJoint.get(part.id) ?? []).flatMap((linkId) =>
              this.jointReaction(part, linkId, index)
            )
          : // Every link the body is made of: a ram's two mounts sit on
            // different ones, so asking about the rod alone gave the force at
            // one end of it and nothing at the end it is pushing.
            this.catalog.memberIdsOf(part.id).flatMap((memberId) =>
              (index.jointsByLink.get(memberId) ?? [])
                .filter((jointId) => !hidden.has(jointId))
                // A reaction a chosen joint already carries. At a pin joining
                // two bodies the solver holds one force and its negative, so a
                // joint's view and a body's view of the same pin are the same
                // column written twice under two names.
                .filter((jointId) => !taken.has(`${jointId}@${memberId}`))
                .map((jointId) => {
                  // A slot is named after the slider it belongs to: it has no
                  // marker of its own and no name a reader has ever seen.
                  const where = this.mechanism.slotName(jointId) ?? this.jointName(jointId);
                  return this.force(
                    `Force at ${where}`,
                    `${this.modeWord()} force on ${part.label} at ${where}`,
                    part,
                    jointId,
                    memberId,
                    'Joint Forces',
                    false
                  );
                })
            );

      // The effort whatever drives this part has to supply. A joint that is an
      // input carries its own; a cylinder is driven from a joint buried inside
      // it, which has no row of its own anywhere in the app -- so the ram's row
      // is the only place that number can be asked for.
      const driven =
        part.kind === 'joint'
          ? // The joint itself, or the slot it rides in: a slot is never on the
            // list, so the effort driving one has to be asked for against the
            // pin a reader can actually point at.
            (part.part as RealJoint).input
            ? (part.part as RealJoint)
            : this.catalog.drivingSlotOf(part.part as RealJoint)
          : this.catalog.drivenJointOf(part.id);
      if (driven) {
        const torque = !(driven instanceof PrisJoint);
        const effort = torque ? 'Input torque' : 'Input force';
        columns.push(
          this.force(
            effort,
            `${this.modeWord()} ${effort.toLowerCase()} at ${part.label}`,
            part,
            driven.id,
            '',
            'Input Effort',
            torque
          )
        );
      }

      columns.forEach((column) =>
        taken.add(`${column.series[0].mechPart}@${column.series[0].reactionLinkId}`)
      );
      if (columns.length > 0) {
        groups.push({ key: `force:${part.key}`, title: part.label, tab: 'forces', columns });
      }
    });
    return groups;
  }

  /**
   * What a joint reacts against, one column per body.
   *
   * A slider's block is not one of them. It is a zero-length link between the
   * pin and its slot, so the force between the pin and the block is exactly the
   * force between the pin and the bar, negated -- already on this row. What the
   * block does have of its own is the force in the slot, which is what sizes a
   * slide and is reachable from nowhere else.
   */
  private jointReaction(
    part: ExportPart,
    linkId: string,
    index: { jointsByLink: Map<string, string[]> }
  ): ExportColumn[] {
    const slot = this.mechanism.slotReactionOf(part.part as RealJoint);
    if (slot && slot.block.id === linkId) {
      return [
        this.force(
          `Force on ${slot.on}`,
          `${this.modeWord()} force at ${part.label} on ${slot.on}`,
          part,
          slot.slot.id,
          linkId,
          'Joint Forces',
          false
        ),
      ];
    }
    return [
      this.force(
        `Force on ${this.bodyName(linkId)}`,
        `${this.modeWord()} force at ${part.label} on ${this.bodyName(linkId)}`,
        part,
        part.id,
        linkId,
        'Joint Forces',
        !(part.part instanceof PrisJoint)
      ),
    ];
  }

  private force(
    label: string,
    head: string,
    part: ExportPart,
    mechPart: string,
    reactionLinkId: string,
    mechProp: string,
    /** Whether the effort is a moment. Decided by the driving joint, not the part. */
    isTorque: boolean
  ): ExportColumn {
    const torque = mechProp === 'Input Effort' && isTorque;
    const unit = torque ? this.catalog.torqueUnit() : this.catalog.forceUnit();
    const series: ExportSeries = {
      label,
      head,
      unit,
      // A reaction is a vector; an input effort is one number.
      components: mechProp === 'Input Effort' ? 1 : 3,
      analysis: 'force',
      mechProp,
      mechPart,
      reactionLinkId,
    };
    return {
      // The joint is in the key as well as the link: a link's reactions are
      // named after the joints holding it, and two of them share every other
      // part of this — so without it, unticking one untick both.
      key: `f:${part.key}:${mechProp}:${mechPart}:${reactionLinkId}`,
      label,
      unit,
      appliesTo: [part.key],
      tab: 'forces',
      series: [series],
    };
  }

  /**
   * Which force analysis a column came from, written into its own head.
   *
   * A static reaction and an in-motion one are different numbers for the same
   * joint, and a file that does not say which it holds is a file nobody can
   * check. Carried by the head rather than by a note at the top, so it survives
   * being pasted into a sheet, plotted, or read by a script.
   */
  private modeWord(): string {
    return this.settings.forceAnalysisMode.value === 'dynamic' ? 'In-motion' : 'Static';
  }

  /** The same words the panels put on a graph, so the file agrees with them. */
  private bodyName(linkId: string): string {
    const body = this.mechanism.links.find((link) => link.id === linkId);
    return body ? this.catalog.labelFor(body) : linkId;
  }

  private jointName(jointId: string): string {
    const joint = this.mechanism.joints.find((candidate) => candidate.id === jointId) as
      RealJoint | undefined;
    return `Joint ${joint?.name || jointId}`;
  }
}
