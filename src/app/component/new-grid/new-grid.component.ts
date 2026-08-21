import { SvgGridService } from '../../services/svg-grid.service';
import {
  OnDestroy,
  Component,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  inject,
  viewChild,
} from '@angular/core';
import { fromEvent } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { TutorialService } from '../../services/tutorial.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { ContextMenuModel, trackContextMenuPointer } from '../context-menu/menu-model';
import {
  ContextMenuBuilderService,
  MenuHandlers,
} from '../../services/context-menu-builder.service';
import { Link, RealLink, SliderBlock } from '../../model/link';
import { Lockable } from '../../model/lock-set';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import {
  forceStates,
  gridStates,
  has_mouse_pointer,
  jointStates,
  linkStates,
  local_storage_available,
  getDistance,
  AngleUnit,
  radToDeg,
  point_on_line_segment_closest_to_point,
} from '../../model/utils';
import { Force } from '../../model/force';
import { NotificationService } from '../../services/notification.service';
import { BackgroundImageService, MIN_WIDTH } from '../../services/background-image.service';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { MatDialog } from '@angular/material/dialog';
import { TouchscreenWarningComponent } from '../MODALS/touchscreen-warning/touchscreen-warning.component';
import { Line } from '../../model/line';
import { SaveHistoryService } from 'src/app/services/save-history.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { SynthesisPose } from 'src/app/services/synthesis/synthesis-util';
import { SynthesisCanvasService } from 'src/app/services/synthesis/synthesis-canvas.service';
import { SynthesisSolutionService } from 'src/app/services/synthesis/synthesis-solution.service';
import { ColorService } from '../../services/color.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { EditPanelComponent } from '../edit-panel/edit-panel.component';
import { DragStateService } from '../../services/drag-state.service';
import {
  Channel,
  CylinderMark,
  Guide,
  RiderDraw,
  SliderMark,
  SliderMarkService,
  WeldPlate,
} from '../../services/slider-mark.service';
import {
  barrelPath,
  cylinderBlockPath,
  GROUND_STROKE,
  MARK,
  orientedCapsulePath,
  plusPath,
  rodBodyPath,
  slotHalfLength,
  motorBodyPath,
  motorBodyAt,
  Segment,
} from '../../model/joint-marks';
import {
  JointDropCandidate,
  MERGE_REFUSAL_MESSAGES,
  MergeRefusal,
  resolveDropCandidate,
  resolveSlotDropTarget,
  SlotDropCandidate,
} from '../../model/drop-target';
import { mergedChannels, transformRigidPath } from '../../model/compound-link-path';
import {
  Cylinder,
  cylinderCreationLayout,
  cylinderHeadHalf,
  cylinderSizeOf,
  cylinderSpanRange,
  cylinderJoints,
  isCylinderInterior as isCylinderInteriorOf,
} from '../../model/cylinder';
import { SnapGuide, snapToAxes } from '../../model/axis-snap';
import { drawDepths } from '../../model/draw-order';
import { MODEL_SCALE } from '../../model/render-scale';
import { uniformBodyOf } from '../../model/uniform-body';
import { buildCompoundPath } from '../../model/compound-link-path';

import { angleReference, GROUND_BODY, resolveActuator } from '../../model/actuator';

/** One thing to draw in the slider layer, and how deep in the stack it sits. */
export interface SlotStackItem {
  key: string;
  depth: number;
  kind: 'block' | 'plate' | 'rider';
  mark: SliderMark;
  /** Set for a rider; the link this item draws. */
  rider?: RiderDraw;
  /** Set for a plate; the fused rider-and-block outline this item draws. */
  plate?: WeldPlate;
}
import { SvgArrowComponent } from '../svg-arrow/svg-arrow.component';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';

/** Which corner of the tracing underlay a resize gesture is holding. */
type BackgroundImageCorner = 'tl' | 'tr' | 'bl' | 'br';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CdkContextMenuTrigger, ContextMenuComponent],
})
export class NewGridComponent implements OnDestroy {
  svgGrid = inject(SvgGridService);
  mechanismSrv = inject(MechanismService);
  private tutorial = inject(TutorialService);
  private urlParser = inject(UrlProcessorService);
  gridUtils = inject(GridUtilsService);
  settings = inject(SettingsService);
  activeObjService = inject(ActiveObjService);
  private tabService = inject(SelectedTabService);
  synthesisBuilder = inject(SynthesisBuilderService);
  synthCanvas = inject(SynthesisCanvasService);
  synthSolution = inject(SynthesisSolutionService);
  notify = inject(NotificationService);
  private shortcuts = inject(KeyboardShortcutsService);
  dialog = inject(MatDialog);
  saveHistoryService = inject(SaveHistoryService);
  private colorService = inject(ColorService);
  nup = inject(NumberUnitParserService);
  dragState = inject(DragStateService);
  sliderMarks = inject(SliderMarkService);
  bgImage = inject(BackgroundImageService);
  private menuBuilder = inject(ContextMenuBuilderService);

  public static debugValue: unknown;
  static debugPoints: Coord[] = [];
  public static debugLines: Line[] = [];

  public originInScreen: Coord = new Coord(0, 0);
  private timeMouseDown: number = 0;

  constructor() {
    //This is for debug purposes, do not make anything else static!
    NewGridComponent.instance = this;
    // Ahead of the CDK's own contextmenu listener, so the menu card knows
    // which corner the pointer is in before it is measured.
    trackContextMenuPointer();
  }

  private svgGridElement!: HTMLElement;
  public cMenu: ContextMenuModel = { groups: [] };
  public lastRightClick: Joint | Link | Force | string | SynthesisPose = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  public lastLeftClick: Joint | Link | Force | string | SynthesisPose = '';
  lastLeftClickType: string = 'Nothing';

  /**
   * The joint the one being dragged would merge into on release, or undefined.
   * Read by the template to draw the snap indicator.
   */
  public snapTargetJoint?: RevJoint;
  /**
   * Whether this gesture has already said it reached the ram's floor. Reset
   * when a drag begins, so the message is per-gesture and not per-frame.
   */

  /**
   * A joint in range that will not take the merge, kept with its reason so the
   * release can say why. Drawn as a refusal marker rather than left blank: a
   * target that just goes dark reads as the drag being broken.
   */
  public refusedTarget?: JointDropCandidate;

  /** Joints playing one-shot drop feedback, by id. */
  public shakingJointID?: string;
  public poppingJointID?: string;

  /** Set when the joint being merged approached its target from the right. */
  private mergeArrowReversed = false;

  /** Where the link being dragged was last placed, in SVG coordinates. */
  private linkDragAnchor: Coord = new Coord(0, 0);

  /**
   * Where the dragged body's reference point stood when the drag began.
   *
   * Snapping needs the whole distance dragged, not this frame's part of it: a
   * single pointer event moves a few units, which rounds to no move at all, and
   * a body measured frame by frame would never leave its corner however far the
   * cursor went.
   *
   * Taken on the first move rather than at the press, because which point is
   * the reference depends on what turned out to be under the cursor -- a bar's
   * first joint, or the mount a ram is named from.
   */
  private bodyDragOrigin?: { at: Coord; from: Coord };

  //This is terrible but:
  // -2 => hidden
  // -1 => Link length and angle shown
  // 0-N => Joint length and angle shown for joint N (in list from edit panel)
  public showLinkLengthOverlay: number = -2;
  public showLinkAngleOverlay: number = -2;

  static instance: NewGridComponent;
  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;
  mouseLocation: Coord = new Coord(0, 0);
  lastMouseLocation: Coord = new Coord(0, 0);

  mouseLocationRaw: Coord = new Coord(0, 0);

  /** For template bindings that size things in user units. */
  readonly MODEL_SCALE = MODEL_SCALE;

  /**
   * A grid line's label, in the user's units. Grid lines live at internal
   * model coordinates (MODEL_SCALE times the user's unit); the label is the
   * one place that number reaches the screen, so it converts here. Rounded so
   * a binary-representation artifact of the division never shows up as
   * 0.6000000001.
   */
  axisLabel(line: number): number {
    return Math.round((line / MODEL_SCALE) * 1e6) / 1e6;
  }

  readonly contextMenu = viewChild.required<CdkContextMenuTrigger>('trigger');
  private readonly backgroundImageInput =
    viewChild.required<ElementRef<HTMLInputElement>>('backgroundImageInput');

  ngOnInit() {
    this.shortcuts.pressed.subscribe((id) => this.onShortcut(id));

    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);

    let dismissWarning = local_storage_available() && localStorage.getItem('dismiss') === 'true';

    // Touchscreen warning for when no mouse pointer
    if (!dismissWarning && !has_mouse_pointer()) {
      this.dialog.open(TouchscreenWarningComponent, {
        autoFocus: false,
      });
    }

    fromEvent(window, 'resize').subscribe((event) => {
      this.svgGrid.panZoomObject.resize();
      this.svgGrid.handlePan();
    });

    this.activeObjService.onActiveObjChange.subscribe((obj) => {
      this.showLinkAngleOverlay = -2;
      this.showLinkLengthOverlay = -2;
      // The hover previews die with the selection they described: a panel
      // swap can eat the mouseleave that would have cleared them.
      this.comMeasure = undefined;
      this.cylinderPartPreview = undefined;
      this.settings.previewCoMLinkId = null;
      //Disable focus on any text input when changing active object
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  /**
   * Whether the tutorial's current step is about this joint.
   *
   * Asked per joint rather than the ring being drawn from a coordinate, so it
   * rides the joint through a drag and cannot be left behind at an old
   * position.
   */
  isTutorialTarget(joint: Joint): boolean {
    return this.tutorial.ringJoint() === joint;
  }

  ngOnDestroy() {
    // Let go of the static. It is a debug handle, but services reach the
    // snackbar through it and it was never cleared — so a torn-down grid stayed
    // registered, and the next thing to send a notification sent it to a
    // component that no longer exists. In the app there is one grid for the
    // session and it never showed; across a test run there are many, and it
    // made unrelated specs fail depending on what had run before them.
    if (NewGridComponent.instance === this) {
      NewGridComponent.instance = undefined as unknown as NewGridComponent;
    }
  }

  ngAfterViewInit() {
    this.svgGridElement = document.getElementsByClassName(
      'svg-pan-zoom_viewport'
    )[0] as HTMLElement;
  }

  static debugGetGridState() {
    return this.instance.dragState.grid;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetJointState() {
    return this.instance.dragState.joint;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetLinkState() {
    return this.instance.dragState.link;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetForceState() {
    return this.instance.dragState.force;
    //This is for debug purposes, do not make anything else static!
  }

  /** Whether Synthesis owns the canvas: its handles, ghost and preview. */
  showSynthesis(): boolean {
    return this.tabService.getCurrentTab() === TabID.SYNTHESIZE;
  }

  /**
   * Whether the positions are on the grid at all.
   *
   * They outlive the mode. A design that has produced a linkage is the record
   * of what that linkage was *for*, and hiding it the moment the reader goes to
   * look at the motion leaves them with a machine and no account of it. Outside
   * Synthesis they are a shadow -- faint, and not in the way of anything -- and
   * the canvas menu is where they are taken away.
   */
  showSynthesisPositions(): boolean {
    return this.showSynthesis() || this.synthesisBuilder.getAllPoses().length > 0;
  }

  /** Positions drawn, but as a record rather than as controls. */
  synthesisShadowOnly(): boolean {
    return !this.showSynthesis();
  }

  /**
   * The handlers the menu needs that only the canvas can perform.
   *
   * Everything else a row does is an edit the services already own; these are
   * gestures — the next click lands the thing — and the gesture state lives
   * here, on the component that reads the pointer.
   */
  private menuHandlers(): MenuHandlers {
    return {
      attachLink: () => this.startCreatingLink(),
      attachCylinder: () => this.startCreatingCylinder(),
      attachTracerPoint: () => this.addJoint(),
      attachForce: (onLink) => this.createForce(onLink),
      backgroundImage: () => this.openBackgroundImage(),
      deletePosition: (id) => this.deleteSynthesisPosition(id),
      deleteAllPositions: () => this.deleteAllSynthesisPositions(),
    };
  }

  /** Take one position away, or all of them, and record it as one step. */
  deleteSynthesisPosition(id: number): void {
    this.synthesisBuilder.removePose(id);
    this.synthSolution.invalidate();
    this.mechanismSrv.save();
  }

  deleteAllSynthesisPositions(): void {
    this.synthesisBuilder.deleteAllPoses();
    this.synthSolution.invalidate();
    this.mechanismSrv.save();
  }

  enableGridAnimationForThisAction() {
    this.svgGridElement.setAttribute('class', 'animated');
    //Disable after 0.5 seconds
    setTimeout(() => {
      this.svgGridElement.removeAttribute('class');
    }, 300);
  }

  static getLastLeftClickType(): string {
    return this.instance.objectKind(this.instance.lastLeftClick);
  }

  private objectKind(value: Joint | Link | string | Force | SynthesisPose): string {
    if (value instanceof Force) return 'Force';
    if (value instanceof RealLink) return 'RealLink';
    if (value instanceof PrisJoint) return 'PrisJoint';
    if (value instanceof RevJoint) return 'RevJoint';
    if (value instanceof SynthesisPose) return 'SynthesisPose';
    if (typeof value === 'string' || value instanceof String) return 'String';
    return 'Unknown';
  }

  /**
   * Rebuild the menu for whatever was just right-clicked.
   *
   * The whole of the decision — which rows, which of them are switches, which
   * are greyed and why — lives in `ContextMenuBuilderService`, which reads the
   * answers out of the model that enforces them.
   */
  updateContextMenuItems() {
    this.cMenu = this.menuBuilder.build(this.lastRightClick, this.menuHandlers());
  }

  /**
   * Whether the panel is currently editing the background image.
   *
   * Every clause is a way the panel can go without the selection changing: the
   * analysis modes replace it, and playback covers it with the stop-the-
   * animation placeholder. An outline for controls that are not on screen is a
   * mark nobody can explain.
   *
   * The last one is not about the panel at all. `tempGridDisable` is the flag
   * "Fit to zoom" sets while it measures the drawing, and an outline the size
   * of the picture counts towards that box exactly as the picture would -- the
   * fit framed a hundred-centimetre photograph and left the linkage too small
   * to work on.
   */
  editingBackgroundImage(): boolean {
    return (
      this.activeObjService.objType === 'BackgroundImage' &&
      !this.tabService.isAnalysisMode() &&
      !this.mechanismSrv.isPlaying &&
      this.mechanismSrv.mechanismTimeStep === 0 &&
      !this.settings.tempGridDisable
    );
  }

  /** Half a centimetre of screen, whatever the zoom: a grabbable corner. */
  backgroundImageHandleSize(): number {
    return this.svgGrid.scaleWithZoom(10);
  }

  /** How far above the top edge the turn handle stands, at any zoom. */
  backgroundImageRotateReach(): number {
    return this.svgGrid.scaleWithZoom(34);
  }

  /**
   * The four corners, in SVG coordinates, each with the cursor that says which
   * way it pulls.
   */
  backgroundImageHandles(): { id: BackgroundImageCorner; x: number; y: number; cursor: string }[] {
    const image = this.bgImage.image();
    if (!image) return [];
    const left = this.bgImage.leftOf(image);
    const top = this.bgImage.topOf(image);
    const right = left + image.width;
    const bottom = top + this.bgImage.heightOf(image);
    return [
      { id: 'tl', x: left, y: top, cursor: 'nwse-resize' },
      { id: 'tr', x: right, y: top, cursor: 'nesw-resize' },
      { id: 'bl', x: left, y: bottom, cursor: 'nesw-resize' },
      { id: 'br', x: right, y: bottom, cursor: 'nwse-resize' },
    ];
  }

  /**
   * The gesture in flight on the picture, if there is one.
   *
   * `stopPropagation` on the press is what keeps svg-pan-zoom out of it — the
   * library binds its own handler to the canvas root, so a press that reaches
   * it starts a pan under the drag. The state lives here rather than in
   * DragStateService's enums because moving scenery is not an edit: it earns no
   * rebuild and no undo entry.
   */
  private bgDrag?: {
    corner?: BackgroundImageCorner;
    /** For a move: model-space offset from the pointer to the picture's centre. */
    grabOffset?: Coord;
    /** For a resize: the corner that stays where it is, in model coordinates. */
    anchor?: Coord;
    /** For a turn: the angle the hand grabbed at, less the picture's own. */
    grabAngleRad?: number;
  };

  startBackgroundImageMove(event: PointerEvent): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage()) return;
    event.stopPropagation();
    const at = this.svgGrid.screenToSVGfromXY(event.clientX, event.clientY);
    this.bgDrag = { grabOffset: new Coord(image.centerX - at.x, image.centerY - at.y) };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  /**
   * How far along the picture's own axes a corner sits from its centre: +1 to
   * the right and up in the picture's frame, whatever the picture is turned to.
   */
  private cornerSigns(corner: BackgroundImageCorner): { alongX: number; alongY: number } {
    return {
      alongX: corner === 'tr' || corner === 'br' ? 1 : -1,
      alongY: corner === 'tl' || corner === 'tr' ? 1 : -1,
    };
  }

  startBackgroundImageResize(event: PointerEvent, corner: BackgroundImageCorner): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage()) return;
    event.stopPropagation();
    // The opposite corner is what the drag pivots on, and it is held in world
    // coordinates: the resize moves the centre, and the picture may be turned,
    // so an anchor remembered in the picture's own frame would not stay put.
    const { alongX, alongY } = this.cornerSigns(corner);
    const axes = this.backgroundImageAxes(image);
    const halfHeight = this.bgImage.heightOf(image) / 2;
    this.bgDrag = {
      corner,
      anchor: new Coord(
        image.centerX - alongX * (image.width / 2) * axes.u.x - alongY * halfHeight * axes.v.x,
        image.centerY - alongX * (image.width / 2) * axes.u.y - alongY * halfHeight * axes.v.y
      ),
    };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  startBackgroundImageRotate(event: PointerEvent): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage()) return;
    event.stopPropagation();
    const at = this.svgGrid.screenToSVGfromXY(event.clientX, event.clientY);
    // What the hand grabbed at, less what the picture already is: the drag then
    // turns the picture with the hand rather than snapping it to the pointer.
    this.bgDrag = {
      grabAngleRad: Math.atan2(at.y - image.centerY, at.x - image.centerX) - image.rotationRad,
    };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  /** The picture's own axes in model coordinates: along its width, and up it. */
  private backgroundImageAxes(image: { rotationRad: number }): { u: Coord; v: Coord } {
    const cos = Math.cos(image.rotationRad);
    const sin = Math.sin(image.rotationRad);
    return { u: new Coord(cos, sin), v: new Coord(-sin, cos) };
  }

  /**
   * Follow the pointer for whichever gesture is in flight. Returns whether it
   * handled the move, so mouseMove can stop before the mechanism's own drags.
   */
  private dragBackgroundImage(at: Coord): boolean {
    const image = this.bgImage.image();
    if (!this.bgDrag || !image) return false;

    if (this.bgDrag.grabOffset) {
      this.bgImage.place({
        centerX: at.x + this.bgDrag.grabOffset.x,
        centerY: at.y + this.bgDrag.grabOffset.y,
      });
      return true;
    }

    if (this.bgDrag.grabAngleRad !== undefined) {
      const turned =
        Math.atan2(at.y - image.centerY, at.x - image.centerX) - this.bgDrag.grabAngleRad;
      // Quarter turns and the common skews land exactly, which is most of what
      // squaring a photograph to a grid actually needs. Alt suspends it, the
      // same key that suspends snapping everywhere else on this canvas.
      const step = Math.PI / 12; // 15 degrees
      this.bgImage.place({
        rotationRad: this.snapSuspended ? turned : Math.round(turned / step) * step,
      });
      return true;
    }

    const anchor = this.bgDrag.anchor!;
    const ratio = image.naturalHeight / image.naturalWidth;
    const { alongX, alongY } = this.cornerSigns(this.bgDrag.corner!);
    const axes = this.backgroundImageAxes(image);
    // How far the pointer is from the anchor along each of the picture's own
    // axes. Measuring in the picture's frame is what lets a turned picture
    // resize by the corner the hand is actually holding.
    const reach = new Coord(at.x - anchor.x, at.y - anchor.y);
    const alongWidth = reach.x * axes.u.x + reach.y * axes.u.y;
    const alongHeight = reach.x * axes.v.x + reach.y * axes.v.y;
    // Whichever axis the hand pulled further decides the size, so the corner
    // keeps up with a diagonal drag instead of tracking only one of them.
    const width = Math.max(MIN_WIDTH, Math.abs(alongWidth), Math.abs(alongHeight) / ratio);
    const height = width * ratio;
    // The signs come from which corner is held, not from where the pointer is:
    // dragged past its anchor, the picture pins at its minimum rather than
    // flipping to the other side of it.
    this.bgImage.place({
      width,
      centerX: anchor.x + alongX * (width / 2) * axes.u.x + alongY * (height / 2) * axes.v.x,
      centerY: anchor.y + alongX * (width / 2) * axes.u.y + alongY * (height / 2) * axes.v.y,
    });
    return true;
  }

  /**
   * The one menu item, doing whichever half applies: pick a file if there is no
   * picture yet, otherwise just open the panel on the one there is.
   */
  private openBackgroundImage(): void {
    this.tabService.setTab(TabID.EDIT);
    if (this.bgImage.image()) {
      this.activeObjService.selectBackgroundImage();
      return;
    }
    const input = this.backgroundImageInput().nativeElement;
    input.value = '';
    input.click();
  }

  /** Read the chosen file, place it across half the visible grid, and select it. */
  async onBackgroundImageChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      // Half the width of what is on screen: big enough to be obviously there,
      // small enough that the mechanism under construction is still visible
      // around it. Zoom-dependent by design — the picture arrives where the
      // user is looking rather than at some fixed size off the edge.
      const visibleWidth = this.svgGrid.viewBoxMaxX - this.svgGrid.viewBoxMinX;
      await this.bgImage.load(file, visibleWidth / 2);
      this.activeObjService.selectBackgroundImage();
      this.notify.success(
        'bgImage.added',
        `${file.name} is behind the grid. It is not saved in the share link.`
      );
    } catch (error) {
      this.notify.failure(
        'bgImage.failed',
        error instanceof Error ? error.message : 'That image could not be loaded.'
      );
    }
  }

