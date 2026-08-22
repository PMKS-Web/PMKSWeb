import { Injectable, inject } from '@angular/core';
import { Coord } from 'src/app/model/coord';
import { SettingsService } from '../settings.service';
import { SvgGridService } from '../svg-grid.service';
import { ColorService } from '../color.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { SynthesisSolutionService } from './synthesis-solution.service';
import { solveFourBar, endLetters } from './synthesis-candidates';
import { COR } from './synthesis-util';

/** A bar drawn on the grid: two pins, a fill, and what it is called. */
export interface PoseBar {
  id: number;
  /** The bar's outline -- the same capsule every link on this canvas wears. */
  d: string;
  /** A chevron inside the bar, pointing from its back end to its front. */
  arrow: string;
  /** The point the coordinates describe, and the point it turns about. */
  refX: number;
  refY: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fill: string;
  selected: boolean;
}

/** A word beside a position, saying what the chosen linkage does with it. */
export interface PoseChip {
  id: number;
  x: number;
  y: number;
  text: string;
  dot: string;
  selected: boolean;
  /** How wide the pill behind the words has to be, in screen pixels. */
  width: number;
}

export interface Handle {
  id: string;
  x: number;
  y: number;
  cursor: string;
}

export interface SelectionBox {
  /** Degrees, applied about the position's own point. */
  rotate: string;
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the turn knob sits, on its stalk above the bar. */
  knobX: number;
  knobY: number;
  /**
   * Where the length handles sit, on the bar's own axis.
   *
   * One at the end away from the fixed reference, so that pulling it lengthens
   * the bar and leaves the reference where it was -- which is the whole promise
   * of naming a reference. Two when the reference is the middle, because then
   * neither end is fixed and both are equally the end to pull.
   */
  lengthGrips: { x: number; y: number }[];
  grip: number;
}

export interface PreviewLink {
  /** The bar's outline, drawn exactly as the drawing draws a link. */
  d: string;
  color: string;
}

export interface PreviewJoint {
  id: string;
  x: number;
  y: number;
  /** Whether this pin carries the input, so it wears the motor's mark. */
  input?: boolean;
}

const REACH_GREEN = '#bfe0c0';
const REACH_AMBER = '#f6dcb0';
const SELECT_AMBER = '#ffc107';
const NEUTRAL_BAR = '#c5cae9';

/**
 * A bar between two pins, as a filled outline.
 *
 * The same shape `RealLink` computes for a two-joint link, at the same radius
 * -- a quarter of the object scale -- so a position and a previewed solution
 * are drawn to the dimensions the drawing itself uses. They were strokes on a
 * line before, which matched by arithmetic rather than by construction and
 * looked subtly unlike every other bar on the canvas.
 */
/**
 * Which way round a position is, drawn inside it.
 *
 * A capsule is unchanged by turning it half a revolution, so a position that
 * had been flipped end for end looked exactly like one that had not -- and a
 * design that solves perfectly once a position is turned 180 degrees is
 * impossible to spot when the wrong drawing and the right one are the same
 * picture. Shaping the outline solved that and cost more than it was worth:
 * the bars stopped looking like the links they are. So the silhouette is a
 * plain capsule again and the direction is said inside it, with a chevron
 * pointing from the back end to the front -- the way a drawing normally says
 * which way round something goes.
 */
function directionMark(x1: number, y1: number, x2: number, y2: number, r: number): string {
  const theta = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.hypot(x2 - x1, y2 - y1);
  // A short bar has no room for a chevron inside it, and one drawn anyway
  // would be bigger than the link it is meant to annotate.
  if (length < r * 3) return '';
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const nx = -uy;
  const ny = ux;
  // Two thirds of the way along, so it reads as pointing at the front end
  // rather than sitting in the middle of the bar.
  // Three quarters of the way along, clear of the datum that marks the middle
  // when the reference is Center, and plainly nearer the end it points at.
  const cx = x1 + ux * length * 0.75;
  const cy = y1 + uy * length * 0.75;
  const reach = r * 0.6;
  const wing = r * 0.66;
  const tipX = cx + ux * reach;
  const tipY = cy + uy * reach;
  const backX = cx - ux * reach;
  const backY = cy - uy * reach;
  return (
    `M ${backX + nx * wing} ${backY + ny * wing} ` +
    `L ${tipX} ${tipY} ` +
    `L ${backX - nx * wing} ${backY - ny * wing}`
  );
}

