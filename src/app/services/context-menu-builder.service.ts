import { Injectable, inject } from '@angular/core';
import {
  ContextMenuModel,
  MenuGroup,
  MenuRefusal,
  MenuRow,
} from '../component/context-menu/menu-model';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import { Force } from '../model/force';
import { SynthesisPose } from './synthesis/synthesis-util';
import { Cylinder } from '../model/cylinder';
import { labelForBody } from '../model/body-label';
import { describeActuatorRefusal } from '../model/actuator';
import { MechanismService } from './mechanism.service';
import { GridUtilsService } from './grid-utils.service';
import { SettingsService } from './settings.service';
import { ActiveObjService } from './active-obj.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from '../selected-tab.service';

/** What the canvas does when a row asks for a gesture rather than an edit. */
export interface MenuHandlers {
  attachLink(): void;
  attachCylinder(): void;
  attachTracerPoint(): void;
  attachForce(onLink: RealLink): void;
  backgroundImage(): void;
  deletePosition(id: number): void;
  deleteAllPositions(): void;
}

/** Anything the right-click can land on. */
export type MenuTarget = Joint | Link | Force | SynthesisPose | string;

/**
 * The right-click menu, assembled.
 *
 * One place, because the menu's whole claim is that it says the same thing the
 * panels and the drag ring say. Every refusal below is fetched from the model
 * that enforces it — `describeActuator` for a driven joint, `weldRefusal` for a
 * weld, `locksHolding` for a lock — rather than written out again here, so the
 * three surfaces cannot end up disagreeing about what is possible.
 *
 * The shape is a fixed ladder in every case: Attach, State, Machine, and a
 * destructive footer. Groups drop out when they are empty and never reorder,
 * so the flick to Delete lands on the last row whether the menu holds two rows
 * or twelve.
 */
@Injectable({ providedIn: 'root' })
export class ContextMenuBuilderService {
  private mechanism = inject(MechanismService);
  private gridUtils = inject(GridUtilsService);
  private settings = inject(SettingsService);
  private activeObj = inject(ActiveObjService);
  private keys = inject(KeyboardShortcutsService);
  private synthesis = inject(SynthesisBuilderService);
  private tabs = inject(SelectedTabService);

  build(target: MenuTarget, handlers: MenuHandlers): ContextMenuModel {
    const model = this.buildFor(target, handlers);
    return this.freezeWhileRunning(model);
  }

  private buildFor(target: MenuTarget, handlers: MenuHandlers): ContextMenuModel {
    if (target instanceof SynthesisPose) return this.forPose(target, handlers);
    // Synthesis mode is a question about a mechanism that does not exist yet:
    // the only things on the canvas that belong to anyone are the positions,
    // and the panel owns everything else about them.
    if (this.tabs.getCurrentTab() === TabID.SYNTHESIZE) {
      const rows = this.positionRows(handlers, undefined);
      return rows.length === 0
        ? { groups: [] }
        : { header: { title: 'Canvas', subtitle: this.canvasSubtitle() }, groups: [{ rows }] };
    }
    if (target instanceof Force) return this.forForce(target);
    if (target instanceof Link) return this.forLink(target, handlers);
    if (target instanceof Joint) return this.forJoint(target, handlers);
    return this.forCanvas(handlers);
  }

  // ---------------------------------------------------------------- canvas

  private forCanvas(handlers: MenuHandlers): ContextMenuModel {
    const groups: MenuGroup[] = [];
    if (this.tabs.getCurrentTab() === TabID.EDIT) {
      groups.push({
        label: 'Add',
        rows: [
          new MenuRow({ label: 'Link', icon: 'new_link', action: () => handlers.attachLink() }),
          new MenuRow({
            label: 'Cylinder',
            icon: 'add_cylinder',
            action: () => handlers.attachCylinder(),
          }),
          new MenuRow({
            label: 'Background Image',
            icon: 'background_image',
            action: () => handlers.backgroundImage(),
          }),
        ],
      });
      groups.push({ label: 'Machine', rows: this.machineRows() });
    }
    groups.push({ rows: this.positionRows(handlers, undefined) });
    // Bare canvas in an analysis mode: nothing to name and nothing to do, so
    // no card. A *part* still earns one — its header is the way back into
    // Edit on the thing being looked at — but the grid is not a part.
    if (groups.every((group) => group.rows.length === 0)) return { groups: [] };
    return { header: { title: 'Canvas', subtitle: this.canvasSubtitle() }, groups };
  }