  /** Where the two-point cylinder gesture started: the barrel-side mount. */
  private cylinderCreateStart?: Coord;
  /** The link the gesture started on, when it started on one rather than the grid. */
  private cylinderCreateOn?: RealLink;
  /** The joint it started on, when it started on one: the mount, already built. */
  private cylinderCreateAt?: RealJoint;

  /**
   * Begin the two-point cylinder gesture (§ cylinder 2), mirroring Add Link:
   * the right-click point is the barrel-side mount, a ghost of the assembly
   * tracks the cursor (which is where the ROD will finish), and the next
   * left-click commits. Right- or middle-click cancels, exactly as link
   * creation does.
   *
   * Started from a link's own menu, that link is what the ram is bolted to and
   * the mount joins its body — the same difference Attach Link has from Add
   * Link, and the reason both live on both menus.
   */
  startCreatingCylinder() {
    this.fitObjectScaleToFirstPart();
    this.cylinderCreateOn =
      this.lastRightClick instanceof RealLink ? this.lastRightClick : undefined;
    this.cylinderCreateAt =
      this.lastRightClick instanceof RealJoint ? this.lastRightClick : undefined;
    // From a joint, the mount is the joint itself, so the gesture starts at
    // where it actually is rather than wherever inside its hitbox the click
    // landed — a ram drawn a few pixels off its own mount is a ram at an angle
    // to the one the user pointed at.
    this.cylinderCreateStart = this.cylinderCreateAt
      ? new Coord(this.cylinderCreateAt.x, this.cylinderCreateAt.y)
      : this.svgGrid.screenToSVG(this.lastRightClickCoord);
    this.dragState.beginCreatingCylinder();
  }

  /**
   * The ghost cylinder of the creation gesture, tracking the cursor. Same
   * paths, same proportions and same frame as the committed skin, so what is
   * previewed is exactly what the left-click will create.
   */
  get cylinderPreview():
    | {
        x: number;
        y: number;
        rotation: number;
        barrel: string;
        rod: string;
        block: string;
        fill: string;
      }
    | undefined {
    if (this.dragState.grid !== gridStates.createCylinder || !this.cylinderCreateStart) {
      return undefined;
    }
    const creation = cylinderCreationLayout(
      this.cylinderCreateStart,
      this.mouseLocation,
      this.settings.objectScale
    );
    const r = 0.15 * this.settings.objectScale;
    return {
      x: creation.pin.x,
      y: creation.pin.y,
      rotation: (creation.angleRad * 180) / Math.PI,
      // The preview is the part it will become: the barrel at its own length,
      // straddling the piston, with the rod telescoping out of its mouth.
      barrel: barrelPath(r, -creation.pinFromMount, creation.barrelLength - creation.pinFromMount),
      rod: rodBodyPath(r, creation.rodLength, cylinderHeadHalf(creation.barrelLength, r)),
      block: cylinderBlockPath(r, cylinderHeadHalf(creation.barrelLength, r)),
      // The colour the barrel will be handed when the click builds it, which
      // the rod then wears too.
      fill: this.nextLinkColor,
    };
  }

  /** The left-click that ends the gesture: build the part, one undo entry. */
  private commitCylinderCreation(end: Coord) {
    const start = this.cylinderCreateStart;
    const mountOn = this.cylinderCreateOn;
    const mountAt = this.cylinderCreateAt;
    this.cylinderCreateStart = undefined;
    this.cylinderCreateOn = undefined;
    this.cylinderCreateAt = undefined;
    this.dragState.finishCreating();
    if (!start) return;
    this.mechanismSrv.createCylinderFrom(start, end, mountOn, mountAt);
  }

  setLastRightClick(clickedObj: Joint | Link | string | Force | SynthesisPose, event?: MouseEvent) {
    this.lastRightClick = clickedObj;
    // The edit context menu acts on the selected object, so in Edit mode a
    // right-click selects what it will target. In Analyze/Synthesis mode a
    // right-click must not open an edit menu (see onContextMenu), so it must not
    // move the selection out from under the active panel either.
    if (
      this.tabService.getCurrentTab() === TabID.EDIT &&
      (clickedObj instanceof Joint || clickedObj instanceof Link || clickedObj instanceof Force)
    ) {
      this.activeObjService.updateSelectedObj(clickedObj);
    }

    switch (this.objectKind(clickedObj)) {
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
    }

    this.updateContextMenuItems();
  }

  setLastLeftClick(clickedObj: Joint | Link | string | Force | SynthesisPose, event?: MouseEvent) {
    // Scenery in the analysis modes takes no clicks: every panel behind a
    // selection is about a machine that runs, and this geometry is not in one.
    if (
      (clickedObj instanceof Joint || clickedObj instanceof Link) &&
      this.mechanismSrv.isPartInert(clickedObj)
    ) {
      return;
    }
    this.lastLeftClick = clickedObj;
    switch (this.objectKind(clickedObj)) {
      case 'Force':
        this.lastLeftClickType = 'Force';
        break;
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
      case 'PrisJoint':
      //Fall through intentional
      case 'RevJoint':
        this.lastLeftClickType = 'Joint';
        break;
      case 'String':
        this.lastLeftClickType = 'Grid';
        break;
      case 'SynthesisPose':
        this.lastLeftClickType = 'SynthesisPose';
        break;
      default:
        this.lastLeftClickType = 'Unknown';
        console.error('Unknown object type clicked');
    }
    this.activeObjService.updateSelectedObj(clickedObj);
  }

  addJoint() {
    // TODO: Make sure you add logic within here so that joint is part of fixedLocations for respective link subset
    const coord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );

    this.mechanismSrv.addJointAt(coord);
  }

  /**
   * Begin the force gesture on a named link.
   *
   * Named rather than inferred, because the row that starts this is on the
   * joint's menu as well as the link's: a load at a joint belongs to the one
   * link that meets there, and the joint is not itself a body that can carry
   * one. Where several links meet, the menu greys the row instead of guessing.
   */
  createForce(onLink: RealLink) {
    this.forceCreateOn = onLink;
    this.dragState.beginCreatingForce();
    // A real Force, built on the link the gesture started from, so the preview
    // is drawn by the same code as the finished arrow rather than by a line
    // that only resembles one. Same reason the cylinder gesture previews its
    // actual members: what is shown is what the next click will make.
    const at = this.svgGrid.screenToSVG(this.lastRightClickCoord);
    this.forceGhost = new Force('ghost', onLink, at, new Coord(at.x, at.y));
    this.mechanismSrv.onMechUpdateState.next(3);
  }

  /** The link the force being drawn will be anchored to. */
  private forceCreateOn?: RealLink;

  /** The force being drawn, tracking the cursor. Undefined when not drawing. */
  forceGhost?: Force;

  /**
   * The bar being drawn, tracking the cursor.
   *
   * Link creation showed a hairline and a dot, which says where the gesture
   * started and where it will end and nothing about what it will make — the
   * cylinder and force gestures both preview the part itself. This is the same
   * capsule a two-joint link is drawn as, at the same half-width, so what is
   * under the cursor is the bar the click commits.
   */
  /**
   * Settle the object scale before the first part is drawn.
   *
   * On an empty grid the scale is derived from the current zoom, so whatever is
   * built first decides how large every pin and bar is from then on. Deciding
   * that when the gesture *starts* is what lets its ghost be the right size:
   * done at the commit instead, the preview is drawn at the old scale and the
   * part appears at a different one the instant it is made.
   */
  private fitObjectScaleToFirstPart(): void {
    if (this.mechanismSrv.links.length === 0) {
      this.svgGrid.updateObjectScale();
    }
  }

  /** Where the link gesture started, in model coordinates. */
  private linkCreateStart?: Coord;

  /**
   * The point the link gesture began at.
   *
   * The three commit paths used to read this back out of the preview's own SVG
   * element, as two string attributes — so the drawing was load-bearing, and
   * removing it would have quietly changed where links get built. It is kept
   * here instead, which is also what the preview draws from.
   */
  private linkGestureStart(): Coord {
    return this.linkCreateStart ?? this.mouseLocation;
  }

  /**
   * The colour the next link created will wear.
   *
   * A cylinder's barrel is the first link its gesture builds, and its rod wears
   * the barrel's fill — one part, one colour — so both gestures preview the
   * same answer.
   */
  get nextLinkColor(): string {
    return this.colorService.peekNextLinkColor();
  }

  get linkPreview(): { bar: string; from: Coord; fill: string } | undefined {
    const from = this.linkCreateStart;
    if (!this.dragState.isCreatingLink || !from) return undefined;
    const to = this.mouseLocation;
    const half = this.settings.objectScale / 4;
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    // Nothing to point along yet: the first pixel of the gesture would spin a
    // zero-length bar through every angle at once.
    if (span < 1e-6) return undefined;
    return {
      bar: orientedCapsulePath(
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        Math.atan2(to.y - from.y, to.x - from.x),
        span / 2,
        half
      ),
      from,
      fill: this.nextLinkColor,
    };
  }

  /**
   * How big a force's anchor mark is drawn.
   *
   * Tied to the arrow's own thickness, which is how a force shows its
   * magnitude: a heavy load draws a thick arrow, and a mark at a fixed size
   * beside it reads as belonging to something else. Both constants are set so
   * that a force at the default width keeps the size it had.
   */
  forceAnchorRadius(force: Force): number {
    return 0.75 * force.visualWidth * this.settings.objectScale;
  }

  /** The plus a *local* force wears, at the same thickness as its arrow. */
  forceWeldMark(force: Force): string {
    return plusPath(1.5 * force.visualWidth * this.settings.objectScale);
  }

  /** Where inside the arrow a body drag picked it up, so it does not jump. */
  private forceGrabOffset = new Coord(0, 0);

  beginDraggingForceBody(force: Force, event: PointerEvent): void {
    const at = this.svgGrid.screenToSVGfromXY(event.clientX, event.clientY);
    this.forceGrabOffset = new Coord(at.x - force.startCoord.x, at.y - force.startCoord.y);
  }

  /**
   * Put a force's anchor where the pointer asks, if it may go there.
   *
   * Two rules, and the joint one is checked first because a joint is on the
   * link whether or not the point lands inside the drawn bar: the anchor snaps
   * onto a joint that belongs to one link only, and is refused at a pin where
   * several meet — a force there does not say which body it acts on. Anywhere
   * else it has to be inside the bar.
   */
  private moveForceAnchor(wanted: Coord, how: 'anchor' | 'whole'): void {
    const force = this.activeObjService.selectedForce;
    // The force's own link, not whatever the panel last selected: a force knows
    // what it acts on, and the two can disagree after a click on the body.
    const link = force.link;
    const anchor = this.gridUtils.forceAnchorAt(link, wanted, this.settings.objectScale);
    if (!anchor) {
      this.notify.refusal(
        'force.ambiguous-anchor',
        'Several links meet at that joint, so a force there would not say which one it acts on.',
        { cooldownMs: 1500 }
      );
      return;
    }
    if (!anchor.snappedTo && !this.pointIsInsideLink(link, anchor.at)) {
      // Nothing moved, so nothing happened. Crediting the gesture anyway put an
      // identical URL on the undo stack: dragging the arrow off its own link
      // armed Undo, and pressing it appeared to do nothing because there was
      // nothing between the two states to see.
      return;
    }
    this.gridUtils.dragForce(force, anchor.at, how);
    // So that the panel values update continuously.
    this.activeObjService.fakeUpdateSelectedObj();
    this.dragState.noteMechanismModified();
  }

  /**
   * Whether a point lands on the body of a link.
   *
   * Asked of the model rather than of the drawing. It used to hit-test the
   * link's own SVG path, which fails silently in a way that is very hard to see:
   * a link whose element carries an empty `d` — the punch press's rod is one —
   * answers "not inside" for every point in it, so its force could not be moved
   * anywhere at all while three other templates worked fine.
   *
   * A two-joint bar is a special case rather than an exception. Its hull is a
   * line segment, so no point off that line is ever "inside" it — and the
   * anchor of a force on such a bar has already been projected onto the segment
   * by `dragForce`, which is what makes it a bar's whole reachable set.
   */
  private pointIsInsideLink(link: RealLink, point: Coord): boolean {
    const half = this.settings.objectScale / 4;
    const joints = link.joints;
    if (joints.length < 2) return false;
    // Within a bar's own width of the line between any two of its joints. This
    // is what a link is drawn as, so it covers the straight ones — including
    // the three-joint booms, whose joints are collinear and whose hull is
    // therefore a line with no inside at all.
    for (let first = 0; first < joints.length; first++) {
      for (let second = first + 1; second < joints.length; second++) {
        const [x, y] = point_on_line_segment_closest_to_point(
          point.x,
          point.y,
          joints[first].x,
          joints[first].y,
          joints[second].x,
          joints[second].y
        );
        if (Math.hypot(point.x - x, point.y - y) <= half) return true;
      }
    }
    // And anywhere in the middle of a plate, which the edges above do not cover.
    return link.isPointInsideHull(point.x, point.y);
  }

  /**
   * The joint a force's anchor is sitting on, if it is sitting on one.
   *
   * Derived rather than stored, so a force that arrived in a URL already on a
   * tracer point reads the same as one just dragged there.
   */
  forceSnappedJoint(force: Force): RealJoint | undefined {
    for (const joint of force.link.joints) {
      if (!(joint instanceof RealJoint) || joint.links.length > 1) continue;
      if (Math.hypot(joint.x - force.startCoord.x, joint.y - force.startCoord.y) < 1e-6) {
        return joint;
      }
    }
    return undefined;
  }

  creatingForce($event: MouseEvent) {
    const mousePos = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.forceGhost?.moveDirectionHandle(mousePos);
  }

  startCreatingLink() {
    // The first part on an empty grid sets the object scale from the zoom, and
    // everything is sized from it — so it has to be settled before anything is
    // drawn at it. It used to be settled at the *commit*, which meant the ghost
    // was drawn at the old scale and the bar changed size under the click.
    this.fitObjectScaleToFirstPart();
    const startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
    switch (this.objectKind(this.lastRightClick)) {
      case 'String':
        this.dragState.beginCreatingLinkFromGrid();
        break;
      case 'PrisJoint':
      case 'RevJoint':
        startCoord.x = this.activeObjService.selectedJoint.x;
        startCoord.y = this.activeObjService.selectedJoint.y;
        this.dragState.beginCreatingLinkFromJoint();
        break;
      case 'RealLink':
        // TODO: Create logic for attaching a link onto a link
        this.dragState.beginCreatingLinkFromLink();
        break;
      default:
        return;
    }
    this.linkCreateStart = startCoord;
  }

  mouseMove($event: MouseEvent) {
    this.snapSuspended = $event.altKey;
    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.lastMouseLocation = this.mouseLocation;
    this.originInScreen = this.svgGrid.SVGtoScreen(new Coord(0, 0));
    this.mouseLocationRaw = new Coord($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;
    this.svgGrid.cursorAt = mousePosInSvg;

    this.dragState.notePointerMoved();

    // The picture is scenery, and its gesture owns the pointer outright: no
    // snapping, no drop candidates, no mechanism state to keep in step.
    if (this.dragBackgroundImage(mousePosInSvg)) return;

    // Synthesis is the same kind of thing: positions and the preview are a
    // question and a proposed answer, not parts of the drawing, so nothing
    // here earns a rebuild or an undo entry. The cursor is recorded either
    // way -- the ghost about to be dropped follows it.
    if (this.showSynthesis() && this.synthCanvas.move(mousePosInSvg)) return;

    let deltaMouseX = this.mouseLocation.x - this.lastMouseLocation.x;
    let deltaMouseY = this.mouseLocation.y - this.lastMouseLocation.y;

    // The press earned a refusal, and the pointer has now actually tried to
    // move the object: say it, once per gesture.
    if (
      this.heldGestureNotice &&
      this.dragState.isPointerDown &&
      this.canEditNow() &&
      this.pastDragThreshold($event)
    ) {
      this.heldGestureNotice();
      this.heldGestureNotice = undefined;
    }

    switch (this.dragState.joint) {
      case jointStates.creating:
        break;
      case jointStates.dragging: {
        if (!this.canEditNow() || !this.pastDragThreshold($event)) {
          return;
        }
        // A mount of a sealed cylinder drags parametrically: the whole
        // assembly re-poses about the OTHER mount, collinear by construction
        // (§ cylinder 6). Mounts merge onto other joints like any joint does —
        // that is how a cylinder attaches — with the refusal rules keeping
        // welded targets and the part's own joints out. Slot drops stay off
        // the table: a mount never rides a slot.
        const draggedCylinders = this.mechanismSrv.cylindersAt(this.activeObjService.selectedJoint);
        if (draggedCylinders.length > 0) {
          this.updateDropCandidate(mousePosInSvg, $event.altKey);
          this.slotCandidate = undefined;
          this.axisSnapGuides = [];
          // Snap to the axis of the ram the gesture is most obviously about --
          // the first -- but re-pose all of them, so a mount two rams share
          // does not drag one and deform the other.
          const wanted = this.snapTargetJoint
            ? new Coord(this.snapTargetJoint.x, this.snapTargetJoint.y)
            : this.mountAxisSnap(
                draggedCylinders[0],
                this.activeObjService.selectedJoint,
                mousePosInSvg
              );
          // Through dragJoint rather than straight at dragCylinderMount, so a
          // mount two rams share is agreed between them before either moves.
          this.gridUtils.dragJoint(this.activeObjService.selectedJoint, wanted);
          // Not announced. The mount stops following the cursor at the
          // shortest ram there is, and a part that stops moving under your own
          // hand has already said so.
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
          this.showPathWhileDragging();
          break;
        }
        this.updateDropCandidate(mousePosInSvg, $event.altKey);
        // A capture has a target of its own, so any axis the last move squared
        // itself against is no longer what decides where the joint goes.
        this.axisSnapGuides = [];
        // Captured: the joint sits exactly on the target instead of trailing the
        // cursor, so what is on screen is what a release would produce.
        // A slot capture pulls the joint onto the slot line the same way, so a
        // drop-on-link is as unsurprising as a drop-on-joint (§4.3).
        this.activeObjService.selectedJoint = this.gridUtils.dragJoint(
          this.activeObjService.selectedJoint,
          this.snapTargetJoint
            ? new Coord(this.snapTargetJoint.x, this.snapTargetJoint.y)
            : this.slotCandidate
              ? new Coord(this.slotCandidate.x, this.slotCandidate.y)
              : this.alongItsSlot(
                  this.activeObjService.selectedJoint,
                  // Last, and only here: a capture is a target the reader
                  // picked, and a joint on a slot has a line to stay on. The
                  // grid gets the position nothing else has a claim on.
                  this.svgGrid.snapToGrid(mousePosInSvg, $event.altKey)
                )
        );
        this.dragState.noteMechanismModified();
        //So that the panel values update continously
        this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
        this.showPathWhileDragging();
        break;
      }
    }
    switch (this.dragState.link) {
      case linkStates.creating:
        break;
      case linkStates.dragging: {
        if (!this.canEditNow() || !this.pastDragThreshold($event)) {
          return;
        }
        // One carried joint is locked: the drag is a swing about it. The body
        // turns by however far the cursor's bearing from the pivot changed
        // since the last move, so the grabbed point tracks the cursor's angle
        // without ever leaving its own radius.
        if (this.linkRotationPivot) {
          const pivot = this.linkRotationPivot;
          const bearing = Math.atan2(mousePosInSvg.y - pivot.y, mousePosInSvg.x - pivot.x);
          const theta = bearing - this.linkRotationGrabAngle;
          this.linkRotationGrabAngle = bearing;
          const swungCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
          if (swungCylinder) {
            this.gridUtils.rotateCylinder(swungCylinder, pivot, theta);
          } else {
            this.gridUtils.rotateLink(this.activeObjService.selectedLink, pivot, theta);
          }
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging();
          break;
        }
        // Measured from where the body was last placed, not from the previous
        // pointer event: the moves held back below the click threshold would
        // otherwise be lost motion, leaving the link trailing the cursor by
        // however far the hold lasted.
        const bodyCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
        if (bodyCylinder) {
          // Dragging the body translates the whole assembly rigidly; the
          // mounts are the handles for re-posing. It follows the cursor freely,
          // the same way a bar does, measured on the mount the ram is named
          // from.
          const mount = bodyCylinder.barrelFar;
          const target = this.placeDraggedBody(mount, mousePosInSvg);
          this.gridUtils.dragCylinder(bodyCylinder, target.x - mount.x, target.y - mount.y);
          this.linkDragAnchor = mousePosInSvg;
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging();
          break;
        } else {
          // The body travels by however far the cursor has, measured on the
          // joint the link is named from. Measured from where the grab started,
          // not from the last frame: one pointer event is a few units, which
          // rounds to no move at all, and a link asked frame by frame would sit
          // on its corner for ever.
          const reference = this.activeObjService.selectedLink.joints[0];
          const landed = this.placeDraggedBody(reference, mousePosInSvg);
          this.gridUtils.dragLink(
            this.activeObjService.selectedLink,
            landed.x - reference.x,
            landed.y - reference.y
          );
          this.linkDragAnchor = mousePosInSvg;
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging();
          break;
        }
        this.linkDragAnchor = mousePosInSvg;
        this.dragState.noteMechanismModified();
        this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
        this.showPathWhileDragging();
        break;
      }
    }
    switch (this.dragState.force) {
      case forceStates.creating:
        this.creatingForce($event);
        break;
      case forceStates.draggingEnd:
        if (!this.canEditNow()) {
          return;
        }
        //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
        this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, 'direction');
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        this.dragState.noteMechanismModified();
        break;
      case forceStates.draggingStart:
        if (!this.canEditNow()) {
          return;
        }
        this.moveForceAnchor(mousePosInSvg, 'anchor');
        break;
      // Grabbing the arrow itself carries the whole force. `moveAnchor` already
      // translates both ends, so this is the same move as dragging the start —
      // less the jump, because where inside the arrow it was picked up is kept.
      case forceStates.draggingBody:
        if (!this.canEditNow()) {
          return;
        }
        this.moveForceAnchor(
          new Coord(
            mousePosInSvg.x - this.forceGrabOffset.x,
            mousePosInSvg.y - this.forceGrabOffset.y
          ),
          'whole'
        );
        break;
    }
  }

  /**
   * Whether an edit is allowed right now.
   *
   * Editing is only defined at the t=0 pose in Edit mode: the solved timesteps
   * are derived from it, so a change made anywhere else has nothing to write to.
   *
   * Silently. Each of these used to announce itself, and each was saying
   * something the reader could already see — which mode they are in is written
   * across the top strip and down the side of the window, and whether the
   * animation is running is the thing they are watching. A message for it was
   * a fifth place saying the same word.
   */
  /**
   * The pivot of the current link drag, when one carried joint is locked.
   * Set at the grab and read per pointer move; a drag with no locked joint
   * clears it, so a stale pivot cannot outlive its gesture.
   */
  private linkRotationPivot?: Coord;
  private linkRotationGrabAngle = 0;

  /**
   * The refusal a press on a held object has earned but not yet been given.
   * Spoken only when the pointer actually tries to move — a plain click is a
   * selection, and selecting a locked object is the way to its own Unlock
   * button, not an offence. Cleared on release.
   */
  private heldGestureNotice?: () => void;

  /**
   * The padlock the canvas badges wear. Unlike lock.svg's fully hollow
   * outline, the body here is solid — at joint size the hollow body read as
   * a thin frame and disappeared, and the badge is a mark, not a control.
   */
  readonly lockGlyphPath = 'M7 10V7a5 5 0 0 1 10 0v3h2.5v11h-15V10H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

  /**
   * Dead centre of the joint, unflipped: the joint layer draws in the y-up
   * model frame (scaleY(-1) on the holder), so the badge flips itself back
   * to keep the padlock upright. The glyph sits inside the joint's own
   * circle, so the circle's fill keeps saying what it always says — cream,
   * amber when selected — behind the mark.
   */
  lockBadgeTransform(): string {
    return `scale(1,-1)`;
  }

  /**
   * The shoulder position, for badges whose centre spot is already taken: a
   * force's anchor is a small dark disc a centred glyph would vanish into,
   * and a welded joint's plus-mark is the very thing a centred chip covered.
   */
  offsetLockBadgeTransform(): string {
    const offset = 0.19 * this.settings.objectScale;
    return `translate(${offset}, ${offset}) scale(1,-1)`;
  }

  /** Centre the 24-unit glyph on the badge point, sized to the drawing. */
  lockGlyphTransform(): string {
    const scale = (0.17 * this.settings.objectScale) / 24;
    return `scale(${scale}) translate(-12, -13.5)`;
  }

  /**
   * The joints a drag of this link would carry, filtered to the ones the
   * current Lock marks hold still. Carried means moved *as a body*: the
   * link's own joints, the coincident block joints riding them, and a sealed
   * cylinder's five.
   *
   * A floating slider riding this link is not among them, locked or not. Its
   * mark holds where it sits along the slot, and moving the link moves the
   * slot with the block still at that place on it — so a locked block is no
   * reason to refuse the drag, and pivoting the link about one would be
   * anchoring a point nothing asked to have held.
   */
  private frozenCarriedJoints(link: Link): Joint[] {
    const carried = new Map<string, Joint>();
    const add = (joint: Joint) => carried.set(joint.id, joint);
    const bodyCylinder = this.mechanismSrv.cylinderAt(link);
    if (bodyCylinder) {
      cylinderJoints(bodyCylinder).forEach(add);
    } else {
      link.joints.forEach((joint) => {
        add(joint);
        if (!(joint instanceof RealJoint)) return;
        joint.links.forEach((other) => {
          if (other instanceof SliderBlock) other.joints.forEach(add);
        });
      });
    }
    const frozen = this.gridUtils.frozenJointIds();
    return [...carried.values()].filter((joint) => frozen.has(joint.id));
  }

  /** Refuse a joint drag because the joint is held, naming what holds it. */
  private refuseLockedJoint(joint: RealJoint): boolean {
    if (!this.gridUtils.isJointFrozen(joint)) return false;
    const holds = this.gridUtils.locksHolding(joint);
    // A mark on the other half of a block counts as this joint's own: the two
    // are the same point, and only one of them has a letter the reader can see
    // to unlock.
    const block = joint.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    const itself = new Set([joint.id, ...(block?.joints.map((member) => member.id) ?? [])]);
    const heldByItself = holds.some((lock) => itself.has(lock.id));
    const slider = this.mechanismSrv.sliderFor(joint);
    // A locked block has not been pinned to the grid — its slot is free to
    // move and will take it along. What it cannot do is slide, so that is what
    // the refusal says; "is locked" alone would promise a stillness this mark
    // does not buy.
    const text = !heldByItself
      ? `Joint ${joint.name} is on a locked ${this.lockNoun(holds)}.`
      : slider?.isFloating
        ? `Slider ${joint.name} is locked to its place in the slot.`
        : `Joint ${joint.name} is locked.`;
    this.refuseWithUnlock('lock.joint', text, holds);
    return true;
  }

  private refuseHeldLink(link: Link, held: Joint[]): void {
    const holds = this.uniqueLocks(held.flatMap((joint) => this.gridUtils.locksHolding(joint)));
    const text = this.mechanismSrv.isLockedTarget(link)
      ? this.mechanismSrv.cylinderAt(link)
        ? 'This cylinder is locked.'
        : `Link ${link.name} is locked.`
      : 'Two of the joints this drag would carry are locked. Unlock one to swing the body about the other.';
    this.refuseWithUnlock('lock.link', text, holds);
  }

  private refuseLockedForce(force: Force): void {
    this.refuseWithUnlock('lock.force', `Force ${force.name} is locked.`, [force]);
  }

  /** One refusal, carrying its own way out. */
  private refuseWithUnlock(id: string, text: string, holds: Lockable[]): void {
    this.notify.refusal(id, text, {
      actions:
        holds.length > 0 ? [{ label: 'Unlock', run: () => this.mechanismSrv.unlock(holds) }] : [],
    });
  }

  private uniqueLocks(locks: Lockable[]): Lockable[] {
    return locks.filter((lock, index) => locks.indexOf(lock) === index);
  }

  /**
   * What kind of thing holds this joint, for the refusal's sentence. Marks
   * live on joints, so the question is what the marked joint *is*: part of a
   * sealed cylinder, one of a link's fully-marked joints, or just itself.
   */
  private lockNoun(holds: Lockable[]): string {
    const joint = holds.find((lock): lock is RealJoint => lock instanceof RealJoint);
    if (!joint) return 'object';
    if (this.mechanismSrv.cylinderAt(joint)) return 'cylinder';
    const lockedLink = joint.links.find((link) => this.mechanismSrv.isLockedTarget(link));
    if (lockedLink) return `link ${lockedLink.name}`;
    return `joint ${joint.name}`;
  }

  private canEditNow(): boolean {
    if (this.mechanismSrv.isPlaying) {
      return false;
    }
    if (this.mechanismSrv.mechanismTimeStep !== 0) {
      return false;
    }
    if (this.tabService.getCurrentTab() === TabID.SYNTHESIZE) {
      return false;
    }
    // Analyze already refuses to open an edit context menu (see onContextMenu),
    // but dragging bypassed that: the mode was read-only by menu only. Whole-link
    // drag would have widened the hole, so the guard covers every drag instead.
    //
    // Both analysis modes, not just the kinematic one. Force analysis reads the
    // same solved cycle and is no more able to survive the geometry moving
    // under it.
    if (this.tabService.isAnalysisMode()) {
      return false;
    }
    return true;
  }

  /**
   * Whether the pointer has committed to a drag rather than a click. A short
   * press is held back so that selecting an object does not nudge it; moving
   * far enough overrides the hold, because by then the intent is unambiguous.
   */
  private pastDragThreshold($event: MouseEvent): boolean {
    if (getDistance(new Coord(this.startX, this.startY), new Coord($event.x, $event.y)) > 10) {
      this.timeMouseDown = 0;
    }
    return !(this.timeMouseDown !== undefined && Date.now() - this.timeMouseDown < 100);
  }

  /** How close a dragged joint has to get to another before it will merge. */
  private snapRadius(): number {
    return this.settings.objectScale * 0.4;
  }

  /**
   * Mark the joint the drag is aimed at. Holding Alt suppresses snapping
   * outright, which is the only way to park a joint on top of another without
   * merging the two.
   */
  private updateDropCandidate(mousePos: Coord, altHeld: boolean): void {
    const candidate = altHeld
      ? undefined
      : resolveDropCandidate(
          this.activeObjService.selectedJoint,
          mousePos.x,
          mousePos.y,
          // A sealed cylinder's interior joints are not attachment points, so
          // they never capture a drop; the mounts remain ordinary targets.
          this.mechanismSrv.joints.filter((joint) => !this.isCylinderInterior(joint)),
          this.snapRadius(),
          // The full structural picture rides along separately: the filtered
          // list above cannot answer mount questions (the pins are gone), and
          // this is the cached list, not a per-move derivation.
          this.mechanismSrv.sealedStructures()
        );
    this.setDropCandidate(candidate);

    // Joint snap wins outright when both are in range (§4.3). A joint is the
    // more specific intent and the only one that can be aimed at precisely, so
    // the slot preview only appears where no joint is claiming the drop -- which
    // is also what makes the two distinguishable before release: you either see
    // a ring on a joint, or a channel opening in a bar, never both.
    // A joint you are not allowed to merge with is still a joint you are aiming
    // at. `resolveDropCandidate` deliberately says nothing about the far end of
    // your own link -- the drawing already says the two are joined, so there is
    // no rule there worth explaining -- but dropping on top of it must not then
    // quietly cut a slot into whatever else passes through that point. Landing
    // a joint on a joint gave the four-bar a fifth one.
    const overAJoint = this.mechanismSrv.joints.some(
      (joint) =>
        joint.id !== this.activeObjService.selectedJoint?.id &&
        !(joint instanceof PrisJoint) &&
        Math.hypot(joint.x - mousePos.x, joint.y - mousePos.y) < this.snapRadius()
    );
    this.slotCandidate =
      altHeld || candidate || overAJoint
        ? undefined
        : resolveSlotDropTarget(
            this.activeObjService.selectedJoint,
            mousePos.x,
            mousePos.y,
            // No slot is ever cut into a sealed cylinder's members: the
            // barrel's one slot is the part's own bore.
            this.mechanismSrv.links.filter(
              (link) => link instanceof RealLink && !this.isCylinderMemberLink(link)
            ),
            this.slotDropRadius()
          );
  }

  /**
   * Where a block in a channel is allowed to go (§4.4).
   *
   * Dragging the block along its slot sets s₀ and changes nothing else, so the
   * drag is projected onto the slot line and clamped to the span the channel
   * actually occupies — the block cannot leave a hole it is inside of, and one
   * drag stays one quantity.
   *
   * Only for a floating slot. A grounded guide's line is fixed in the world
   * rather than cut into a body, so dragging its joint repositions the whole
   * guide; constraining that would leave no way to move a guide at all.
   */
  private alongItsSlot(joint: Joint, wanted: Coord): Coord {
    const slider = this.mechanismSrv.sliderFor(joint);
    if (!slider?.isFloating || !slider.isSlotWellFormed) return this.withAxisSnap(joint, wanted);

    const a = slider.slotJointA!;
    const b = slider.slotJointB!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return wanted;

    const ux = dx / length;
    const uy = dy / length;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const half = slotHalfLength(0.15 * this.settings.objectScale, length);
    const offset = (wanted.x - midX) * ux + (wanted.y - midY) * uy;
    const across = -(wanted.x - midX) * uy + (wanted.y - midY) * ux;

    // Sticky, then it lets go (§4.4). Sliding along the slot is by far the
    // commoner intent, so the block stays on its line through any amount of
    // sideways wobble -- but a slot is not a life sentence, and pulling clear
    // of the bar is the one gesture that plainly means "take this off here".
    // What is left behind is the dangling block: a slider with nowhere to
    // slide, drawn red until it is dropped on a link again.
    if (Math.abs(across) > this.slotReleaseDistance()) {
      this.mechanismSrv.detachSlider(slider);
      return this.withAxisSnap(joint, wanted);
    }

    const along = Math.max(-half, Math.min(half, offset));
    return new Coord(midX + along * ux, midY + along * uy);
  }

  /**
   * How far across its own slot a block has to be pulled before it comes out.
   *
   * Two bar-widths: far enough that no ordinary along-the-slot drag reaches it
   * by accident, close enough that deliberately pulling the block off the bar
   * does it on the first try.
   */
  private slotReleaseDistance(): number {
    return 4 * MARK.barHalf * 0.15 * this.settings.objectScale;
  }

  /**
   * Where a whole body being dragged should put its reference point.
   *
   * The cursor's own displacement, and nothing else. A body drag gets neither
   * of the two helps a joint drag gets, and for the same reason in both cases:
   * they act on the body's reference joint, which is whichever joint the link
   * is named from -- not the point under the hand. So the guide line appeared
   * at a corner the reader was not holding, naming a neighbour they had not
   * aimed at, and the body jumped a fraction of a grid square sideways to put
   * one of its several joints on a corner the others could not reach anyway.
   *
   * A joint dragged on its own still squares up and still lands on the grid:
   * there the thing that snaps is the thing in your hand.
   */
  private placeDraggedBody(reference: { x: number; y: number }, cursor: Coord): Coord {
    // Measured from the press, not from this first qualifying move: the moves
    // held back below the click threshold are still part of the gesture, and
    // starting the sum after them leaves the body trailing the cursor by
    // however far the hold lasted.
    this.bodyDragOrigin ??= {
      at: new Coord(reference.x, reference.y),
      from: new Coord(this.linkDragAnchor.x, this.linkDragAnchor.y),
    };
    const held = this.bodyDragOrigin;
    this.axisSnapGuides = [];
    return new Coord(held.at.x + (cursor.x - held.from.x), held.at.y + (cursor.y - held.from.y));
  }

  /** Lines showing which joints a drag has just squared itself against. */
  public axisSnapGuides: SnapGuide[] = [];

  /**
   * Whether the Option key is down, meaning "no help from the app".
   *
   * Read at the top of every move rather than passed down: the axis snap is
   * reached through `alongItsSlot`, three call sites deep, and a flag set once
   * a gesture is easier to keep true than a parameter threaded through all of
   * them.
   */
  private snapSuspended = false;

  /** Is the app allowed to square this drag up with anything? */
  private alignmentAllowed(): boolean {
    return this.settings.isSnapToAlignment.value && !this.snapSuspended;
  }

  /**
   * Pull a free drag onto a neighbour's axis when it is nearly on it.
   *
   * Only a free drag: a block is already constrained to its slot, and a capture
   * has a target of its own, so snapping either would be a second opinion about
   * where the joint goes.
   */
  private withAxisSnap(joint: Joint, wanted: Coord): Coord {
    if (!this.alignmentAllowed()) {
      this.axisSnapGuides = [];
      return wanted;
    }
    const others = this.mechanismSrv
      .getJoints()
      .filter((other) => other.id !== joint.id && !(other instanceof PrisJoint));
    const snapped = snapToAxes(wanted, others, this.svgGrid.scaleWithZoom(8));
    this.axisSnapGuides = snapped.guides;
    return new Coord(snapped.point.x, snapped.point.y);
  }

  /**
   * Axis snapping for a mount drag. The assembly's own joints are excluded:
   * they move with the drag, so squaring the mount against them would be the
   * drag chasing its own tail. Every other joint's H/V guides still work.
   */
  private mountAxisSnap(sealed: Cylinder, dragged: Joint | undefined, wanted: Coord): Coord {
    if (!this.alignmentAllowed()) {
      this.axisSnapGuides = [];
      return wanted;
    }
    const memberIds = new Set(cylinderJoints(sealed).map((joint) => joint.id));
    // All but the mount at the other end. That one does not move when this one
    // is dragged, so it is exactly the thing to square up against -- and
    // squaring a ram against its own far mount is what stands it at 0, 90 or
    // 180, which is what a bar has always been able to do against its own far
    // joint. The rest of the assembly travels with the drag, and squaring
    // against those is the drag chasing its own tail.
    const opposite = dragged?.id === sealed.barrelFar.id ? sealed.rodFar : sealed.barrelFar;
    memberIds.delete(opposite.id);
    const others = this.mechanismSrv
      .getJoints()
      .filter((other) => !memberIds.has(other.id) && !(other instanceof PrisJoint));
    const snapped = snapToAxes(wanted, others, this.svgGrid.scaleWithZoom(8));
    this.axisSnapGuides = snapped.guides;
    return new Coord(snapped.point.x, snapped.point.y);
  }

  /**
   * How close to a bar's centreline the cursor must get to cut a slot there.
   *
   * Half the bar's own width, so the drop has to be genuinely over the body
   * rather than merely near it — a slot is a hole through the bar, and offering
   * one while the cursor is off in open canvas reads as the bar grabbing at it.
   */
  private slotDropRadius(): number {
    return MARK.barHalf * 0.15 * this.settings.objectScale;
  }

  /**
   * The slot this drag would cut, previewed as the real thing.
   *
   * Not a stand-in: the previewed channel is pushed through the same path
   * subtraction a committed slot uses, so the hover state is pixel-identical to
   * the result and its legibility cannot depend on the carrier's random colour.
   */
  public slotCandidate?: SlotDropCandidate;

  private setDropCandidate(candidate?: JointDropCandidate): void {
    // Capture starts further out than the joint's own hitbox, so pointerover
    // cannot be what lifts the target to its hovered fill.
    if (this.snapTargetJoint && this.snapTargetJoint !== candidate?.joint) {
      this.snapTargetJoint.showHighlight = false;
    }
    const captured = candidate && !candidate.refusal ? candidate.joint : undefined;

    // Which way the arrow points is latched the moment the ring appears, from
    // the side the joint was still on. Recomputing it per frame would flip it
    // back and forth as the cursor wanders across the target, and the joint has
    // by then been parked on top of it anyway, so there is nothing left to read.
    if (captured && captured !== this.snapTargetJoint) {
      this.mergeArrowReversed = this.activeObjService.selectedJoint.x > captured.x;
    }

    this.snapTargetJoint = captured;
    this.refusedTarget = candidate?.refusal ? candidate : undefined;
    if (this.snapTargetJoint) this.snapTargetJoint.showHighlight = true;
  }

  /**
   * `B → D` when this joint is the one a capture is about to merge into.
   *
   * A captured joint sits exactly on its target, so both names render at the
   * same point and overlap into an unreadable smudge. Naming the merge in one
   * label reads better than either name alone, and says which of the two
   * survives — which is not otherwise visible anywhere.
   */
  mergeLabelFor(joint: Joint): string {
    if (!this.snapTargetJoint || joint.id !== this.snapTargetJoint.id) return '';
    const source = this.activeObjService.selectedJoint;
    if (!source || source.id === joint.id) return '';
    return this.mergeArrowReversed
      ? `${joint.name} \u2190 ${source.name}`
      : `${source.name} \u2192 ${joint.name}`;
  }

  /** Whether this joint is the one being dragged into another. */
  isMergingAway(joint: Joint): boolean {
    return (
      !!this.snapTargetJoint &&
      joint.id === this.activeObjService.selectedJoint?.id &&
      joint.id !== this.snapTargetJoint.id
    );
  }

  /** The one-shot feedback animation playing on `joint`, if any. */
  jointEffectClass(joint: Joint): string {
    if (joint.id === this.shakingJointID) return 'jointShake';
    if (joint.id === this.poppingJointID) return 'jointPop';
    return '';
  }

  /**
   * Shake the dropped joint and say why it could not land where it was aimed.
   *
   * The reason is its own message rather than a shared "cannot drop here", so
   * dragging against one rule and then another says both instead of falling
   * silent on the second.
   */
  private refuseDrop(jointID: string, reason: MergeRefusal): void {
    this.notify.refusal(`merge.${reason}`, MERGE_REFUSAL_MESSAGES[reason]);
    this.shakingJointID = jointID;
    setTimeout(() => (this.shakingJointID = undefined), 420);
  }

  /** Pop the survivor of a merge, so the change is legible where it happened. */
  private popJoint(jointID: string): void {
    this.poppingJointID = jointID;
    setTimeout(() => (this.poppingJointID = undefined), 400);
  }

  private showPathWhileDragging(): void {
    // The machine being dragged, not whichever was built first — and possibly
    // none at all, while a chain is still being drawn and has yet to reach
    // ground.
    const dragged = this.activeObjService.selectedJoint;
    const solved = dragged ? this.mechanismSrv.mechanismContaining(dragged) : undefined;
    if (!solved || solved.joints[0].length === 0) return;
    if (solved.dof !== 1) return;
    if (this.mechanismSrv.showPathHolder === false) {
      this.mechanismSrv.onMechUpdateState.next(1);
    }
    this.mechanismSrv.showPathHolder = true;
  }

  /**
   * Remember where the pointer was, so the gestures a row starts land there
   * and the card can grow from the corner nearest it.
   *
   * What the menu *contains* was decided by `setLastRightClick`, which the
   * element under the pointer fired first — including whether it contains
   * anything at all. The menu is open in every mode now: the analysis modes
   * get the trace switch and the way back into Edit, and Edit while the
   * mechanism is parked mid-cycle greys its editing rows with the reason
   * rather than refusing to open.
   */
  onContextMenu($event: MouseEvent) {
    this.lastRightClickCoord.x = $event.clientX;
    this.lastRightClickCoord.y = $event.clientY;
  }

  mouseUp($event: MouseEvent) {
    //This is the mouseUp that is called no matter what is clicked on
    this.bgDrag = undefined;
    if (this.showSynthesis()) {
      const wasDragging = this.synthCanvas.release();
      // One gesture, one entry: the design is carried in the same URL the undo
      // stack is made of, so a drag that moved a position has to be written --
      // once, here, rather than on every pointer-move that made it.
      if (wasDragging) this.mechanismSrv.save();
      // A press that neither took hold of anything nor moved is a click, and
      // while placing is armed a click on the canvas drops the next position.
      // On the release rather than the press so svg-pan-zoom keeps its own
      // gesture: a press it never sees is a canvas that cannot be panned.
      if (
        $event.button === 0 &&
        !wasDragging &&
        !this.synthPressTaken &&
        this.synthesisBuilder.armed &&
        this.pressDidNotTravel($event)
      ) {
        const at = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
        this.synthesisBuilder.placePose(at);
        // A position added is a different question, not a different answer.
        this.synthSolution.invalidate();
        this.dragState.release();
        this.mechanismSrv.save();
        return;
      }
      // A click on the canvas that took hold of nothing lets go of whatever
      // position was selected -- the same way clicking empty grid clears the
      // selection everywhere else in the app. Only when placing is not armed:
      // armed, the click has already been spent dropping a position.
      if (
        !wasDragging &&
        !this.synthPressTaken &&
        !this.synthesisBuilder.armed &&
        this.synthesisBuilder.selectedPose !== 0 &&
        this.pressDidNotTravel($event) &&
        this.objectKind(this.lastLeftClick) === 'String'
      ) {
        this.synthesisBuilder.selectedPose = 0;
      }
    }
    // The alignment guides belong to the drag that made them.
    this.axisSnapGuides = [];
    // A press on a held object that never tried to move it is a click — a
    // selection, most likely on the way to the panel's own Unlock — and a
    // click deserves no scolding.
    this.heldGestureNotice = undefined;

    // Resolve the drop before releasing: the snap target is only meaningful
    // while the drag it belongs to is still in flight.
    const merged = this.completePendingJointMerge($event);
    const outcome = this.dragState.release();

    if (outcome.rebuild) {
      this.mechanismSrv.updateMechanism();
    }
    if (this.mechanismSrv.showPathHolder) {
      this.mechanismSrv.onMechUpdateState.next(2);
    }
    this.mechanismSrv.showPathHolder = false;

    // One gesture earns one undo entry. Undo is a stack of URL strings, so
    // saving per pointer-move would fill it with intermediate poses nobody
    // asked to return to.
    if (outcome.save || merged) {
      this.mechanismSrv.save();
    }
  }

  /**
   * If a joint drag is ending over another joint, fold the two together.
   * Returns whether the mechanism changed structurally.
   */
  private completePendingJointMerge($event: MouseEvent): boolean {
    // Alt is read from the release, not from the last pointermove. Pressing a
    // modifier emits no move, so a target acquired before Alt went down would
    // otherwise still merge on a release the user meant to be inert.
    if ($event.altKey) {
      this.snapTargetJoint = undefined;
      this.refusedTarget = undefined;
      this.slotCandidate = undefined;
      return false;
    }
    const target = this.snapTargetJoint;
    const refused = this.refusedTarget;
    const slot = this.slotCandidate;
    this.setDropCandidate(undefined);
    this.slotCandidate = undefined;
    if (this.dragState.joint !== jointStates.dragging) {
      return false;
    }

    const source = this.activeObjService.selectedJoint;
    if (refused?.refusal) {
      this.refuseDrop(source.id, refused.refusal);
      return false;
    }
    if (!target) {
      // No joint claimed the drop, so a bar may have. Cutting the slot is the
      // gesture's whole point (§4.3) and it earns the same receipt a merge does.
      if (slot && this.mechanismSrv.cutSlotOn(source, slot)) {
        this.popJoint(source.id);
        return true;
      }
      return false;
    }

    const wasWelded = source.isWelded || target.isWelded;
    const refusal = this.mechanismSrv.mergeJoints(source, target);
    if (refusal) {
      this.refuseDrop(source.id, refusal);
      return false;
    }

    // A merged-into-welded joint re-welds itself, but a grounded, driven, or
    // slider-carrying survivor cannot be welded at all. Losing the weld
    // silently would leave the user with a linkage they did not ask for. A
    // merge that goes exactly as asked says nothing: the pop is the receipt.
    // A warning, not a refusal: the merge happened, and the linkage the reader
    // now has is not quite the one they drew. It waits to be dismissed.
    if (wasWelded && !target.isWelded) {
      this.notify.warning(
        'merge.weld-lost',
        `Merged ${source.id} into ${target.id}. The weld did not carry over — ${target.id} cannot be welded.`
      );
    }
    this.popJoint(target.id);
    return true;
  }

  /**
   * Whether this press stayed put -- a click rather than a drag.
   *
   * Deliberately not `pastDragThreshold`, which also calls a press held for a
   * tenth of a second a drag. That is right for a part already on the grid,
   * where holding still is how you take hold of something, but wrong for
   * dropping a position: aiming at a spot takes as long as it takes, and every
   * click slower than 100ms was being thrown away -- which is why a position
   * seemed to need several clicks to place. Distance is the only thing that
   * tells the two gestures apart here.
   */
  private pressDidNotTravel($event: MouseEvent): boolean {
    const from = new Coord(this.startX, this.startY);
    return getDistance(from, new Coord($event.pageX, $event.pageY)) <= 10;
  }

  /**
   * Let go of any canvas gesture still in flight.
   *
   * Called from the window-level release in SvgGridService, for the presses
   * that come up somewhere the canvas cannot hear. Safe to call when nothing
   * is happening -- it is the same tidying `mouseUp` does.
   */
  releaseCanvasGestures(): void {
    this.bgDrag = undefined;
    if (this.synthCanvas.dragging) {
      this.synthCanvas.release();
      this.mechanismSrv.save();
    }
  }

  /**
   * Whether a synthesis gesture has the pointer.
   *
   * Read by the pan guard, which cannot inject the canvas service -- that
   * service needs the grid's own zoom, so the two would depend on each other.
   * The static is how everything else in this file answers that question.
   */
  static isSynthesisGestureLive(): boolean {
    return this.instance?.synthCanvas.dragging ?? false;
  }

  // --- Synthesis on the canvas -------------------------------------------
  //
  // Thin plumbing only: every handler turns a screen point into a model point
  // and hands it to SynthesisCanvasService, which decides what it means. None
  // of it goes through the mechanism's own drag state -- a position is a
  // question about a machine, not part of one.

  /** Take hold of a position by its body, its turn knob, or a corner grip. */
  /**
   * Hold the pointer for the rest of the gesture.
   *
   * The canvas hears `pointerup` only on itself, so a drag released anywhere
   * else -- over the panel, off the window -- was never told it had ended: the
   * gesture stayed live, which left the canvas unpannable and the search frozen
   * until something else was clicked. Capture makes the release come back here
   * whatever it happens over.
   */
  private holdPointer(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && target.hasPointerCapture !== undefined) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Some pointers cannot be captured; the window-level release below is
        // what covers those.
      }
    }
  }

  startPoseGesture(event: PointerEvent, id: number, mode: 'move' | 'rotate' | 'length'): void {
    // The left button only. A right-press is asking for the menu, and taking
    // the pointer for a drag took the menu with it.
    if (event.button !== 0) return;
    event.stopPropagation();
    this.synthPressTaken = true;
    this.holdPointer(event);
    const at = this.svgGrid.screenToSVGfromXY(event.clientX, event.clientY);
    this.synthCanvas.grabPose(at, id, mode);
    if (this.synthesisBuilder.isPoseDefined(id)) {
      const pose = this.synthesisBuilder.getPose(id);
      this.setLastLeftClick(pose);
      this.activeObjService.updateSelectedObj(pose);
    }
  }

  /** Take hold of the ground-pivot region, or draw a new one. */
  startRegionGesture(event: PointerEvent, mode: 'move' | 'corner' | 'draw', corner?: string): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.synthPressTaken = true;
    this.holdPointer(event);
    const at = this.svgGrid.screenToSVGfromXY(event.clientX, event.clientY);
    this.synthCanvas.grabRegion(at, mode, corner);
  }

  /**
   * The wheel turns the position about to be dropped.
   *
   * Only while placing is armed, and only then: the wheel is the canvas zoom
   * the rest of the time, and svg-pan-zoom has been asked to stand down for
   * exactly as long as this gesture is running.
   */
  onCanvasWheel(event: WheelEvent): void {
    if (!this.showSynthesis() || !this.synthesisBuilder.armed) return;
    if (this.synthesisBuilder.getFirstUndefinedPose() === undefined) return;
    event.preventDefault();
    this.synthCanvas.turnGhost(event.deltaY);
  }

  /** Where the hint beside the pointer sits while a position is being placed. */
  get synthesisHint(): { x: number; y: number; text: string; sub: string } | undefined {
    const cursor = this.synthCanvas.cursor;
    if (!this.showSynthesis() || !cursor) return undefined;
    if (this.synthesisBuilder.regionDraw) {
      return {
        x: cursor.x,
        y: cursor.y,
        text: 'Drag to draw the region',
        sub: '',
      };
    }
    const next = this.synthesisBuilder.getFirstUndefinedPose();
    if (!this.synthesisBuilder.armed || next === undefined) return undefined;
    return {
      x: cursor.x,
      y: cursor.y,
      text: 'Click to drop position ' + next,
      sub: 'Scroll to turn · ' + this.synthCanvas.ghostAngleLabel(),
    };
  }

  /** Whether a synthesis handle claimed the press that is in flight. */
  private synthPressTaken = false;

  mouseDown($event: MouseEvent) {
    // Log the time that the mouse was clicked
    this.timeMouseDown = new Date().getTime();
    this.synthPressTaken = false;
    this.dragState.press();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;
    this.svgGrid.cursorAt = mousePosInSvg;
    // Where a link drag measures its offset from. Without anchoring it here the
    // first move would translate the link by the distance from whatever
    // unrelated pointer event came last — a jump on grab.
    this.linkDragAnchor = mousePosInSvg;
    this.bodyDragOrigin = undefined;

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // The second click of the two-point cylinder gesture commits wherever
        // it lands — over grid, joint or link alike — with the cursor as the
        // rod's end, exactly where the ghost has been standing.
        if (this.dragState.grid === gridStates.createCylinder) {
          this.commitCylinderCreation(mousePosInSvg);
          break;
        }
        switch (this.lastLeftClickType) {
          case 'Grid':
            switch (this.dragState.grid) {
              case gridStates.createJointFromGrid:
                //Here's where you actaully make the link
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.mouseLocation.x.toString(),
                  this.mouseLocation.y.toString(),
                  joint1.id
                );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
              case gridStates.createJointFromJoint:
                joint2 = this.mechanismSrv.createRevJoint(
                  this.mouseLocation.x.toString(),
                  this.mouseLocation.y.toString()
                );
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
              case gridStates.createJointFromLink:
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.mouseLocation.x.toString(),
                  this.mouseLocation.y.toString(),
                  joint1.id
                );
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                // Through the same door every other creation gesture uses: this is
                // where a link is given its colour, and the two branches that built
                // one directly skipped it. The link came out in RealLink's own
                // stand-in grey -- and the ghost the gesture had just drawn was in
                // the palette colour it was promised, so the bar changed colour at
                // the moment of the click.
                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                if (
                  this.activeObjService.selectedLink.isWelded &&
                  this.activeObjService.selectedLink.lastSelectedSublink
                ) {
                  this.activeObjService.selectedLink.lastSelectedSublink.id =
                    this.activeObjService.selectedLink.lastSelectedSublink?.id.concat(joint1.id);
                  this.activeObjService.selectedLink.lastSelectedSublink.fixedLocations.push({
                    id: joint1.id,
                    label: joint1.id,
                  });
                  this.activeObjService.selectedLink.lastSelectedSublink.joints.push(joint1);
                }
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.activeObjService.selectedLink.d =
                  this.activeObjService.selectedLink.getPathString();
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
              case gridStates.createForce:
                const startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
                const endCoord = this.svgGrid.screenToSVG(
                  new Coord($event.clientX, $event.clientY)
                );
                this.mechanismSrv.createForce(startCoord, endCoord, this.forceCreateOn);
                this.dragState.finishCreating();
                this.forceGhost = undefined;
                this.forceCreateOn = undefined;
                break;
            }
            break;
          case 'Joint':
            // Get the joint that was clicked on and top left of the rectangualr bounds
            switch (this.dragState.grid) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.activeObjService.selectedJoint;
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                // PositionSolver.setUpSolvingForces(link.forces); // needed to determine force location when dragging a joint
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
              case gridStates.createJointFromJoint:
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                // );

                joint2 = this.activeObjService.selectedJoint;
                let commonLinkCheck = false;
                // Make sure link is not being attached to the same link
                joint2.links.forEach((l) => {
                  if (commonLinkCheck) return;
                  if (
                    this.activeObjService.prevSelectedJoint.links.findIndex(
                      (li) => li.id === l.id
                    ) !== -1
                  ) {
                    commonLinkCheck = true;
                  }
                });
                if (commonLinkCheck) {
                  this.dragState.finishCreating();
                  this.linkCreateStart = undefined;
                  this.notify.refusal(
                    'link.already-joined',
                    'Those two joints are already on one link.'
                  );
                  return;
                }
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
              case gridStates.createJointFromLink:
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint2 = this.activeObjService.selectedJoint;
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                // Through the same door every other creation gesture uses: this is
                // where a link is given its colour, and the two branches that built
                // one directly skipped it. The link came out in RealLink's own
                // stand-in grey -- and the ghost the gesture had just drawn was in
                // the palette colour it was promised, so the bar changed colour at
                // the moment of the click.
                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                break;
            }
            switch (this.dragState.joint) {
              case jointStates.waiting: {
                // Decided at the grab, not per pointer move: a locked joint
                // never enters the dragging state, so nothing downstream has
                // to remember to hold it still.
                const grabbed = this.activeObjService.selectedJoint;
                if (this.gridUtils.isJointFrozen(grabbed)) {
                  this.heldGestureNotice = () => this.refuseLockedJoint(grabbed);
                  break;
                }
                this.dragState.beginDraggingJoint();
                break;
              }
            }
            break;
          case 'Link':
            if (this.dragState.isCreatingLink) {
              this.notify.refusal(
                'link.needs-a-joint',
                'A link joins two joints. Add a tracer point to that bar, then draw to it.'
              );
              this.dragState.cancel();
              this.linkCreateStart = undefined;
              break;
            }
            if (this.dragState.link === linkStates.waiting) {
              // Of the joints this drag would carry: none locked moves freely,
              // exactly one turns the drag into a swing about that joint —
              // the only motion the linkage would allow if the pin were
              // bolted down — and two or more leave the body nowhere to go.
              const held = this.frozenCarriedJoints(this.activeObjService.selectedLink);
              if (held.length >= 2) {
                const grabbedLink = this.activeObjService.selectedLink;
                this.heldGestureNotice = () => this.refuseHeldLink(grabbedLink, held);
                break;
              }
              if (held.length === 1) {
                this.linkRotationPivot = new Coord(held[0].x, held[0].y);
                this.linkRotationGrabAngle = Math.atan2(
                  mousePosInSvg.y - held[0].y,
                  mousePosInSvg.x - held[0].x
                );
              } else {
                this.linkRotationPivot = undefined;
              }
              this.dragState.beginDraggingLink();
            }
            break;
          case 'Force':
            console.log('force is last left click');
            switch (this.dragState.force) {
              case forceStates.waiting:
                if (this.activeObjService.selectedForce.locked) {
                  const grabbedForce = this.activeObjService.selectedForce;
                  this.heldGestureNotice = () => this.refuseLockedForce(grabbedForce);
                  break;
                }
                if (this.activeObjService.selectedForce.isStartSelected) {
                  this.dragState.beginDraggingForceStart();
                } else if (this.activeObjService.selectedForce.isEndSelected) {
                  this.dragState.beginDraggingForceEnd();
                } else {
                  // Neither handle: the arrow itself was grabbed, so the whole
                  // force moves. This is the ordinary way to pick one up —
                  // reaching for the little square at its tail is not.
                  this.dragState.beginDraggingForceBody();
                }
            }
            break;
          // 'JointTemp' used to be here: clicking the ghost joint the old
          // line-and-dot preview drew at the start of the gesture. Nothing sets
          // that type any more, and a click back on the joint itself is caught
          // where the link is actually built — with a better sentence, because
          // by then it knows the two joints already share a bar.
        }
        break;
      // TODO: Be sure all things reset
      case 1: // Middle-Click
        this.dragState.cancel();
        this.cylinderCreateStart = undefined;
        this.linkCreateStart = undefined;
        return;
      case 2: // Right-Click
        this.dragState.cancel();
        this.cylinderCreateStart = undefined;
        this.linkCreateStart = undefined;
        break;
    }
  }

  debug() {
    console.log('debug');
  }

  handleTap() {
    if (this.lastLeftClick == 'grid') {
      console.log('tap on grid');
      this.activeObjService.updateSelectedObj(undefined);
    }
  }

  getFirstPosCoords(link: Link) {
    // The link's own machine, and its joint found by name. Indexing another
    // mechanism's frames by this drawing's array position would label the link
    // at some unrelated joint's coordinates.
    const solved = this.mechanismSrv.mechanismContaining(link);
    const anchor = link.joints[0];
    return solved?.joints[0]?.find((candidate) => candidate.id === anchor.id) ?? anchor;
  }

  getFirstXPos(link: Link) {
    return this.getFirstPosCoords(link).x;
  }

  getFirstYPos(link: Link) {
    return this.getFirstPosCoords(link).y;
  }

  /**
   * The slider marks of §2.8, recomputed only when something they depend on has
   * actually moved.
   *
   * Change detection asks for these far more often than the mechanism changes —
   * and during playback it asks every frame across ~360 timesteps — so the
   * fingerprint is what keeps the glyphs cheap. It is deliberately built from
   * the same values the marks are: anything that can change a mark and not the
   * fingerprint would be a stale drawing.
   */
  private markCache?: { key: string; marks: SliderMark[]; channels: Channel[] };

  get sliderMarkList(): SliderMark[] {
    const marks = this.freshMarks().marks;
    const slot = this.slotCandidate;
    if (!slot || this.dragState.joint !== jointStates.dragging) return marks;
    const pinID = this.activeObjService.selectedJoint?.id;
    if (!pinID) return marks;
    const slotAngleDeg = (Math.atan2(slot.b.y - slot.a.y, slot.b.x - slot.a.x) * 180) / Math.PI;
    // Re-framed rather than re-stamped: turning the frame alone turns the
    // riders with it, and this getter is read several times a change and once
    // per pointer move, so the turned geometry is kept until the angle moves.
    return marks.map((mark) => {
      if (mark.pin.id !== pinID) return mark;
      if (this.previewMark?.key !== `${pinID}|${slotAngleDeg}` || this.previewMark.from !== mark) {
        this.previewMark = {
          key: `${pinID}|${slotAngleDeg}`,
          from: mark,
          mark: { ...this.sliderMarks.reframed(mark, slotAngleDeg), dangling: false },
        };
      }
      return this.previewMark.mark;
    });
  }

  /** The one re-framed mark of a drop preview, kept while its angle holds. */
  private previewMark?: { key: string; from: SliderMark; mark: SliderMark };

  get channelList(): Channel[] {
    return this.freshMarks().channels;
  }

  /**
   * A carrier's outline with its channels cut out of it.
   *
   * The link already fills even-odd, so appending a channel subpath subtracts
   * it, and the link's own stroke then traces the new edge in the link's own
   * colour — the channel is a hole in the bar rather than a lighter shape laid
   * on top, which is what keeps its legibility independent of the random colour
   * that bar happens to have. A bar carrying two slots simply gets two
   * subpaths.
   */
  /**
   * Where each grounded guide sits in the world, and how far along itself its
   * block runs.
   *
   * Measured over the solved timesteps rather than read off the joint, because
   * during playback the joint *is* the thing sliding: anchoring the rails to it
   * makes the track travel with the block, which is only visible once the
   * mechanism is playing and looks like the whole guide has come loose.
   *
   * An unsolved or invalid linkage has no timesteps, and then the joint's own
   * position is the only frame there is -- which is also the right one, since
   * nothing is moving.
   */
  private guides(): Map<string, Guide> {
    const found = new Map<string, Guide>();
    // Every machine in the drawing, because a rail belongs to whichever one
    // slides along it. Reading one mechanism's frames would leave the guides of
    // every other linkage undrawn.
    for (const mechanism of this.mechanismSrv.mechanisms) {
      const frames = mechanism?.isMechanismValid() ? mechanism.joints : undefined;
      if (!frames?.length) continue;

      const rest = frames[0];
      for (const joint of rest) {
        if (!(joint instanceof PrisJoint) || !joint.ground) continue;
        const angle = joint.slotAngle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let lo = 0;
        let hi = 0;
        for (const frame of frames) {
          const at = frame.find((member) => member.id === joint.id);
          if (!at) continue;
          const along = (at.x - joint.x) * cos + (at.y - joint.y) * sin;
          lo = Math.min(lo, along);
          hi = Math.max(hi, along);
        }
        found.set(joint.id, { x: joint.x, y: joint.y, lo, hi });
      }
    }
    return found;
  }

  /**
   * Pins that carry the drive but no block and no ground.
   *
   * Grounded pins already have the black input arrow, and a slider's drive
   * shows as straight arrows on its block. This is the case with neither: the
   * freedom is a rotation, so the overlay is the curved arrow, and it supplies
   * its own dark backing because there is nothing underneath to guarantee the
   * white will read.
   */
  get drivenFloatingPins(): Joint[] {
    return this.mechanismSrv
      .getJoints()
      .filter(
        (joint) =>
          this.gridUtils.getInput(joint) &&
          !this.gridUtils.getGround(joint) &&
          this.gridUtils.typeOfJoint(joint) === 'R' &&
          !this.gridUtils.isAttachedToSlider(joint)
      );
  }

  /**
   * Each driven pin, in the frame of the body its motor is bolted to.
   *
   * An actuator has a reference body and a driven one (§2.9). The motor's case
   * is fixed to the reference body and its shaft turns the other, so the mark
   * is drawn along the reference body's direction — which is what lets the
   * fillets meet that bar and makes the pair read as one welded piece.
   */
  get drivenPinMotors(): {
    id: string;
    x: number;
    y: number;
    angle: number;
    bodyId: string | undefined;
  }[] {
    return this.drivenFloatingPins.map((joint) => {
      const actuator = resolveActuator(joint);
      const reference = actuator
        ? angleReference(actuator.referenceBody, joint as RealJoint)
        : undefined;
      // Degrees, in the same frame the joints are drawn in: the layer's own
      // y-flip is what turns this into a screen angle, so the mark must not
      // pre-flip it as well or it lands mirrored about the bar.
      const angle = reference
        ? (Math.atan2(reference.y - joint.y, reference.x - joint.x) * 180) / Math.PI
        : 0;
      const bodyId =
        actuator && actuator.referenceBody !== GROUND_BODY
          ? (actuator.referenceBody as Link).id
          : undefined;
      return { id: joint.id, x: joint.x, y: joint.y, angle, bodyId };
    });
  }

  /**
   * How many channels this carrier holds. Published on the element because a
   * cut channel is otherwise indistinguishable from a compound link's extra
   * subpath, and a test that cannot tell them apart is not testing the channel.
   */
  /**
   * The sealed cylinders, always wearing their skin. Sealed ⇔ skinned: there
   * is no reveal on selection and no per-session preference any more.
   */
  private cylinderListCache?: {
    revision: number;
    pose: number;
    scale: number;
    forward: boolean;
    paint: string;
    list: CylinderMark[];
  };

  /**
   * The drawn cylinder marks, cached per mechanism revision. This getter runs
   * for every template binding on every change-detection pass — dozens of
   * times per pointer move — and each uncached call re-resolved every
   * assembly and rebuilt every path string, which is where the quarter-second
   * interaction stutters came from.
   *
   * Keyed on the pose as well as the structure. A mark is a drawing of where
   * the joints *are*, and against the structure revision alone the skin stayed
   * painted where the mechanism was built while the linkage under it animated.
   * And on the paint, because a skin wears its barrel's colour: without it the
   * Visual Settings picker moved its own swatch and repainted nothing.
   */
  get cylinderList(): CylinderMark[] {
    const revision = this.mechanismSrv.cylinderRevision;
    const pose = this.mechanismSrv.poseRevision;
    const scale = this.settings.objectScale;
    const forward = !this.settings.isInputCW.value;
    const paint = this.linkPaint();
    const cache = this.cylinderListCache;
    if (
      !cache ||
      cache.revision !== revision ||
      cache.pose !== pose ||
      cache.scale !== scale ||
      cache.forward !== forward ||
      cache.paint !== paint
    ) {
      this.cylinderListCache = {
        revision,
        pose,
        scale,
        forward,
        paint,
        list: this.sliderMarks.cylinderMarks(this.mechanismSrv.getJoints(), 0.15 * scale, forward),
      };
    }
    return this.cylinderListCache!.list;
  }

  /**
   * Which of the cylinder panel's two size fields is being pointed at, if any.
   * 'travel' is how far the rod goes; 'start' is where in that it sits now.
   */
  cylinderRangeOverlay?: 'travel' | 'start';

  setCylinderRangeOverlay(which: 'travel' | 'start' | undefined): void {
    this.cylinderRangeOverlay = which;
  }

  /**
   * The centre-of-mass distance being pointed at in the Edit panel, drawn
   * where it is measured: from the chosen frame's zero, along one axis, to
   * the link's centre of mass. The panel hands the points over because the
   * frame choice lives there, not here.
   */
  comMeasure?: {
    axis: 'x' | 'y';
    origin: { x: number; y: number };
    com: { x: number; y: number };
    /* 'origin' measures along the frame origin's own line with a dashed run
       up to the mark; 'axis' (the global-grid frame) measures at the CoM's
       height straight to the grid's axis line, which needs no connector. */
    mode: 'origin' | 'axis';
  };

  setComMeasureOverlay(measure: NewGridComponent['comMeasure']): void {
    this.comMeasure = measure;
  }

  /**
   * The selected link's CoM mark is a handle, not just a glyph: drag it to
   * place a custom centre of mass, exactly as typing in the panel's X/Y
   * would. Only the selected link's mark — a whole canvas of grabbable
   * marks would fight the links they sit on for every click.
   */
  comDraggable(link: Link): boolean {
    return (
      link instanceof RealLink &&
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink === link &&
      !this.mechanismSrv.cylinderAt(link) &&
      this.canEditNow()
    );
  }

  /**
   * Where the shape's own centre sits, for a link whose CoM was placed
   * elsewhere: the custom mark is defined as an offset from this point, so
   * the point deserves to be visible while the mark is off wandering.
   */
  comCentroidDot(link: Link): { x: number; y: number } | null {
    if (!(link instanceof RealLink) || !link.comIsCustom) return null;
    const centroid = uniformBodyOf(link.joints).centroid;
    if (Math.hypot(centroid.x - link.CoM.x, centroid.y - link.CoM.y) < 1e-6) return null;
    return centroid;
  }

  /** Live while a CoM mark rides the pointer; the ring stays lit through it. */
  draggingCoMLink?: RealLink;

  startComDrag(link: RealLink, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.draggingCoMLink = link;
    const move = (e: PointerEvent) => {
      const pos = this.svgGrid.screenToSVGfromXY(e.clientX, e.clientY);
      const placed = e.altKey ? pos : this.snapComToJointLines(link, pos);
      link.placeCustomCoM({ x: placed.x, y: placed.y });
      // So the panel's X/Y read the drag as it happens, like a force's do.
      this.activeObjService.fakeUpdateSelectedObj();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.draggingCoMLink = undefined;
      // One undo step for the whole gesture, then the panel re-reads its
      // fields the same way a unit change makes it re-read them.
      this.mechanismSrv.updateMechanism(true);
      this.mechanismSrv.onMechUpdateState.next(2);
      this.activeObjService.fakeUpdateSelectedObj();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /**
   * A dragged centre snaps to the lines a reader would put it on: the
   * centreline of a bar, each side of a triangle — every joint-pair segment
   * of the link. Alt suspends it, like every other snap on the canvas.
   */
  private snapComToJointLines(link: RealLink, pos: Coord): { x: number; y: number } {
    const joints = link.joints;
    let best: { x: number; y: number } | undefined;
    let bestDist = this.svgGrid.scaleWithZoom(12);
    // The centroid outranks the lines: it is the point the whole feature is
    // an offset from, and a pointer near it means it exactly.
    const centroid = uniformBodyOf(joints).centroid;
    if (Math.hypot(pos.x - centroid.x, pos.y - centroid.y) < bestDist) {
      return centroid;
    }
    for (let i = 0; i < joints.length; i++) {
      for (let j = i + 1; j < joints.length; j++) {
        const a = joints[i];
        const b = joints[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        if (!(lengthSq > 0)) continue;
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / lengthSq));
        const proj = { x: a.x + t * dx, y: a.y + t * dy };
        const dist = Math.hypot(pos.x - proj.x, pos.y - proj.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = proj;
        }
      }
    }
    return best ?? pos;
  }

  /** Which cylinder part's mass field is being pointed at in the panel. */
  cylinderPartPreview?: 'barrel' | 'rod' | 'head';

  setCylinderPartPreview(part: NewGridComponent['cylinderPartPreview']): void {
    this.cylinderPartPreview = part;
  }

  /** The pointed-at part's own outline, in the hover accent — barrel and rod
   *  by their skins, the piston head by the block that draws it. */
  cylinderPartPreviewPath(cyl: CylinderMark): string | null {
    if (!this.cylinderPartPreview || !this.isBodySelected(cyl)) return null;
    if (this.cylinderPartPreview === 'barrel') return cyl.barrel;
    if (this.cylinderPartPreview === 'rod') return cyl.rod;
    return cyl.block;
  }

  /** The measured stretch: the frame's zero to the CoM's coordinate on one axis. */
  comMeasureLine(m: NonNullable<NewGridComponent['comMeasure']>) {
    if (m.mode === 'axis') {
      const to = m.axis === 'x' ? { x: 0, y: m.com.y } : { x: m.com.x, y: 0 };
      return { from: { x: m.com.x, y: m.com.y }, to };
    }
    const to = m.axis === 'x' ? { x: m.com.x, y: m.origin.y } : { x: m.origin.x, y: m.com.y };
    return { from: m.origin, to };
  }

  /** End caps like the length overlay's: short bars across the line. */
  comMeasureCaps(m: NonNullable<NewGridComponent['comMeasure']>): string {
    const { from, to } = this.comMeasureLine(m);
    const t = SettingsService.objectScale / 7;
    return m.axis === 'x'
      ? `M${from.x} ${from.y - t} L${from.x} ${from.y + t} M${to.x} ${to.y - t} L${to.x} ${to.y + t}`
      : `M${from.x - t} ${from.y} L${from.x + t} ${from.y} M${to.x - t} ${to.y} L${to.x + t} ${to.y}`;
  }

  /** A dashed run from the line's end to the mark it measures to. */
  comMeasureConnector(m: NonNullable<NewGridComponent['comMeasure']>): string {
    if (m.mode === 'axis') return '';
    const { to } = this.comMeasureLine(m);
    return `M${to.x} ${to.y} L${m.com.x} ${m.com.y}`;
  }

  comMeasureLabelPos(m: NonNullable<NewGridComponent['comMeasure']>) {
    const { from, to } = this.comMeasureLine(m);
    const off = 0.25 * this.settings.objectScale;
    return m.axis === 'x'
      ? { x: (from.x + to.x) / 2, y: from.y + off }
      : { x: from.x + off, y: (from.y + to.y) / 2 };
  }

  comMeasureValue(m: NonNullable<NewGridComponent['comMeasure']>): number {
    return m.axis === 'x' ? Math.abs(m.com.x - m.origin.x) : Math.abs(m.com.y - m.origin.y);
  }

  /**
   * The stretch of ground the rod's mount covers, drawn on the canvas.
   *
   * One picture for both fields, because they are two readings of one line:
   * *Travel* is how long it is, and *Starts at* is how far along it the ram is
   * standing. Drawn as the mount's own path rather than as a bar beside the
   * barrel — what a user wants to see when typing a stroke is where the end of
   * the ram will get to, and that is a place on the grid rather than a length
   * in the abstract.
   *
   * Nothing is drawn for a ram with no usable travel: the line would be a point
   * and the number beside it a zero, which says less than the panel already does.
   */
  get cylinderRange():
    { from: Coord; to: Coord; at: Coord; showsPosition: boolean; label: string } | undefined {
    if (!this.cylinderRangeOverlay) return undefined;
    const sealed = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
    if (!sealed) return undefined;
    const r = 0.15 * this.settings.objectScale;
    const size = cylinderSizeOf(sealed, r);
    if (!(size.stroke > 0)) return undefined;

    const { barrelFar, rodFar } = sealed;
    const span = Math.hypot(rodFar.x - barrelFar.x, rodFar.y - barrelFar.y);
    if (!(span > 1e-9)) return undefined;
    const ux = (rodFar.x - barrelFar.x) / span;
    const uy = (rodFar.y - barrelFar.y) / span;
    const at = (along: number) => new Coord(barrelFar.x + along * ux, barrelFar.y + along * uy);

    const ends = cylinderSpanRange(size.stroke, r);
    const showsPosition = this.cylinderRangeOverlay === 'start';
    return {
      from: at(ends.retracted),
      to: at(ends.extended),
      at: at(span),
      showsPosition,
      label: showsPosition
        ? `${Math.round(size.start * 1000) / 10}%`
        : this.nup.formatModelLength(size.stroke, this.settings.lengthUnit.getValue()),
    };
  }

  /** Whether the slot-angle field is being pointed at. */
  slotAngleOverlay = false;

  setSlotAngleOverlay(showing: boolean): void {
    this.slotAngleOverlay = showing;
  }

  /**
   * What a grounded slot's angle is measured from, drawn where the slot is.
   *
   * The panel used to say "Slot angle measured from the +x axis" underneath the
   * field, which is a sentence explaining a picture. This is the picture: a ray
   * out along +x from the block, the slot's own direction, and the arc between
   * them carrying the number. Nothing has to be read to know which way a bigger
   * number turns the slot, because the arc is already going that way.
   */
  get slotAngleGuide():
    | { at: Coord; axis: Coord; along: Coord; arc: string; label: string; labelAt: Coord }
    | undefined {
    if (!this.slotAngleOverlay) return undefined;
    const slider = this.mechanismSrv.sliderFor(this.activeObjService.selectedJoint);
    if (!slider || !slider.ground) return undefined;

    // Clear of the block, which is itself about 0.58 object scales across the
    // joint: drawn any smaller the whole guide hides underneath the part it is
    // describing, which is how the first cut of it looked.
    const radius = 1.8 * this.settings.objectScale;
    const angle = slider.slotAngle;
    const at = new Coord(slider.x, slider.y);
    const axis = new Coord(at.x + radius, at.y);
    const along = new Coord(at.x + radius * Math.cos(angle), at.y + radius * Math.sin(angle));

    // Swept from +x to the slot, the short way round, so the arc reads as the
    // angle the number names rather than as its reflex twin.
    const swept = Math.atan2(Math.sin(angle), Math.cos(angle));
    const arcRadius = radius * 0.62;
    const arcEnd = new Coord(
      at.x + arcRadius * Math.cos(swept),
      at.y + arcRadius * Math.sin(swept)
    );
    const sweepFlag = swept >= 0 ? 1 : 0;
    const arc =
      `M ${at.x + arcRadius} ${at.y} ` +
      `A ${arcRadius} ${arcRadius} 0 0 ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`;

    const halfway = swept / 2;
    const labelRadius = arcRadius + 0.16 * this.settings.objectScale;
    return {
      at,
      axis,
      along,
      arc,
      label: `${Math.round(((swept * 180) / Math.PI) * 10) / 10}°`,
      labelAt: new Coord(
        at.x + labelRadius * Math.cos(halfway),
        at.y + labelRadius * Math.sin(halfway)
      ),
    };
  }

  /** End ticks across the travel line, so its two ends read as limits. */
  cylinderRangeCaps(range: { from: Coord; to: Coord }): Segment[] {
    const dx = range.to.x - range.from.x;
    const dy = range.to.y - range.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const half = 0.12 * this.settings.objectScale;
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;
    return [range.from, range.to].map((end) => ({
      x1: end.x - nx,
      y1: end.y - ny,
      x2: end.x + nx,
      y2: end.y + ny,
    }));
  }

  /** The label sits clear of the line, on the side away from the barrel. */
  cylinderRangeLabelPos(range: { from: Coord; to: Coord }): Coord {
    const dx = range.to.x - range.from.x;
    const dy = range.to.y - range.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const off = 0.28 * this.settings.objectScale;
    return new Coord(
      (range.from.x + range.to.x) / 2 - (dy / length) * off,
      (range.from.y + range.to.y) / 2 + (dx / length) * off
    );
  }

  /**
   * Whether the selection is this cylinder's body, however it was selected.
   *
   * Including by selecting the whole machine it belongs to: the cylinder is
   * drawn as one part by its own skin rather than through the link classes, so
   * it was the one body a machine-wide selection left unlit.
   */
  isBodySelected(mark: CylinderMark): boolean {
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink?.id === mark.body.id
    ) {
      return true;
    }
    return this.mechanismSrv.isPartInSelectedMechanism(mark.body);
  }

  /** The reader is pointing at this cylinder's machine in the transport. */
  isBodyHovered(mark: CylinderMark): boolean {
    return this.mechanismSrv.isPartInHoveredMechanism(mark.body) || this.isBodyPointedAt(mark);
  }

  /** Or at this ram itself, from a list that offers it as one part. */
  isBodyPointedAt(mark: CylinderMark): boolean {
    return this.mechanismSrv.isPointedAtBody(mark.body);
  }

  /**
   * The selection stroke traces the part's exact silhouette — sharp at every
   * profile step, curved only at the two end caps. The mark computes it
   * analytically, so there is no union to pay for or to soften the corners.
   */
  cylinderSilhouette(mark: CylinderMark): string {
    return mark.contour;
  }

  /** A link the cylinder skin is standing in for, so it is not drawn twice. */
  private skinnedLink(link: Link): CylinderMark | undefined {
    return this.cylinderList.find((mark) => mark.barrelId === link.id || mark.rodId === link.id);
  }

  /**
   * Everything in the slider layer, deepest first.
   *
   * A block is above the carrier it slides in; a link is above the block it is
   * pinned to. Emitting each assembly as a unit — block, then its riders — can
   * only honour those two while no link is ever both a carrier and a rider, and
   * the Scotch yoke's yoke is exactly that. It also put one assembly's block
   * over another's rider whenever the two shared a link, which is what a pair
   * of dangling blocks on one bar looks like. Ordering by depth is the same two
   * rules, applied to the chain rather than to a layer number.
   */
  get slotStack(): SlotStackItem[] {
    const depths = drawDepths(this.mechanismSrv.getJoints());
    const items: SlotStackItem[] = [];
    for (const mark of this.sliderMarkList) {
      if (this.isSkinned(mark)) continue;
      const blockDepth = depths.block.get(mark.id) ?? 1;
      items.push({ key: `${mark.id}:block`, depth: blockDepth, kind: 'block', mark });
      const plate = mark.plate;
      if (plate) {
        items.push({
          key: `${mark.id}:plate`,
          depth: depths.link.get(plate.links[0]?.id ?? '') ?? blockDepth + 1,
          kind: 'plate',
          mark,
          plate,
        });
      }
      for (const rider of mark.riders) {
        items.push({
          key: `${mark.id}:${rider.link.id}`,
          depth: depths.link.get(rider.link.id) ?? blockDepth + 1,
          kind: 'rider',
          mark,
          rider,
        });
      }
    }
    return items.sort((a, b) => a.depth - b.depth);
  }

  /**
   * The weight of a grounded guide's rails, matched to the ground symbol a
   * grounded pin already uses.
   *
   * `Ground.svg` is placed at 1.2 objectScale and draws its baseline 4/157 of
   * its own width, so this is that same line in model units. It deliberately
   * does not go through `scaleWithZoom`: that keeps a stroke a constant number
   * of screen pixels, and the asset beside it does not, so across a 25x zoom
   * range a rail went from half the hatch's weight to twelve times it. The two
   * marks say the same thing about the same world, so they have to be drawn the
   * same way, and the asset is the one that cannot change.
   *
   * Stated in R by `GROUND_STROKE` rather than here, because the hatch geometry
   * needs the same two numbers to sit its ticks against the rail, and a stroke
   * the drawing and the geometry each carry their own copy of is a stroke they
   * can disagree about.
   */
  get groundLineWidth(): number {
    return GROUND_STROKE.rail * 0.15 * this.settings.objectScale;
  }

  /** The hatch bars of that same symbol, drawn at 5/157 of its width. */
  get groundHatchWidth(): number {
    return GROUND_STROKE.hatch * 0.15 * this.settings.objectScale;
  }

  /**
   * A link its own slider assembly is drawing: either fused into a weld plate,
   * or hoisted above the block it is pinned to. Either way the link layer has
   * to leave it alone, or it is drawn twice at 0.7 alpha over itself.
   */
  private platedLink(link: Link): boolean {
    return this.sliderMarkList.some((mark) => {
      if (this.isSkinned(mark)) return false;
      if (mark.plate?.links.some((rider) => rider.id === link.id)) return true;
      return mark.riders.some((rider) => rider.link.id === link.id);
    });
  }

  /** A slider the cylinder skin has replaced. */
  isSkinned(mark: SliderMark): boolean {
    return this.cylinderList.some((cylinder) => cylinder.pin.id === (mark.pin as Joint).id);
  }

  /**
   * A cylinder's interior joints — the buried barrel end, the pin, and the
   * sliding joint — get no hitbox, hover, label or selection at all. Only the
   * two mounts remain selectable; the skin's own geometry selects the body.
   */
  isCylinderInterior(joint: Joint): boolean {
    // Checked against the structural resolution as well as the drawn marks:
    // the marks are geometric, and mid-edit (a weld landing, a drag in
    // flight) they can lag a frame — long enough for an interior label to
    // blink into view.
    if (
      this.cylinderList.some(
        (mark) =>
          mark.hiddenJointId === joint.id ||
          mark.pin.id === joint.id ||
          mark.cylinder.slider.id === joint.id
      )
    ) {
      return true;
    }
    const sealed = this.mechanismSrv.cylinderAt(joint);
    return !!sealed && isCylinderInteriorOf(sealed, joint);
  }

  /**
   * What a link's canvas tag calls it. A sealed cylinder's interior joints are
   * an implementation detail, so its letters come from the two mounts alone —
   * and a compound that swallowed a member keeps only its visible letters too.
   */
  /** One tag per part: the rod defers to the barrel's tag. */
  isSecondaryCylinderTag(link: Link): boolean {
    const sealed = this.mechanismSrv.cylinderAt(link);
    return !!sealed && link.id !== sealed.barrel.id;
  }

  /** Nothing on the canvas can be moved in an analysis mode. */
  get geometryLocked(): boolean {
    return this.tabService.isAnalysisMode();
  }

  /**
   * The ink the "this is not attached to anything" marks are drawn in.
   *
   * Red on the canvas means "fix this", which is a thing to do in Edit. In an
   * analysis mode the same geometry is scenery -- greyed out, not analysed, not
   * even selectable -- so a red ring around it is the loudest thing on a canvas
   * about something the reader cannot act on and did not ask about. It goes
   * grey with the rest of the body it marks.
   */
  get orphanMarkInk(): string {
    return this.tabService.isAnalysisMode() ? '#b6bac6' : '#F44336';
  }

  /** The pale fill inside that mark, likewise. */
  get orphanMarkFill(): string {
    return this.tabService.isAnalysisMode() ? '#d9dbe2' : '#c5cae9';
  }

  /**
   * How big a name on the canvas is drawn, for joints, links and forces alike.
   *
   * A fraction of the object scale rather than a pixel size, so a name keeps
   * its proportion to the part it names at every zoom level.
   */
  get tagFontSize(): number {
    return this.settings.objectScale * 0.2;
  }

  /**
   * The angle a link's name is written at, in degrees clockwise from flat.
   *
   * A bar is long and thin, and a name longer than a couple of letters written
   * across it hangs off both edges. Written along it, it has the whole bar to
   * sit in. Only bars: a compound body is not a direction, and a two-letter
   * name already fits, so both stay level and stay easy to read.
   *
   * Kept within a quarter turn of flat, so the name is never upside down.
   */
  private linkLabelAngle(link: Link, name: string): number {
    if ((link.joints?.length ?? 0) !== 2) return 0;
    if (name.length <= 2) return 0;
    const [from, to] = link.joints;
    // Screen degrees: y runs down here, and the label sits in a frame that has
    // already flipped it, so the rise is negated.
    let angle = (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return Math.round(angle * 10) / 10;
  }

  /**
   * Whether this link's centre-of-mass mark is on screen right now.
   *
   * The view toggle governs it, but a massless link is excused: mass starts at
   * zero until someone chooses one, and a centre-of-mass mark on a link with no
   * mass points at a property the link does not have. The preview (hovering
   * the analysis panel's centre-of-mass heading) still shows it, because there
   * the reader is asking about exactly that property.
   */
  showsCoM(link: Link): boolean {
    if (this.settings.previewCoMLinkId === link.id) return true;
    // A slider block carries mass but has no centre-of-mass mark to draw --
    // getLinkProp declines it -- so asking for one drew four undefined
    // quarters. The rule is a body with a mass, and a block is not one of the
    // bodies this mark is about.
    return this.settings.isShowCOM.value && link instanceof RealLink && link.mass > 0;
  }

  /**
   * Where a link's name goes, and in what ink.
   *
   * The anchor is the average of the joints the link is made of, which is
   * inside the hull they describe -- and the body is drawn around that hull, so
   * it is inside the body. Not the centre of mass, which is a physical property
   * with a field of its own in the Edit panel: a link told its mass sits out at
   * one end is a link whose name was written off the metal.
   *
   * Two bodies are not their own hull. A welded link is the Boolean union of
   * its parts and can be any shape at all -- an L has nothing in the crook --
   * so the name goes in the middle of its biggest part, which is inside the
   * union because that part is. And a bar carrying a slot is drawn as a rail
   * with a channel down it, so the name goes in the channel, in full black:
   * there is no body colour behind it there to be read against.
   */
  linkLabelStyle(link: Link): {
    x: number;
    y: number;
    ink: string;
    opacity: number;
    name: string;
    angle: number;
  } {
    const name = this.linkDisplayName(link);
    const angle = this.linkLabelAngle(link, name);
    const slot = this.slotCarriedBy(link);
    if (slot) {
      const [from, to] = [slot.slotJointA!, slot.slotJointB!];
      return {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
        ink: 'black',
        opacity: 1,
        name,
        angle,
      };
    }
    const parts = (link instanceof RealLink ? link.subset : []) ?? [];
    const middleOf = (of: Link) => {
      const joints = of.joints ?? [];
      if (joints.length === 0) return { x: 0, y: 0 };
      return {
        x: joints.reduce((total, joint) => total + joint.x, 0) / joints.length,
        y: joints.reduce((total, joint) => total + joint.y, 0) / joints.length,
      };
    };
    const span = (part: Link) => {
      const first = part.joints[0];
      const last = part.joints[part.joints.length - 1];
      return first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0;
    };
    const on =
      parts.length === 0
        ? link
        : parts.reduce((best, part) => (span(part) > span(best) ? part : best));
    return { ...middleOf(on), ink: this.linkLabelInk(link), opacity: 0.55, name, angle };
  }

  /** The slot this bar carries, if it is a plain bar carrying one. */
  private slotCarriedBy(link: Link): PrisJoint | undefined {
    if ((link.joints?.length ?? 0) !== 2) return undefined;
    return this.mechanismSrv.joints.find(
      (joint): joint is PrisJoint =>
        joint instanceof PrisJoint &&
        joint.carrier?.id === link.id &&
        !!joint.slotJointA &&
        !!joint.slotJointB
    );
  }

  /**
   * Black or white, whichever the link's own colour can be read against.
   *
   * The label sits on the body it names, and the bodies run from pale mint to
   * navy, so one ink cannot serve them all. Relative luminance decides it, the
   * same rule a contrast checker uses.
   */
  linkLabelInk(link: Link): string {
    // A body the analysis modes have nothing to say about is drawn in one pale
    // grey whatever colour it was given, so its name is read against that grey
    // rather than against the colour it no longer wears. A dark link's white
    // name went invisible the moment the body went grey under it.
    if (this.mechanismSrv.isPartInert(link)) return 'black';
    const fill = (link as { fill?: string }).fill ?? '#ffffff';
    const hex = fill.replace('#', '');
    if (hex.length < 6) return 'black';
    const channel = (at: number) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    return luminance > 0.45 ? 'black' : 'white';
  }

  linkDisplayName(link: Link): string {
    const sealed = this.mechanismSrv.cylinderAt(link);
    if (!sealed) return link.name;
    const interior = new Set(
      [sealed.pin.id, sealed.slider.id, sealed.barrelNear.id].map((id) => id)
    );
    const stripped = [...link.name].filter((letter) => !interior.has(letter)).join('');
    if (link.id === sealed.barrel.id || link.id === sealed.rod.id) {
      return `${sealed.barrelFar.name}${sealed.rodFar.name}`;
    }
    return stripped || link.name;
  }

  /** A member link of a sealed cylinder: never a slot-drop target. */
  private isCylinderMemberLink(link: Link): boolean {
    return this.cylinderList.some(
      (mark) =>
        mark.barrelId === link.id || mark.rodId === link.id || mark.cylinder.block.id === link.id
    );
  }

  /**
   * Whether the link layer draws this body with holes in it. A skinned or
   * plated link is drawn somewhere else, and its holes are handed back there.
   */
  hasChannelHit(link: Link): boolean {
    return this.channelCountOn(link) > 0 && !this.skinnedLink(link) && !this.platedLink(link);
  }

  channelCountOn(link: Link): number {
    return (
      this.channelList.filter((channel) => channel.carrierId === link.id).length +
      (this.slotCandidate?.carrier.id === link.id ? 1 : 0)
    );
  }

  /**
   * Where the motor's turning arrow is drawn: exactly where a grounded input
   * draws its own. The wider circle the arrow rides is in the asset, not here,
   * so the two stay the same weight and the same placement.
   */
  get motorArrowBox(): { size: number; x: number; y: number } {
    const box = this.settings.objectScale * 1.2;
    return { size: box, x: -0.505 * box, y: -0.435 * box };
  }

  /** The motor's case in its own frame, for the black layer beneath the links. */
  get drivenPinCase(): string {
    return motorBodyPath(0.15 * this.settings.objectScale);
  }

  /** The unioned outline, per pose, so the clipping is not redone every frame. */
  private motorUnionCache?: { pose: number; scale: number; byLink: Map<string, string> };

  /**
   * A link's outline, with the motor's case fused into it where one is bolted
   * on (§2.9).
   *
   * A union rather than a black box laid behind: the motor's case *is* part of
   * the body it is bolted to, and drawing it as a separate shape in a separate
   * colour says the opposite -- that it is an ornament sitting on the joint.
   * Same Boolean and the same fillet a welded compound uses, so a motor reads
   * as the app's other rigid attachments read.
   */
  private outlineWithMotor(link: Link): string {
    const outline = String(this.mechanismSrv.getLinkProp(link, 'd') ?? '');
    const pose = this.mechanismSrv.poseRevision;
    const scale = this.settings.objectScale;
    if (this.motorUnionCache?.pose !== pose || this.motorUnionCache.scale !== scale) {
      this.motorUnionCache = { pose, scale, byLink: new Map() };
    }
    const cached = this.motorUnionCache.byLink.get(link.id);
    if (cached !== undefined) return cached;

    const r = 0.15 * scale;
    const cases = this.drivenPinMotors
      .filter((motor) => motor.bodyId === link.id)
      .map((motor) => motorBodyAt(r, { x: motor.x, y: motor.y }, (motor.angle * Math.PI) / 180));
    const fused =
      cases.length === 0 ? outline : buildCompoundPath([outline, ...cases], MARK.fillet * r).path;
    this.motorUnionCache.byLink.set(link.id, fused);
    return fused;
  }

  linkPathWithChannels(link: Link): string {
    // A skinned barrel or rod is drawn by the cylinder instead, so its ordinary
    // outline is suppressed rather than drawn underneath — otherwise the skin
    // would be a shape laid over the shape it replaces.
    if (this.skinnedLink(link)) return '';
    // Likewise a welded rider: its weld plate draws the rider and the block it
    // is fused to as one outline, so drawing the rider here as well would put
    // its own edge inside that outline and double the fill's alpha over itself.
    if (this.platedLink(link)) return '';
    const outline = this.outlineWithMotor(link);
    const channels = this.channelsCutInto(link);

    return channels === '' ? outline : `${outline} ${channels}`;
  }

  /**
   * The channels cut into this link, as one path in the world frame.
   *
   * The slot being previewed goes through the same subtraction a committed one
   * does, rather than being drawn as a stand-in on top. Two reasons: the hover
   * state is then pixel-identical to the result, and a real hole has no
   * legibility to lose against a link colour it cannot predict -- every
   * stand-in considered (a white fill, an outline, an amber highlight) fell
   * below contrast on part of the palette, because the palette is random.
   */
  channelsCutInto(link: Link): string {
    const paths = this.channelList
      .filter((channel) => channel.carrierId === link.id)
      .map((channel) => channel.path);
    const preview = this.previewChannelOn(link);
    if (preview) paths.push(preview);
    return paths.length === 0 ? '' : mergedChannels(paths);
  }

  /**
   * A rider or plate outline with the previewed slot cut into it as well.
   *
   * The preview has to reach whatever is actually drawing the link. Once a
   * rider is hoisted out of the link layer, cutting the preview into the link
   * layer's copy cuts it into nothing, and sweeping a joint across a coupler
   * that happens to be pinned to a slider shows no feedback at all.
   *
   * The preview is merged with the piece's committed channels rather than
   * appended after them, for the same reason `linkPathWithChannels` merges: on
   * a carrier whose slot is already occupied the preview lands on top of the
   * committed channel, the overlap is wound twice, and the even-odd fill paints
   * the slot back in — a solid bar exactly where the drop is legal.
   */
  markPathWithPreview(
    mark: SliderMark,
    piece: { path: string; outline: string; cuts: string[] },
    link: Link
  ): string {
    const preview = this.previewChannelOn(link);
    if (!preview) return piece.path;
    return `${piece.outline} ${this.markChannelsCutInto(mark, piece, link)}`.trim();
  }

  /**
   * The same channels on their own, in the mark's frame: what the piece's `d`
   * has taken out of itself, for the hit shape that hands the holes back.
   */
  markChannelsCutInto(
    mark: SliderMark,
    piece: { outline: string; cuts: string[] },
    link: Link
  ): string {
    const preview = this.previewChannelOn(link);
    if (!preview) return piece.cuts.length === 0 ? '' : mergedChannels(piece.cuts);
    const angle = (mark.rotation * Math.PI) / 180;
    const localPreview = transformRigidPath(
      preview,
      { x: mark.x, y: mark.y },
      { x: mark.x + Math.cos(angle), y: mark.y + Math.sin(angle) },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );
    return mergedChannels([...piece.cuts, localPreview]);
  }

  private previewChannelOn(link: Link): string | undefined {
    const slot = this.slotCandidate;
    if (!slot || slot.carrier.id !== link.id) return undefined;
    const r = 0.15 * this.settings.objectScale;
    const separation = Math.hypot(slot.b.x - slot.a.x, slot.b.y - slot.a.y);
    return orientedCapsulePath(
      { x: (slot.a.x + slot.b.x) / 2, y: (slot.a.y + slot.b.y) / 2 },
      Math.atan2(slot.b.y - slot.a.y, slot.b.x - slot.a.x),
      slotHalfLength(r, separation),
      MARK.channelHalfWidth * r
    );
  }

  /**
   * The welded marker, at the 1.47R the mark system specifies.
   *
   * It replaces a hand-written path that predates the system and drew 2.2R —
   * larger than the free circle it stands opposite, which inverted the reading
   * that a weld removes a freedom. One marker, one size, everywhere.
   */
  get weldMarkerPath(): string {
    return plusPath(0.15 * this.settings.objectScale);
  }

  /**
   * Every link's colour, as one string.
   *
   * A mark can be painted in a link's own colour — a Slide's weld plate is its
   * rider's, a cylinder's skin is its barrel's — so recolouring changes a mark
   * while moving nothing at all. Every cache down here is keyed on where things
   * *are*, and a colour is the one edit that changes what is drawn without
   * changing that, so it has to be in the key or the panel shows the new colour
   * beside a canvas still wearing the old one.
   */
  private linkPaint(): string {
    return this.mechanismSrv
      .getLinks()
      .map((link) => `${link.id}:${(link as RealLink).fill}`)
      .join(',');
  }

  private freshMarks(): { marks: SliderMark[]; channels: Channel[] } {
    const joints = this.mechanismSrv.getJoints();
    const r = 0.15 * this.settings.objectScale;
    const key =
      `${r}|${this.linkPaint()}|${this.settings.isInputCW.value}|` +
      joints
        .map((joint) => {
          const real = joint as RealJoint;
          const base = `${joint.id},${joint.x.toFixed(6)},${joint.y.toFixed(6)},${real.ground},${real.input},${real.isWelded}`;
          // Rebinding a slot changes its channel without moving anything, and a
          // grounded guide's angle turns its whole mark while every coordinate
          // in the mechanism stays exactly where it was -- so both have to be in
          // here, or editing the angle field redraws nothing.
          return joint instanceof PrisJoint
            ? `${base},${joint.angle_rad},${joint.carrier?.id},${joint.slotJointA?.id},${joint.slotJointB?.id}`
            : base;
        })
        .join(';');
    if (this.markCache?.key !== key) {
      this.markCache = {
        key,
        marks: this.sliderMarks.marks(joints, r, this.guides(), !this.settings.isInputCW.value),
        channels: this.sliderMarks.channels(joints, r),
      };
    }
    return this.markCache;
  }

  /**
   * Re-answer "what would this drop do?" when Alt is pressed or let go.
   *
   * A modifier emits no pointer event, so without this the ring would sit there
   * claiming a target that Alt has already called off, and the user would have
   * to jiggle the mouse to find out whether the key registered. Alt also
   * releases a captured joint back to the cursor, because suppressing the snap
   * while leaving the joint parked on the target says the opposite.
   */
  @HostListener('window:keyup', ['$event'])
  onAltReleased($event: KeyboardEvent) {
    this.reconsiderDrop($event, false);
  }

  private reconsiderDrop($event: KeyboardEvent, held: boolean) {
    if ($event.key !== 'Alt') return;
    if (this.dragState.joint !== jointStates.dragging) return;

    this.updateDropCandidate(this.mouseLocation, held);
    const restingOn = this.snapTargetJoint ?? this.mouseLocation;
    this.activeObjService.selectedJoint = this.gridUtils.dragJoint(
      this.activeObjService.selectedJoint,
      new Coord(restingOn.x, restingOn.y)
    );
    this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
  }

  // Angular keys host listeners by event name, so this component gets exactly
  // one window:keydown. Alt is the only key the canvas reads for itself: it
  // means something only while a drag is in flight, which is state no registry
  // outside this component can see. Every other key is a shortcut, and those
  // are declared once in KeyboardShortcutsService and answered below.
  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    this.reconsiderDrop($event, true);
  }

  /** Answer the shortcuts whose action is the canvas's own. */
  private onShortcut(id: ShortcutId): void {
    switch (id) {
      case 'edit.deselect':
        this.activeObjService.updateSelectedObj(undefined);
        return;
      case 'edit.delete':
        // Every key that changes the drawing is held outside Edit, not just
        // the two that had the check. An analysis mode is a reading of a
        // finished mechanism: it hides the lock marks, greys the panels and
        // takes Undo away -- and Delete was still going through, removing a
        // joint from a drawing the reader was in the middle of measuring, with
        // no way back short of leaving the mode.
        if (this.tabService.isAnalysisMode()) return;
        this.deleteSelection();
        return;
      case 'edit.lock':
        if (this.tabService.isAnalysisMode()) return;
        this.toggleLockOnSelection();
        return;
      case 'history.undo':
      case 'history.redo':
        // Nothing to take back in the analysis modes, which is why the buttons
        // are not there either.
        if (this.tabService.isAnalysisMode()) return;
        if (id === 'history.redo') {
          this.saveHistoryService.redo();
        } else {
          this.saveHistoryService.undo();
        }
        return;
    }
  }

  /**
   * Lock or unlock whatever is selected -- the same act as the panel's own
   * Lock button, which is the only other way to do it.
   *
   * With nothing selected the key has no target, and says so rather than doing
   * nothing: a lock is not a state the grid as a whole can be in.
   */
  private toggleLockOnSelection(): void {
    const selected = this.activeObjService.getSelectedObj();
    if (
      !(selected instanceof RealJoint) &&
      !(selected instanceof Link) &&
      !(selected instanceof Force)
    ) {
      this.notify.refusal(
        'lock.nothing-selected',
        'Select something first — Lock holds whatever is selected.'
      );
      return;
    }
    this.mechanismSrv.toggleLock(selected);
  }

  private deleteSelection(): void {
    if (this.activeObjService.objType === 'Grid') {
      this.notify.refusal(
        'delete.nothing-selected',
        'Select something first — Delete removes whatever is selected.'
      );
      return;
    }
    if (this.activeObjService.objType === 'Joint') {
      this.mechanismSrv.deleteJoint();
    } else if (this.activeObjService.objType === 'Link') {
      this.mechanismSrv.deleteLink();
    } else if (this.activeObjService.objType === 'Force') {
      // A force is a thing on the drawing with a Delete of its own in its
      // menu, so the key that says "delete what is selected" has to mean it
      // here too. Left out, the key cleared the selection and left the arrow
      // standing -- which reads as a delete that did not take.
      this.mechanismSrv.deleteForce();
    }
    this.activeObjService.updateSelectedObj(undefined);
  }

  returnDebugValue() {
    return NewGridComponent.debugValue;
  }

  getDebugPointX(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.x;
  }

  getDebugPointY(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.y;
  }

  getDebugPoints() {
    return NewGridComponent.debugPoints;
  }

  getDebugLines(): Line[] {
    return NewGridComponent.debugLines;
  }

  findStartAndEndPoints() {
    let x1, y1, x2, y2;
    if (this.showLinkAngleOverlay == -2) {
      switch (this.showLinkLengthOverlay) {
        case -2:
          //Throw an error
          throw new Error(
            'showLinkLengthOverlay should not be -2, this means an overlay was requested even though the objects to show the overlay based on was not selected'
          );
          break;
        case -1: {
          const link = this.activeObjService.selectedLink;
          // A cylinder body's span is mount to mount, not the barrel's own
          // two joints (one of which is buried inside the part).
          const sealed = this.mechanismSrv.cylinderAt(link);
          const [from, to] = sealed ? [sealed.barrelFar, sealed.rodFar] : link.joints;
          x1 = from.x;
          y1 = from.y;
          x2 = to.x;
          y2 = to.y;
          break;
        }
        default:
          let thisJoint = this.activeObjService.selectedJoint;
          let otherJoint =
            EditPanelComponent.instance.listOfOtherJoints[this.showLinkLengthOverlay];
          x1 = thisJoint.x;
          y1 = thisJoint.y;
          x2 = otherJoint.x;
          y2 = otherJoint.y;
      }
    } else {
      switch (this.showLinkAngleOverlay) {
        case -2:
          //Throw an error
          throw new Error(
            'showLinkLengthOverlay should not be -2, this means an overlay was requested even though the objects to show the overlay based on was not selected'
          );
          break;
        case -1: {
          const link = this.activeObjService.selectedLink;
          const sealed = this.mechanismSrv.cylinderAt(link);
          const [from, to] = sealed ? [sealed.barrelFar, sealed.rodFar] : link.joints;
          x1 = from.x;
          y1 = from.y;
          x2 = to.x;
          y2 = to.y;
          break;
        }
        default:
          let thisJoint = this.activeObjService.selectedJoint;
          let otherJoint = EditPanelComponent.instance.listOfOtherJoints[this.showLinkAngleOverlay];
          x1 = thisJoint.x;
          y1 = thisJoint.y;
          x2 = otherJoint.x;
          y2 = otherJoint.y;
      }
    }

    return { x1, y1, x2, y2 };
  }

  getSVGPerpendicularLine1() {
    //Return the SVG path of the line that is perpendicular to the first line and intersects the first line at the first joint
    //The line will be 1 unit long and will be centered at the first joint
    //It will act was an end cap for the line to represnet the lenght of the line
    let length = SettingsService.objectScale / 7;

    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope of the original line
    let m1 = (y2 - y1) / (x2 - x1);

    //Find the slope of the perpendicular line
    let m2 = -1 / m1;

    //Find the angle of the perpendicular line
    let angle = Math.atan(m2);

    //Find the endpoints of the perpendicular line
    let x3 = x1 + length * Math.cos(angle);
    let y3 = y1 + length * Math.sin(angle);
    let x4 = x1 - length * Math.cos(angle);
    let y4 = y1 - length * Math.sin(angle);

    //Return the SVG path of the perpendicular line
    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPerpendicularLine2() {
    //Same as getSVGPerpendicularLine1 but for the second joint
    let length = SettingsService.objectScale / 7;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    let m1 = (y2 - y1) / (x2 - x1);
    let m2 = -1 / m1;
    let angle = Math.atan(m2);

    let x3 = x2 + length * Math.cos(angle);
    let y3 = y2 + length * Math.sin(angle);
    let x4 = x2 - length * Math.cos(angle);
    let y4 = y2 - length * Math.sin(angle);

    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPrimaryAxisLine1() {
    //Return the SVG path of the line that is the primary axis
    //Cut the middle 1/3 of the line off, return two lines that are 1/3 of the length of the original line
    //Each line should start the joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the length of the original line
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1); //Use atan2 instead of atan

    //Find the coordinates of the points that divide the line into three equal parts
    let x3 = x1 + (length / 3) * Math.cos(angle);
    let y3 = y1 + (length / 3) * Math.sin(angle);

    //Return the SVG paths of the two lines that start from the joints and end at the middle points
    return 'M' + x1 + ' ' + y1 + ' L' + x3 + ' ' + y3;
  }

  getSVGPrimaryAxisLine2() {
    //Return the SVG path of the line that is the primary axis
    //Cut the middle 1/3 of the line off, return two lines that are 1/3 of the length of the original line
    //Each line should start the joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the length of the original line
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1); //Use atan2 instead of atan

    //Find the coordinates of the points that divide the line into three equal parts
    let x4 = x2 - (length / 3) * Math.cos(angle);
    let y4 = y2 - (length / 3) * Math.sin(angle);

    //Return the SVG paths of the two lines that start from the joints and end at the middle points
    return 'M' + x4 + ' ' + y4 + ' L' + x2 + ' ' + y2;
  }

  getSVGAngleOverlayLines() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 2;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + length * Math.cos(angle);
    let y3 = y1 + length * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Return the SVG paths of the angle overlay without the arrow
    let line1 = 'M' + x3 + ' ' + y3 + ' L' + x1 + ' ' + y1;
    let line2 = ' M' + x1 + ' ' + y1 + ' L' + x4 + ' ' + y4;

    //Return the SVG path of the angle overlay with the arrow
    return line1 + line2;
  }

  getSVGAngleOverlayArc() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 1.8;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + lengthOfIndicator * Math.cos(angle);
    let y3 = y1 + lengthOfIndicator * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Find the direction and flags for drawing the arc
    //Assume that we want to draw a quarter circle with radius equal to lengthOfIndicator
    let sweepFlag = angle > 0 ? 1 : 0;

    //Return the SVG paths of the angle overlay without the arrow
    let arc =
      ' M' +
      x4 +
      ' ' +
      y4 +
      ' A' +
      lengthOfIndicator +
      ' ' +
      lengthOfIndicator +
      ' ' +
      '90' +
      ' ' +
      0 +
      ' ' +
      sweepFlag +
      ' ' +
      x3 +
      ' ' +
      y3;

    //Return the SVG path of the angle overlay with the arrow
    return arc;
  }

  protected readonly AngleUnit = AngleUnit;

  getSVGLengthOverlayTextPos() {
    //Return the average of the two joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let x = (x1 + x2) / 2;
    let y = (y1 + y2) / 2;
    return { x, y };
  }

  getSVGAngleOverlayTextPos() {
    //Get the positon to put the angle label
    //It needs to be at the midpoint of the arc which goes from x axis to the primary axis
    //But with an offset so it's farther from the radius
    //Make sure to use atan2
    const offSetRadius = SettingsService.objectScale * 2;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Calculate the angle between the x-axis and the primary axis
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Calculate the midpoint of the arc
    let midAngle = angle / 2;
    let midX = offSetRadius * Math.cos(midAngle);
    let midY = offSetRadius * Math.sin(midAngle);

    //Add the offset to the midpoint
    let labelX = midX + x1;
    let labelY = midY + y1;

    //Return an object with x and y properties
    return { x: labelX, y: labelY };
  }

  protected readonly RealJoint = RealJoint;

  secondJointIsGrounded(selectedLink: RealLink) {
    //If we are looking at distToJoints, we always move the 2nd joint
    if (this.activeObjService.objType == 'Joint') {
      return false;
    }
    return (selectedLink.joints[1] as RealJoint).ground;
  }

  getLengthBetweenOverlayPoints() {
    //Get the length between the two joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    return length;
  }

  getAngleBetweenOverlayPoints() {
    //Get the angle between the two joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Convert the angle to this.settings.angleUnit.getValue();
    switch (this.settings.angleUnit.getValue()) {
      case AngleUnit.DEGREE:
        angle = radToDeg(angle);
        break;
      case AngleUnit.RADIAN:
        break;
    }
    return angle;
  }
}