function capsulePath(x1: number, y1: number, x2: number, y2: number, r: number): string {
  const theta = Math.atan2(y2 - y1, x2 - x1);
  const nx = r * Math.sin(theta);
  const ny = r * Math.cos(theta);
  return (
    `M ${x1 - nx} ${y1 + ny} ` +
    `A ${r} ${r} 0 1 1 ${x1 + nx} ${y1 - ny} ` +
    `L ${x2 + nx} ${y2 - ny} ` +
    `A ${r} ${r} 0 1 1 ${x2 - nx} ${y2 + ny} Z`
  );
}

/**
 * What Synthesis draws on the grid, and what the pointer does to it.
 *
 * Kept out of NewGridComponent because none of it is about the mechanism: the
 * positions are a question, the preview is an answer that is not in the
 * drawing yet, and neither earns an undo entry or a rebuild. The grid supplies
 * model-space points and this decides what they mean.
 */
@Injectable({ providedIn: 'root' })
export class SynthesisCanvasService {
  private settings = inject(SettingsService);
  private svgGrid = inject(SvgGridService);
  private design = inject(SynthesisBuilderService);
  private solution = inject(SynthesisSolutionService);
  private colors = inject(ColorService);

  /** Where the pointer last was, in model coordinates. */
  public cursor: Coord | undefined;

  private drag:
    | {
        kind: 'pose';
        id: number;
        mode: 'move' | 'rotate' | 'length';
        dx: number;
        dy: number;
        grabAngleOffset: number;
      }
    | {
        kind: 'region';
        mode: 'move' | 'corner' | 'draw';
        corner?: string;
        dx: number;
        dy: number;
        originX: number;
        originY: number;
      }
    | undefined;

  get dragging(): boolean {
    return this.drag !== undefined;
  }

  // --- what is drawn -------------------------------------------------------

  /** Half the thickness a pose bar is drawn at, in model units. */
  private barHalfWidth(): number {
    return 0.25 * this.settings.objectScale;
  }

  poseBars(): PoseBar[] {
    const cand = this.solution.chosen();
    return this.design.getAllPoses().map((pose) => {
      const reached = cand ? cand.onBranch[pose.id - 1] : undefined;
      return {
        id: pose.id,
        d: capsulePath(
          pose.posBack.x,
          pose.posBack.y,
          pose.posFront.x,
          pose.posFront.y,
          this.settings.objectScale / 4
        ),
        arrow: directionMark(
          pose.posBack.x,
          pose.posBack.y,
          pose.posFront.x,
          pose.posFront.y,
          this.settings.objectScale / 4
        ),
        refX: pose.position.x,
        refY: pose.position.y,
        x1: pose.posBack.x,
        y1: pose.posBack.y,
        x2: pose.posFront.x,
        y2: pose.posFront.y,
        fill: reached === undefined ? NEUTRAL_BAR : reached ? REACH_GREEN : REACH_AMBER,
        selected: this.design.selectedPose === pose.id,
      };
    });
  }