  private canvasSubtitle(): string {
    const counts = this.mechanism.lockCounts();
    if (counts.total === 0) return 'Grid · nothing drawn';
    if (counts.locked === 0) return 'Grid · nothing selected';
    if (counts.locked === counts.total) return `Grid · all ${counts.total} parts locked`;
    return `Grid · ${counts.locked} of ${counts.total} parts locked`;
  }

  /**
   * Lock All and Unlock All, each with its own count.
   *
   * The pair never both grey at once — one of them always has something to do
   * on a drawing that holds anything — so there is always a way out of a
   * fully locked mechanism.
   */
  private machineRows(): MenuRow[] {
    const counts = this.mechanism.lockCounts();
    const lockKey = this.keys.keysFor('edit.lock');
    return [
      new MenuRow({
        label: 'Lock All',
        icon: 'lock',
        action: () => this.mechanism.setAllLocks(true),
        hint: counts.open > 0 ? `${counts.open} open` : undefined,
        shortcut: lockKey,
        refusal:
          counts.total === 0
            ? { short: 'nothing to lock', long: 'There is nothing on the grid yet.' }
            : counts.open === 0
              ? { short: 'all locked', long: 'Every part is already locked.' }
              : undefined,
      }),
      new MenuRow({
        label: 'Unlock All',
        icon: 'unlock',
        action: () => this.mechanism.setAllLocks(false),
        hint: counts.locked > 0 ? `${counts.locked} locked` : undefined,
        refusal:
          counts.locked === 0 ? { short: 'nothing locked', long: 'No part is locked.' } : undefined,
      }),
    ];
  }

  // --------------------------------------------------------------- position

  /**
   * The synthesis positions, on every menu that can reach them.
   *
   * They are drawn in every mode, because they are a note about what the
   * mechanism was designed to do rather than a part of it — so clearing them
   * is not an edit and does not have to wait for the start pose.
   */
  private positionRows(handlers: MenuHandlers, pose: SynthesisPose | undefined): MenuRow[] {
    const placed = this.synthesis.getAllPoses().length;
    if (placed === 0) return [];
    const rows: MenuRow[] = [];
    if (pose) {
      rows.push(
        new MenuRow({
          label: `Delete Position ${pose.id}`,
          icon: 'remove',
          action: () => handlers.deletePosition(pose.id),
          destructive: true,
          alwaysAllowed: true,
          shortcut: this.keys.keysFor('edit.delete'),
        })
      );
    }
    rows.push(
      new MenuRow({
        label: pose
          ? `Delete All ${placed} Positions`
          : `Delete ${placed} Synthesis ${placed === 1 ? 'Position' : 'Positions'}`,
        icon: 'remove',
        action: () => handlers.deleteAllPositions(),
        destructive: true,
        alwaysAllowed: true,
      })
    );
    return rows;
  }

  private forPose(pose: SynthesisPose, handlers: MenuHandlers): ContextMenuModel {
    const placed = this.synthesis.getAllPoses().length;
    return {
      header: { title: `Position ${pose.id}`, subtitle: `Synthesis · ${placed} placed` },
      groups: [{ rows: this.positionRows(handlers, pose) }],
    };
  }
  // ----------------------------------------------------------------- joint

  private forJoint(joint: Joint, handlers: MenuHandlers): ContextMenuModel {
    const header = {
      title: `Joint ${this.nameOf(joint)}`,
      subtitle: this.jointSubtitle(joint),
      crossing: this.crossing(joint),
    };
    if (!(joint instanceof RealJoint)) return { header, groups: [] };
    if (this.tabs.isAnalysisMode()) {
      return {
        header,
        groups: [
          { label: 'State', rows: [this.traceRow(joint), ...this.forceGraphRow(joint)] },
          { rows: this.positionRows(handlers, undefined) },
        ],
      };
    }
    const sealed = this.mechanism.cylinderAt(joint);
    return {
      header,
      groups: [
        { label: 'Attach', rows: this.jointAttachRows(joint, handlers) },
        { label: 'State', rows: this.jointStateRows(joint, sealed) },
        { rows: [this.deleteJointRow(joint, sealed)] },
      ],
    };
  }

  private jointAttachRows(joint: RealJoint, handlers: MenuHandlers): MenuRow[] {
    const driven = this.gridUtils.isVisuallyInput(joint);
    // A third body at a driven joint is what "driven" stops being able to
    // describe: an input prescribes the freedom between *two* bodies.
    const crowds: MenuRefusal | undefined = driven
      ? {
          short: 'it is driven',
          long: 'An input prescribes the freedom between two bodies, so a third arriving here would leave "driven" naming no pair. Remove the input first.',
        }
      : undefined;
    const held = this.frozenRefusal(joint);
    const rows: MenuRow[] = [
      new MenuRow({
        label: 'Link',
        icon: 'new_link',
        action: () => handlers.attachLink(),
        refusal: held ?? crowds,
      }),
    ];
    // A cylinder's own joints take no third member, so the row is absent there
    // rather than greyed: that is a fact about the part, not this arrangement.
    if (!this.mechanism.cylinderAt(joint)) {
      rows.push(
        new MenuRow({
          label: 'Cylinder',
          icon: 'add_cylinder',
          action: () => handlers.attachCylinder(),
          // A weld says everything meeting here is one rigid body; a cylinder's
          // joint arriving would be a third body joining that statement without
          // being part of it, and the reconcilers then disagree about what the
          // compound is.
          refusal:
            held ??
            crowds ??
            (joint.isWelded
              ? {
                  short: 'it is welded',
                  long: 'A weld says the bodies meeting here are one rigid piece. Unweld the joint before attaching a cylinder to it.',
                }
              : undefined),
        })
      );
    }
    // A load has to say which body carries it. At a joint two links share there
    // is no answer, so the row is greyed here and offered on the bar, where the
    // anchor can be placed unambiguously.
    const bars = joint.links.filter((link): link is RealLink => link instanceof RealLink);
    if (bars.length > 0) {
      rows.push(
        new MenuRow({
          label: 'Force',
          icon: 'add_force',
          action: () => handlers.attachForce(bars[0]),
          refusal:
            held ??
            (bars.length > 1
              ? {
                  short: `${bars.length} links share it`,
                  long: 'A load applied where several links meet does not say which one carries it. Attach it to the link instead.',
                }
              : undefined),
        })
      );
    }
    return rows;
  }

  private jointStateRows(joint: RealJoint, sealed: Cylinder | undefined): MenuRow[] {
    const rows: MenuRow[] = [
      new MenuRow({
        label: 'Grounded',
        icon: 'add_ground',
        kind: 'toggle',
        checked: this.groundedNow(joint),
        action: () => this.mechanism.toggleGround(),
      }),
      new MenuRow({
        label: 'Driven Input',
        icon: 'add_input',
        kind: 'toggle',
        checked: this.gridUtils.isVisuallyInput(joint),
        action: () => this.mechanism.adjustInput(),
        refusal: this.inputRefusal(joint),
      }),
    ];
    // A slider on a cylinder's joint is structurally off the table — the
    // assembly already is one — so it is absent rather than greyed.
    if (!sealed) {
      const isSlider = this.gridUtils.isAttachedToSlider(joint);
      rows.push(
        new MenuRow({
          label: 'Slider',
          icon: 'add_slider',
          kind: 'toggle',
          checked: isSlider,
          action: () => this.mechanism.toggleSlider(),
          // A block is a body too, so adding one to a driven pin puts a third
          // at the joint. Taking one away is always allowed.
          refusal:
            !isSlider && this.gridUtils.isVisuallyInput(joint)
              ? {
                  short: 'it is driven',
                  long: 'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
                }
              : undefined,
        })
      );
    }
    // A slider pin keeps its Weld row, enabled. The design said a slider cannot
    // be welded and so the row should be absent; the model does not agree --
    // `canToggleWeld` has no slider clause, and §4.1's rule is that a slider
    // is *offered* the weld and refused with the reason if the fuse cannot
    // stand. Hiding it put a reachable state out of reach from this surface
    // and not from the panel, which is the disagreement this menu exists to
    // stop.
    if (!(joint instanceof PrisJoint)) {
      rows.push(
        new MenuRow({
          label: 'Welded',
          icon: 'weld_joint',
          kind: 'toggle',
          checked: joint.isWelded,
          action: () => this.mechanism.toggleWeldedJoint(),
          refusal: this.gridUtils.weldRefusal(joint),
        })
      );
    }
    rows.push(this.traceRow(joint));
    rows.push(this.lockRow(joint, joint));
    return rows;
  }