  poseChips(): PoseChip[] {
    const cand = this.solution.chosen();
    return this.design.getAllPoses().map((pose) => {
      const reached = cand ? cand.onBranch[pose.id - 1] : undefined;
      const far = pose.posBack.x > pose.posFront.x ? pose.posBack : pose.posFront;
      const text =
        reached === undefined ? 'position ' + pose.id : reached ? 'reached' : 'needs reassembly';
      return {
        id: pose.id,
        x: far.x + 0.5 * this.settings.objectScale,
        y: Math.max(pose.posBack.y, pose.posFront.y) + 0.75 * this.settings.objectScale,
        text,
        dot: reached === undefined ? '#8a90a0' : reached ? '#43a047' : '#f5a623',
        selected: this.design.selectedPose === pose.id,
        // Estimated rather than measured: SVG cannot report a text width before
        // it is laid out, and this only has to be wide enough that the pill
        // does not clip the words. Roboto Medium at 13px runs a little over
        // half its size per character, plus the numbered dot and its padding.
        width: 30 + text.length * 6.9,
      };
    });
  }

  /**
   * The handles on the selected position.
   *
   * The same shape the tracing underlay wears -- a dashed box, four corner
   * grips and a knob on a stalk -- because it is the same gesture: something
   * on the grid that is being placed rather than built. Its corners pull the
   * end-effector length rather than a scale, since that is the one dimension
   * a position has.
   */
  selectionBox(): SelectionBox | undefined {
    const id = this.design.selectedPose;
    if (!this.design.isPoseDefined(id)) return undefined;
    const pose = this.design.getPose(id);
    const grip = this.svgGrid.scaleWithZoom(9);
    const pad = this.svgGrid.scaleWithZoom(12);
    const length = this.design.length;
    const ahead = this.design.COR === COR.CENTER ? length / 2 + pad : length + pad;
    const behind = this.design.COR === COR.CENTER ? length / 2 + pad : pad;
    const half = this.settings.objectScale / 4 + pad / 2;
    // Model coordinates throughout, y up. The grid draws this inside its own
    // y-flip, so the flip is already accounted for.
    const cx = pose.position.x;
    const cy = pose.position.y;
    const x = cx - (this.design.COR === COR.FRONT ? ahead : behind);
    const w = ahead + behind;
    const y = cy - half;
    const h = half * 2;
    return {
      // Inside the flip, +y is up, which is the sense a positive angle turns in.
      rotate: `rotate(${pose.thetaDegrees.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})`,
      cx,
      cy,
      x,
      y,
      w,
      h,
      // One handle per thing that can be changed, and each one where the change
      // happens. Four corners said "scale me in two directions and maybe turn
      // me", which is three promises this gesture does not keep: a position has
      // a place, a heading, and one length. So the body is the place, a knob
      // above it is the heading, and a single grip off the front end -- on the
      // bar's own axis, which is the direction it actually pulls -- is the
      // length.
      knobX: x + w / 2,
      knobY: y + h + this.svgGrid.scaleWithZoom(30),
      lengthGrips: this.lengthGripsFor(x, w, cy),
      grip,
    };
  }

  /**
   * Which end of the bar the length is pulled from.
   *
   * The end away from the fixed reference, so the reference stays put while the
   * bar grows past it -- a grip on the reference itself would drag the one
   * point the reader has said should not move. With the reference in the
   * middle, the bar grows both ways whichever end is pulled, so both ends get
   * one and neither is the odd one out.
   */
  private lengthGripsFor(x: number, w: number, cy: number): { x: number; y: number }[] {
    const front = { x: x + w, y: cy };
    const back = { x, y: cy };
    if (this.design.COR === COR.FRONT) return [back];
    if (this.design.COR === COR.CENTER) return [back, front];
    return [front];
  }