  /** Whether this joint reads as grounded — a slider's ground lives on its guide. */
  private groundedNow(joint: RealJoint): boolean {
    if (this.gridUtils.isAttachedToSlider(joint)) {
      return (this.gridUtils.getSliderJoint(joint) as RealJoint).ground;
    }
    return joint.ground;
  }

  /** Why this joint will not take an input, in the model's own words. */
  private inputRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.gridUtils.canToggleInput(joint)) return undefined;
    const driven = this.gridUtils.isAttachedToSlider(joint)
      ? (this.gridUtils.getSliderJoint(joint) as RealJoint)
      : joint;
    return describeActuatorRefusal(driven);
  }

  /**
   * The trace switch: a view of the mechanism rather than a part of it, so it
   * stays live in the analysis modes and while the animation runs.
   *
   * Turning one on turns the global switch on with it. A per-joint trace that
   * draws nothing because the view control is off is a switch that lies.
   */
  private traceRow(joint: RealJoint): MenuRow {
    return new MenuRow({
      label: 'Trace Path',
      icon: 'show_path',
      kind: 'toggle',
      checked: this.gridUtils.getJointShowCurve(joint),
      alwaysAllowed: true,
      action: () => {
        this.gridUtils.toggleCurve(joint);
        if (!this.settings.isShowTraces.value) this.settings.isShowTraces.next(true);
      },
    });
  }

  /** In Force mode only: the joint's own force graphs, and why there are none. */
  private forceGraphRow(joint: RealJoint): MenuRow[] {
    if (this.tabs.getCurrentTab() !== TabID.FORCE) return [];
    return [
      new MenuRow({
        label: 'Graph Joint Force',
        icon: 'balance',
        material: true,
        alwaysAllowed: true,
        action: () => this.activeObj.updateSelectedObj(joint),
        refusal: this.mechanism.jointHasForceToGraph(joint)
          ? undefined
          : // "One part meets it" is only true when that is what is wrong.
            // On a machine that cannot be analysed at all, the joint may have
            // three bodies at it and still no graph, and telling that reader
            // to attach something would send them to fix the wrong thing.
            (this.analysisRefusal(joint) ?? {
              short: 'one part meets it',
              long: 'Only one part meets this joint, so there is no second body for it to react against and no force to graph.',
            }),
      }),
    ];
  }

  private deleteJointRow(joint: RealJoint, sealed: Cylinder | undefined): MenuRow {
    const held = this.lockedRefusal(joint);
    // The cascade is named, not confirmed: a cylinder's joint takes the whole
    // assembly, and an ordinary one takes any bar left with a single end. The
    // row says which, before the click rather than after it.
    const label = this.deleteJointLabel(joint, sealed);
    return new MenuRow({
      label,
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      action: () => this.mechanism.deleteJoint(),
      refusal: held,
    });
  }

  private deleteJointLabel(joint: RealJoint, sealed: Cylinder | undefined): string {
    // A slider's block is not named: it is drawn *on* this joint rather than
    // beside it, so "and the block at C" describes no second thing the reader
    // can see going. Nor are a cylinder's own members, which the word
    // "cylinder" already covers -- what is left is the neighbouring bar the
    // mount was also holding, and that one the reader has to be told about.
    const inside = new Set<string>(
      sealed ? [sealed.barrel.id, sealed.rod.id, sealed.block.id] : []
    );
    const doomed = this.mechanism
      .linksRemovedByDeleting(joint)
      .filter((link) => !(link instanceof SliderBlock) && !inside.has(link.id));
    if (!sealed) {
      return doomed.length === 0 ? 'Delete Joint' : `Delete Joint and ${this.bodyList(doomed)}`;
    }
    return doomed.length === 0
      ? 'Delete Joint and Cylinder'
      : `Delete Joint, Cylinder and ${this.bodyList(doomed)}`;
  }

  private jointSubtitle(joint: Joint): string {
    const sealed = this.mechanism.cylinderAt(joint);
    if (sealed) {
      const end = joint.id === sealed.rodFar.id ? 'Rod joint' : 'Barrel joint';
      return `${end} · ${this.cylinderName(sealed)}`;
    }
    const bodies = joint instanceof RealJoint ? joint.links : [];
    return `${this.jointKind(joint, bodies)} · ${this.bodyList(bodies)}`;
  }

  /**
   * What kind of joint this is, in one word.
   *
   * Ordered by how much the word tells a reader: a driven joint is a driven
   * joint whether or not it is also grounded, and "tracer" is only true of a
   * free point on a single body — a ground pivot with one link is not one.
   */
  private jointKind(joint: Joint, bodies: Link[]): string {
    if (joint instanceof PrisJoint) return 'Slider';
    if (this.gridUtils.isAttachedToSlider(joint)) return 'Slider pin';
    if (joint instanceof RealJoint && joint.isWelded) return 'Welded';
    if (joint instanceof RealJoint && joint.input) return 'Driven pin';
    if (joint instanceof RealJoint && joint.ground) return 'Ground pin';
    if (bodies.length === 1) return 'Tracer';
    return 'Pin';
  }

  /**
   * The bodies a joint is on: "Links OA, ACT", or their own names where a
   * cylinder part or a block is among them and "Link" would be a lie.
   */
  private bodyList(bodies: Link[]): string {
    if (bodies.length === 0) return 'not on a link';
    const labels = bodies.map((link) => labelForBody(link, this.mechanism.cylinderAt(link)));
    const plain = labels.every((label) => label.startsWith('Link '));
    if (!plain) return labels.join(', ');
    const names = labels.map((label) => label.slice('Link '.length));
    return `${names.length === 1 ? 'Link' : 'Links'} ${names.join(', ')}`;
  }

  // ------------------------------------------------------------------ link

  private forLink(link: Link, handlers: MenuHandlers): ContextMenuModel {
    const sealed = this.mechanism.cylinderAt(link);
    const header = {
      title: sealed ? this.cylinderName(sealed) : labelForBody(link, undefined),
      subtitle: this.linkSubtitle(link, sealed),
      crossing: this.crossing(link),
    };
    if (this.tabs.isAnalysisMode()) {
      return { header, groups: [{ rows: this.positionRows(handlers, undefined) }] };
    }
    if (sealed) {
      // No Attach group at all: a sealed assembly takes no third body, and a
      // copy of one would land a second cylinder on the same joints.
      return {
        header,
        groups: [
          {
            label: 'State',
            rows: [
              new MenuRow({
                label: 'Driven Input',
                icon: 'add_input',
                kind: 'toggle',
                checked: sealed.slider.input,
                action: () => this.mechanism.toggleCylinderInput(sealed),
              }),
              this.lockRow(link as RealLink, undefined),
            ],
          },
          {
            rows: [
              new MenuRow({
                label: 'Delete Cylinder',
                icon: 'remove',
                destructive: true,
                shortcut: this.keys.keysFor('edit.delete'),
                action: () => this.mechanism.deleteCylinder(sealed),
                refusal: this.lockedRefusal(link as RealLink),
              }),
            ],
          },
        ],
      };
    }
    // A slider's block is a body in the model and not one on the drawing: it
    // has no bar to attach to and no disc to be drawn as, and the pin sitting
    // on top of it is what a reader can see and click. Not reachable by
    // pointer -- the block's hitbox hands back its pin -- but the builder
    // takes any Link, and one that throws on a shape it was handed is worse
    // than one that says little.
    if (!(link instanceof RealLink)) {
      return { header, groups: [{ rows: this.positionRows(handlers, undefined) }] };
    }
    const bar = link;
    return {
      header,
      groups: [
        { label: 'Attach', rows: this.linkAttachRows(bar, handlers) },
        { label: 'State', rows: this.linkStateRows(bar) },
        { rows: [this.deleteLinkRow(bar)] },
      ],
    };
  }

  private linkAttachRows(link: RealLink, handlers: MenuHandlers): MenuRow[] {
    // A welded compound is several links; clicking its fillet rather than one
    // of them says which body the new member should join.
    const fillet: MenuRefusal | undefined =
      link.isWelded && link.lastSelectedSublink == null
        ? {
            short: 'pick a sub-link',
            long: 'This is a welded compound. Click one of the links it is made of, so the new member knows which body it joins.',
          }
        : undefined;
    const locked = this.lockedRefusal(link);
    const rows = [
      new MenuRow({
        label: 'Link',
        icon: 'new_link',
        action: () => handlers.attachLink(),
        refusal: fillet ?? locked,
      }),
      new MenuRow({
        label: 'Cylinder',
        icon: 'add_cylinder',
        action: () => handlers.attachCylinder(),
        refusal: fillet ?? locked,
      }),
      new MenuRow({
        label: 'Tracer Point',
        icon: 'add_tracer',
        action: () => handlers.attachTracerPoint(),
        refusal: fillet ?? locked,
      }),
      // A force does not move the geometry, so a locked link still takes one.
      new MenuRow({
        label: 'Force',
        icon: 'add_force',
        action: () => handlers.attachForce(link),
        refusal: fillet,
      }),
    ];
    rows.push(
      new MenuRow({
        label: 'Duplicate Link',
        icon: 'content_copy',
        material: true,
        action: () => this.mechanism.duplicateLink(link),
        tip: 'Set a free-standing copy of this link down beside it.',
        // A welded compound is several links and the welds between them, so
        // there is no single link for this to copy. Greyed rather than
        // hidden: copying one is a thing a reader can reasonably expect, and
        // the row says which link to ask instead.
        refusal: this.mechanism.canDuplicate(link)
          ? undefined
          : {
              short: 'welded compound',
              long: 'This is several links welded together. Copy one of the links it is made of instead.',
            },
      })
    );
    return rows;
  }

  private linkStateRows(link: RealLink): MenuRow[] {
    return [
      new MenuRow({
        label: 'Drawn as a Disc',
        icon: 'make_circular',
        kind: 'toggle',
        checked: link.isCircle,
        action: () => this.mechanism.toggleLinkCircular(),
        // Only where there is a fixed pin to draw the disc about — a crank.
        refusal: link.canBeCircular()
          ? undefined
          : {
              short: 'needs a fixed pin',
              long: 'A disc is the shape a link sweeps about a fixed pin, and this link turns about none.',
            },
      }),
      this.lockRow(link, undefined),
    ];
  }

  private deleteLinkRow(link: RealLink): MenuRow {
    // Deleting a link sweeps up the joints no other link holds. The row counts
    // them and names them rather than opening a dialog after the click.
    const orphans = this.mechanism.jointsOrphanedByDeleting(link);
    const named = orphans.map((joint) => this.nameOf(joint)).join(', ');
    const label =
      orphans.length === 0
        ? 'Delete Link'
        : `Delete Link and ${orphans.length === 1 ? 'Joint' : 'Joints'} ${named}`;
    return new MenuRow({
      label,
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      action: () => this.mechanism.deleteLink(),
      refusal: this.lockedRefusal(link),
    });
  }

  private linkSubtitle(link: Link, sealed: Cylinder | undefined): string {
    // A slider's block has no subsets and no bar to describe.
    if (!sealed && !(link instanceof RealLink)) {
      const joints = link.joints.map((joint) => this.nameOf(joint)).join(', ');
      return `Block · Joints ${joints}`;
    }
    // Not "sealed assembly": to a reader a cylinder is one part, and how it
    // is built out of a slider and a weld underneath is not their business.
    if (sealed) {
      const ends = [sealed.barrelFar, sealed.rodFar].map((joint) => this.nameOf(joint));
      return `Barrel and rod · Joints ${ends.join(', ')}`;
    }
    const bar = link as RealLink;
    const kind = bar.subset.length > 0 ? 'Compound' : 'Bar';
    const joints = bar.joints.map((joint) => this.nameOf(joint)).join(', ');
    const locked = this.mechanism.isLockedTarget(bar) ? ' · locked' : '';
    return `${kind} · Joints ${joints}${locked}`;
  }

  // ----------------------------------------------------------------- force

  private forForce(force: Force): ContextMenuModel {
    const header = {
      title: `Force ${force.name || force.id}`,
      subtitle: `On ${labelForBody(force.link, undefined)} · ${force.local ? 'local' : 'global'} frame`,
      crossing: this.crossing(force),
    };
    if (this.tabs.isAnalysisMode()) return { header, groups: [] };
    return {
      header,
      groups: [
        {
          label: 'Set',
          rows: [
            new MenuRow({
              label: 'Reverse Direction',
              icon: 'switch_force_dir',
              action: () => this.mechanism.changeForceDirection(),
            }),
          ],
        },
        {
          label: 'State',
          rows: [
            // "Make Force Global" was a verb whose label flipped as it was
            // used. The frame is a state, so it reads as one.
            new MenuRow({
              label: 'Global Frame',
              // The app's own force_global glyph carries its own colours, so
              // it stays blue on an unticked row and reads as already on --
              // the one icon in the menu that does not take the row's colour.
              icon: 'public',
              material: true,
              kind: 'toggle',
              checked: !force.local,
              action: () => this.mechanism.changeForceLocal(),
            }),
            this.lockRow(force, undefined),
          ],
        },
        {
          rows: [
            new MenuRow({
              label: 'Delete Force',
              icon: 'remove',
              destructive: true,
              shortcut: this.keys.keysFor('edit.delete'),
              action: () => this.mechanism.deleteForce(force),
              refusal: this.lockedRefusal(force),
            }),
          ],
        },
      ],
    };
  }

  // ----------------------------------------------------------------- locks

  private lockRow(target: RealJoint | RealLink | Force, joint: RealJoint | undefined): MenuRow {
    const locked = this.mechanism.isLockedTarget(target);
    // A joint can be held still without carrying a mark of its own: the marks
    // on its neighbours close over it. The switch says so and names them,
    // because the fix is on them rather than here.
    const held = joint && !locked ? this.heldRefusal(joint) : undefined;
    return new MenuRow({
      label: 'Locked',
      icon: 'lock',
      kind: 'toggle',
      checked: locked || !!held,
      shortcut: this.keys.keysFor('edit.lock'),
      action: () => this.mechanism.toggleLock(target),
      refusal: held,
    });
  }

  /**
   * Why nothing can be attached to this joint: it is locked, or something
   * locked elsewhere holds it.
   *
   * Locking a link marks its own joints, so most of the time a held joint is
   * a locked joint and its own switch is the fix. The marks land elsewhere
   * only where the closure reaches — a slider's block, a sealed cylinder —
   * and there the reason has to name them, because the fix is on them.
   */
  private frozenRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.mechanism.isLockedTarget(joint)) {
      return {
        short: 'unlock first',
        long: 'This joint is locked. Unlock it before attaching anything to it.',
      };
    }
    return this.heldRefusal(joint);
  }

  /** The marks that hold this joint still, when none of them is its own. */
  private heldRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.mechanism.isLockedTarget(joint)) return undefined;
    const holders = this.gridUtils.locksHolding(joint);
    if (holders.length === 0) return undefined;
    const named = holders.map((held) => this.nameOf(held as Joint | Force)).join(', ');
    return {
      short: `held by ${named}`,
      long: `${holders.length === 1 ? 'A lock' : 'Locks'} on ${named} ${holders.length === 1 ? 'holds' : 'hold'} this joint still. Unlock ${holders.length === 1 ? 'it' : 'them'} to move it.`,
    };
  }

  /**
   * Why a locked part will not delete — the service's own rule, so the row and
   * the Delete key refuse the same thing for the same reason.
   */
  private lockedRefusal(target: RealJoint | RealLink | Force): MenuRefusal | undefined {
    const why = this.mechanism.deleteRefusal(target);
    return why ? { short: 'unlock first', long: why } : undefined;
  }

  // ---------------------------------------------------------------- shared

  /**
   * The way into the other mode, as one icon beside the target's name.
   *
   * A row of its own would cost height on every menu; this costs none. In the
   * analysis modes it goes back to Edit, which is where the geometry can be
   * changed; in Edit it goes to Kinematic Analysis, and greys with the
   * readiness reason when there is nothing that can be analysed yet.
   */
  private crossing(part: Joint | Link | Force) {
    if (this.tabs.isAnalysisMode()) {
      return {
        icon: 'edit_outline',
        tip: this.keys.tip('Edit', 'mode.edit'),
        action: () => this.tabs.setTab(TabID.EDIT),
      };
    }
    return {
      icon: 'query_stats',
      material: true,
      tip: this.keys.tip('Kinematic Analysis', 'mode.kinematic'),
      action: () => this.tabs.setTab(TabID.ANALYZE),
      refusal: this.analysisRefusal(part),
    };
  }

  /**
   * Why *this part* cannot be analysed — its own machine's answer, not the
   * drawing's.
   *
   * A grid can hold a four-bar that runs beside a half-drawn chain that does
   * not, and asking "is anything here analysable" would offer the crossing
   * from the half-drawn one on the strength of the four-bar next to it. The
   * modes themselves would then grey that part out on arrival, which is an
   * offer taken back after it was accepted.
   */
  private analysisRefusal(part: Joint | Link | Force): MenuRefusal | undefined {
    if (this.mechanism.isPartSimulatable(part)) return undefined;
    const readiness = this.mechanism.readinessOfPart(part);
    if (!readiness) {
      return {
        short: 'not in a mechanism',
        long: 'This part is not joined into a mechanism that can be analysed. Connect it to a grounded chain.',
      };
    }
    const several = this.mechanism.partitions.length > 1;
    const blocker = readiness.checks.find((check) => check.state === 'blocker');
    return {
      // Named when there is more than one machine on the grid: "not ready" on
      // a drawing holding two of them does not say which one is meant.
      short: several ? `${readiness.id} is not ready` : 'not ready',
      long: blocker
        ? `${blocker.title}. ${blocker.body}`
        : `${several ? readiness.id : 'This mechanism'} cannot be analysed yet.`,
    };
  }

  /**
   * Nothing that edits the mechanism while it is parked away from the start.
   *
   * The pose on screen mid-cycle is a solved copy of the drawing, so an edit
   * made there would write that pose back into it. The rows that do not touch
   * the mechanism — the trace, the positions, the way into another mode — are
   * untouched, and the rest say what to do about it rather than vanishing.
   */
  private freezeWhileRunning(model: ContextMenuModel): ContextMenuModel {
    const running = this.mechanism.isPlaying;
    if (!running && this.mechanism.mechanismTimeStep === 0) return model;
    const refusal: MenuRefusal = running
      ? { short: 'animation running', long: 'Pause the animation to change the mechanism.' }
      : {
          short: 'not at the start',
          long: 'The mechanism is parked mid-cycle. Return it to the start to change it.',
        };
    model.groups.forEach((group) =>
      group.rows.forEach((row) => {
        if (!row.alwaysAllowed && !row.refusal) row.refusal = refusal;
      })
    );
    return model;
  }

  private nameOf(part: Joint | Force): string {
    return (part as { name?: string }).name || part.id;
  }

  private cylinderName(sealed: Cylinder): string {
    return `Cylinder ${this.nameOf(sealed.barrelFar)}${this.nameOf(sealed.rodFar)}`;
  }
}