  /**
   * The bar about to be dropped: same length, same reference point, turned the
   * way the wheel has turned it. A promise about what the click will make.
   */
  ghostBar(): { d: string; arrow: string } | undefined {
    if (!this.design.armed || !this.cursor || this.design.regionDraw) return undefined;
    if (this.design.getFirstUndefinedPose() === undefined) return undefined;
    const theta = (this.design.placeAngleDeg * Math.PI) / 180;
    const length = this.design.length;
    const dx = Math.cos(theta) * length;
    const dy = Math.sin(theta) * length;
    const anchor =
      this.design.COR === COR.BACK
        ? { x: this.cursor.x, y: this.cursor.y }
        : this.design.COR === COR.FRONT
          ? { x: this.cursor.x - dx, y: this.cursor.y - dy }
          : { x: this.cursor.x - dx / 2, y: this.cursor.y - dy / 2 };
    return {
      d: capsulePath(
        anchor.x,
        anchor.y,
        anchor.x + dx,
        anchor.y + dy,
        this.settings.objectScale / 4
      ),
      arrow: directionMark(
        anchor.x,
        anchor.y,
        anchor.x + dx,
        anchor.y + dy,
        this.settings.objectScale / 4
      ),
    };
  }

  /** The angle the ghost is turned to, for the hint beside the pointer. */
  ghostAngleLabel(): string {
    return Math.round(((this.design.placeAngleDeg % 360) + 360) % 360) + '°';
  }

  /**
   * Whether the proposal is still a proposal.
   *
   * Once it has been inserted the drawing holds the real thing, and drawing the
   * preview over it puts two linkages in the same place -- one of which cannot
   * be clicked, which is a worse way to learn that than being told.
   */
  private previewing(): boolean {
    // Or the drawing holds a different answer than the one being looked at.
    // Suppressing on `inserted` alone meant that after inserting A, choosing B
    // left A standing solid on the grid while the panel said B and offered to
    // replace it -- so B went in having never been shown.
    return !this.solution.inserted || this.solution.needsReinsert();
  }

  /** The chosen candidate, drawn where the preview has been scrubbed to. */
  previewLinks(): PreviewLink[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    const r = this.settings.objectScale / 4;
    const bar = (a: Coord, b: Coord, colorIndex: number): PreviewLink => ({
      d: capsulePath(a.x, a.y, b.x, b.y, r),
      // The colours the linkage will actually be built in, asked of the same
      // service `insert` asks, so the preview cannot promise one thing and the
      // drawing deliver another.
      color: this.colors.getLinkColorFromIndex(colorIndex),
    });
    const links = [
      bar(solved.A, solved.B, 0),
      bar(solved.B, solved.C, 1),
      bar(solved.C, solved.D, 0),
    ];
    const dyad = this.solution.dyad();
    // The elbow the six-bar solve already found, rather than one worked out
    // again from the pin: solving the same joint twice is what let the driver's
    // two links vanish for a frame whenever the second answer disagreed.
    if (dyad && solved.elbow) {
      links.push(bar(dyad.ground, solved.elbow, 2));
      links.push(bar(solved.elbow, solved.B, 3));
    }
    return links;
  }

  previewJoints(): PreviewJoint[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    // The letters these pins will be built under, which follow the pins rather
    // than the fields: reading from the far pin puts pin D in the field called
    // A, and labelling by the field renamed half the linkage every time the
    // drive end changed.
    const letter = this.solution.previewLetters();
    const out: PreviewJoint[] = [
      { id: letter.A, x: solved.A.x, y: solved.A.y },
      { id: letter.B, x: solved.B.x, y: solved.B.y },
      { id: letter.C, x: solved.C.x, y: solved.C.y },
      { id: letter.D, x: solved.D.x, y: solved.D.y },
    ];
    const dyad = this.solution.dyad();
    if (dyad && solved.elbow) {
      out.push({ id: letter.E, x: dyad.ground.x, y: dyad.ground.y });
      out.push({ id: letter.F, x: solved.elbow.x, y: solved.elbow.y });
    }
    return out;
  }

  /** Which of the preview's pins are bolted to the frame. */
  /**
   * Which of the preview's pins are bolted to the frame, and which one turns.
   *
   * The input mark is the whole visible answer to "Driven from": without it,
   * swapping the drive pin rearranged nothing a reader could see and the
   * control looked broken. With a driver fitted neither ground pin is the
   * input at all -- the motor sits on the driver's own ground -- which is
   * itself worth being able to see.
   */
  previewGrounds(): PreviewJoint[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    const dyad = this.solution.dyad();
    const letter = this.solution.previewLetters();
    const out: PreviewJoint[] = [
      { id: letter.A, x: solved.A.x, y: solved.A.y, input: !dyad },
      { id: letter.D, x: solved.D.x, y: solved.D.y, input: false },
    ];
    if (dyad) out.push({ id: letter.E, x: dyad.ground.x, y: dyad.ground.y, input: true });
    return out;
  }

  /** Where the middle of the coupler goes over the whole of the travel. */
  couplerTrace(): string {
    const cand = this.previewing() ? this.solution.driven() : null;
    if (!cand) return '';
    /*
      Sampled through the same solve the preview itself uses.

      This asked the *four-bar* where it would be at each angle, while the range
      it was stepping belonged to the *driver's* crank -- two different cranks,
      so the angles meant nothing to the solver they were handed to. Where they
      happened not to close it skipped the sample and carried on with a line,
      ruling a straight edge across a region the linkage never visits. That is
      the flat side on an otherwise curved path.
    */
    const range = this.solution.drivenRange();
    const span = range.to - range.from;
    // Fine enough that a stretch the coupler crosses quickly is drawn as the
    // path it takes rather than as one long chord across it.
    const STEPS = 240;
    let d = '';
    let lifted = true;
    for (let k = 0; k <= STEPS; k++) {
      const solved = this.solution.poseAtPhase(range.from + (span * k) / STEPS);
      // A phase that will not close is a hole in the travel, not a shortcut
      // over it: the pen lifts rather than drawing across.
      if (!solved) {
        lifted = true;
        continue;
      }
      const midX = (solved.B.x + solved.C.x) / 2;
      const midY = (solved.B.y + solved.C.y) / 2;
      d += (lifted ? (d ? ' M ' : 'M ') : ' L ') + midX.toFixed(1) + ' ' + midY.toFixed(1);
      lifted = false;
    }
    return d;
  }

  /**
   * The candidate that is picked, faded, while another is being hovered.
   *
   * Without it, moving along the gallery replaces the linkage on the grid with
   * no way to see what it replaced -- which is the one comparison the gallery
   * exists to make.
   */
  hoverGhostLinks(): PreviewLink[] {
    if (!this.previewing()) return [];
    const hovering = this.solution.hoverKey;
    const picked = this.solution.picked();
    if (!hovering || !picked || picked.key === hovering) return [];
    const base = this.solution.driven(picked);
    if (!base) return [];
    const solved = solveFourBar(base, base.thetas[0], base.sign);
    if (!solved) return [];
    const r = this.settings.objectScale / 4;
    const ghost = (a: Coord, b: Coord): PreviewLink => ({
      d: capsulePath(a.x, a.y, b.x, b.y, r),
      color: '#9aa0ac',
    });
    return [ghost(solved.A, solved.B), ghost(solved.B, solved.C), ghost(solved.C, solved.D)];
  }

  /** The ground-pivot region, in model coordinates like everything else here. */
  regionBox(): { x: number; y: number; w: number; h: number; corners: Handle[] } | undefined {
    if (!this.design.constrain) return undefined;
    const r = this.design.region;
    const grip = this.svgGrid.scaleWithZoom(10);
    const cursors: Record<string, string> = {
      tl: 'nwse-resize',
      tr: 'nesw-resize',
      bl: 'nesw-resize',
      br: 'nwse-resize',
    };
    return {
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      corners: [
        { id: 'tl', x: r.x, y: r.y + r.h },
        { id: 'tr', x: r.x + r.w, y: r.y + r.h },
        { id: 'bl', x: r.x, y: r.y },
        { id: 'br', x: r.x + r.w, y: r.y },
      ].map((c) => ({ ...c, cursor: cursors[c.id], x: c.x - grip / 2, y: c.y - grip / 2 })),
    };
  }

  // --- gestures ------------------------------------------------------------

  /** Take hold of a position, to slide it, turn it, or stretch the link. */
  grabPose(at: Coord, id: number, mode: 'move' | 'rotate' | 'length'): void {
    if (!this.design.isPoseDefined(id)) return;
    const pose = this.design.getPose(id);
    this.design.selectedPose = id;
    this.design.setArmed(false);
    this.solution.interactive = true;
    this.drag = {
      kind: 'pose',
      id,
      mode,
      dx: at.x - pose.position.x,
      dy: at.y - pose.position.y,
      grabAngleOffset:
        (Math.atan2(at.y - pose.position.y, at.x - pose.position.x) * 180) / Math.PI -
        pose.thetaDegrees,
    };
  }

  grabRegion(at: Coord, mode: 'move' | 'corner' | 'draw', corner?: string): void {
    const r = this.design.region;
    this.drag = {
      kind: 'region',
      mode,
      corner,
      dx: at.x - r.x,
      dy: at.y - r.y,
      originX: at.x,
      originY: at.y,
    };
    if (mode === 'draw') this.design.region = { x: at.x, y: at.y, w: 0, h: 0 };
    this.solution.interactive = true;
  }

  /** Follow the pointer. Returns whether a gesture consumed the move. */
  move(at: Coord): boolean {
    this.cursor = at;
    const drag = this.drag;
    if (!drag) return false;

    if (drag.kind === 'pose') {
      const pose = this.design.getPose(drag.id);
      if (drag.mode === 'rotate') {
        const angle =
          (Math.atan2(at.y - pose.position.y, at.x - pose.position.x) * 180) / Math.PI -
          drag.grabAngleOffset;
        pose.thetaDegrees = angle;
      } else if (drag.mode === 'length') {
        // A corner pulls along the link's own axis, not along the screen: the
        // one dimension a position has is how long the end-effector is.
        const theta = pose.thetaRadians;
        const along = Math.abs(
          (at.x - pose.position.x) * Math.cos(theta) + (at.y - pose.position.y) * Math.sin(theta)
        );
        const factor = this.design.COR === COR.CENTER ? 2 : 1;
        this.design.length = Math.max(this.settings.objectScale * 0.5, along * factor);
      } else {
        pose.position = new Coord(at.x - drag.dx, at.y - drag.dy);
      }
      this.design.valueChanges.next(true);
      return true;
    }

    if (drag.mode === 'move') {
      this.design.region = {
        ...this.design.region,
        x: at.x - drag.dx,
        y: at.y - drag.dy,
      };
    } else if (drag.mode === 'draw') {
      this.design.region = {
        x: Math.min(drag.originX, at.x),
        y: Math.min(drag.originY, at.y),
        w: Math.abs(at.x - drag.originX),
        h: Math.abs(at.y - drag.originY),
      };
    } else {
      const r = this.design.region;
      // The corner opposite the one being pulled is what stays put.
      const fixedX = drag.corner === 'tl' || drag.corner === 'bl' ? r.x + r.w : r.x;
      const fixedY = drag.corner === 'bl' || drag.corner === 'br' ? r.y + r.h : r.y;
      this.design.region = {
        x: Math.min(fixedX, at.x),
        y: Math.min(fixedY, at.y),
        w: Math.max(this.settings.objectScale, Math.abs(at.x - fixedX)),
        h: Math.max(this.settings.objectScale, Math.abs(at.y - fixedY)),
      };
    }
    this.design.valueChanges.next(true);
    return true;
  }

  /** Let go. Returns whether anything was in flight. */
  release(): boolean {
    const had = this.drag !== undefined;
    this.drag = undefined;
    // The search was held still through the gesture; let it catch up now.
    this.solution.interactive = false;
    if (this.design.regionDraw) this.design.regionDraw = false;
    return had;
  }

  /** Turn the position that has not been dropped yet. */
  turnGhost(deltaY: number): void {
    this.design.placeAngleDeg += deltaY > 0 ? -5 : 5;
  }
}
