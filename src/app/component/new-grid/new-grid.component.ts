import { SvgGridService } from '../../services/svg-grid.service';
import {
  AfterViewInit,
  Component,
  HostListener,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MechanismService } from '../../services/mechanism.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { cMenuItem } from '../context-menu/context-menu.component';
import { Link, RealLink } from '../../model/link';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import {
  forceStates,
  gridStates,
  is_touch_enabled,
  has_mouse_pointer,
  jointStates,
  line_line_intersect,
  linkStates,
  local_storage_available,
  isInside,
  getDistance,
  AngleUnit,
  radToDeg,
  GlobalUnit,
} from '../../model/utils';
import { Force } from '../../model/force';
import { PositionSolver } from '../../model/mechanism/position-solver';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatMenuTrigger } from '@angular/material/menu';
import { CdkContextMenuTrigger, Menu } from '@angular/cdk/menu';
import { MatDialog } from '@angular/material/dialog';
import { TouchscreenWarningComponent } from '../MODALS/touchscreen-warning/touchscreen-warning.component';
import * as util from 'util';
import { Line } from '../../model/line';
import { SaveHistoryService } from 'src/app/services/save-history.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { SynthesisPose } from 'src/app/services/synthesis/synthesis-util';
import {
  SynthesisClickMode,
  SynthesisConstants,
} from 'src/app/services/synthesis/synthesis-constants';
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
  barrelCollapsedPath,
  cylinderBlockPath,
  MARK,
  orientedCapsulePath,
  plusPath,
  rodBodyPath,
  slotHalfLength,
  motorBodyPath,
  motorBodyAt,
} from '../../model/joint-marks';
import {
  JointDropCandidate,
  MERGE_REFUSAL_MESSAGES,
  resolveDropCandidate,
  resolveSlotDropTarget,
  SlotDropCandidate,
} from '../../model/drop-target';
import { mergedChannels, transformRigidPath } from '../../model/compound-link-path';
import {
  Cylinder,
  cylinderCreationLayout,
  cylinderJoints,
  isCylinderInterior as isCylinderInteriorOf,
} from '../../model/cylinder';
import { SnapGuide, snapToAxes } from '../../model/axis-snap';
import { drawDepths } from '../../model/draw-order';
import { MODEL_SCALE } from '../../model/render-scale';
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
import introJs from 'intro.js';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NewGridComponent {
  public static debugValue: any;
  static debugPoints: Coord[] = [];
  public static debugLines: Line[] = [];

  public originInScreen: Coord = new Coord(0, 0);
  private timeMouseDown: number = 0;

  constructor(
    public svgGrid: SvgGridService,
    public mechanismSrv: MechanismService,
    private urlParser: UrlProcessorService,
    public gridUtils: GridUtilsService,
    public settings: SettingsService,
    public activeObjService: ActiveObjService,
    private tabService: SelectedTabService,
    public synthesisBuilder: SynthesisBuilderService,
    private snackBar: MatSnackBar,
    public dialog: MatDialog,
    public saveHistoryService: SaveHistoryService,
    private colorService: ColorService,
    public nup: NumberUnitParserService,
    public dragState: DragStateService,
    public sliderMarks: SliderMarkService
  ) {
    //This is for debug purposes, do not make anything else static!
    NewGridComponent.instance = this;
  }

  private svgGridElement!: HTMLElement;
  public cMenuItems: cMenuItem[] = [];
  public lastRightClick: Joint | Link | Force | String = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  public lastLeftClick: Joint | Link | Force | String | SynthesisPose = '';
  lastLeftClickType: string = 'Nothing';

  /**
   * The joint the one being dragged would merge into on release, or undefined.
   * Read by the template to draw the snap indicator.
   */
  public snapTargetJoint?: RevJoint;

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

  private jointTempHolderSVG!: SVGElement;
  private forceTempHolderSVG!: SVGElement;

  //This is terrible but:
  // -2 => hidden
  // -1 => Link length and angle shown
  // 0-N => Joint length and angle shown for joint N (in list from edit panel)
  public showLinkLengthOverlay: number = -2;
  public showLinkAngleOverlay: number = -2;

  static instance: NewGridComponent;
  private lastNotificationTime: number = Date.now();
  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;
  mouseLocation: Coord = new Coord(0, 0);
  lastMouseLocation: Coord = new Coord(0, 0);
  private synthesisClickMode: SynthesisClickMode = SynthesisClickMode.NORMAL;
  private synthesisRotateStart: number = 0;

  public sConstants = new SynthesisConstants();
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

  @ViewChild('trigger') contextMenu!: CdkContextMenuTrigger;

  ngOnInit() {
    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);

    let dismissWarning = local_storage_available() && localStorage.getItem('dismiss') === 'true';

    // Touchscreen warning for when no mouse pointer
    if (!dismissWarning && !has_mouse_pointer()) {
      this.dialog.open(TouchscreenWarningComponent, {
        autoFocus: false,
      });
    }

    if (this.mechanismSrv.joints.length == 0) {
      setTimeout(() => {
        introJs()
          .setOptions({
            steps: [
              {
                title: '👋 Welcome',
                intro: 'Let us show you around Planar Mechanism Kinematic Simulator Plus!',
              },
              {
                element: document.querySelector('.tabContainer') as HTMLElement,
                intro: 'PMKS+ is divided into 3 modes. Synthesis, Editing, and Analysis.',
              },
              {
                element: document.querySelector('#editWrapper') as HTMLElement,
                intro:
                  'The Edit mode is active. Selecting a joint or link will show its properties here.',
              },
              {
                element: document.querySelector('#barContainer') as HTMLElement,
                intro: 'Once the mechanism is created, you can animate it here.',
              },
              {
                element: document.querySelector('#helpButton') as HTMLElement,
                intro: 'If you get stuck at any point, click here for help.',
              },
              {
                element: document.querySelector('#templatesButton') as HTMLElement,
                title: "🙌 That's it!",
                intro: 'Get started by opening an example linkage!',
              },
            ],
            dontShowAgain: true,
          })
          .start();
      });
    }

    fromEvent(window, 'resize').subscribe((event) => {
      // console.log('resize');
      this.svgGrid.panZoomObject.resize();
      // this.svgGrid.panZoomObject.fit();
      // this.svgGrid.panZoomObject.center();
      // this.svgGrid.panZoomObject.resize();
      this.svgGrid.handlePan();
      // console.log(this.svgGrid.getZoom());
      // this.svgGrid.panZoomObject.updateBBox();
      // this.svgGrid.scaleToFitLinkage();
    });

    this.activeObjService.onActiveObjChange.subscribe((obj) => {
      this.showLinkAngleOverlay = -2;
      this.showLinkLengthOverlay = -2;
      //Disable focus on any text input when changing active object
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  ngAfterViewInit() {
    this.jointTempHolderSVG = document.getElementById('jointTempHolder') as unknown as SVGElement;
    this.forceTempHolderSVG = document.getElementById('forceTempHolder') as unknown as SVGElement;
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

  // whether to show the synthesis poses
  showSynthesis(): boolean {
    return this.tabService.getCurrentTab() === TabID.SYNTHESIZE;
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

  private objectKind(value: Joint | Link | String | Force | SynthesisPose): string {
    if (value instanceof Force) return 'Force';
    if (value instanceof RealLink) return 'RealLink';
    if (value instanceof PrisJoint) return 'PrisJoint';
    if (value instanceof RevJoint) return 'RevJoint';
    if (value instanceof SynthesisPose) return 'SynthesisPose';
    if (typeof value === 'string' || value instanceof String) return 'String';
    return 'Unknown';
  }

  updateContextMenuItems() {
    //Switch case based on what type the object is
    this.cMenuItems = [];
    switch (this.objectKind(this.lastRightClick)) {
      case 'Force':
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Force',
            this.mechanismSrv.deleteForce.bind(this.mechanismSrv),
            'remove'
          )
        );
        //Switch force direction, switch force local, delete Force
        this.cMenuItems.push(
          new cMenuItem(
            (this.lastRightClick as Force).local ? 'Make Force Global' : 'Make Force Local',
            this.mechanismSrv.changeForceLocal.bind(this.mechanismSrv),
            (this.lastRightClick as Force).local ? 'force_global' : 'force_local'
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Switch Force Direction',
            this.mechanismSrv.changeForceDirection.bind(this.mechanismSrv),
            'switch_force_dir'
          )
        );
        break;
      case 'RealLink': {
        // The BODY of a sealed cylinder: barrel, rod or the skin itself. Two
        // actions only — the assembly is one part, so no attach items (a
        // tracer on the barrel would be a third joint on a two-joint bar) and
        // Delete takes the whole cylinder (§ cylinder 3, 5).
        const bodyCylinder = this.mechanismSrv.cylinderAt(this.lastRightClick as RealLink);
        if (bodyCylinder) {
          this.cMenuItems.push(
            new cMenuItem(
              'Delete Cylinder',
              () => this.mechanismSrv.deleteCylinder(bodyCylinder),
              'remove'
            )
          );
          this.cMenuItems.push(
            new cMenuItem(
              bodyCylinder.slider.input ? 'Remove Input' : 'Make Input',
              () => this.mechanismSrv.toggleCylinderInput(bodyCylinder),
              bodyCylinder.slider.input ? 'remove_input' : 'add_input'
            )
          );
          break;
        }
        //Delete Link, Attach Link, Attach Tracer Point, Attach Joint
        //Don't give options if a fillet it selected and not a primary link
        let weldedLinkFilletSelected =
          (this.lastRightClick as RealLink).isWelded &&
          (this.lastRightClick as RealLink).lastSelectedSublink == null;

        this.cMenuItems.push(
          new cMenuItem(
            'Delete Link',
            this.mechanismSrv.deleteLink.bind(this.mechanismSrv),
            'remove'
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Attach Link',
            this.startCreatingLink.bind(this),
            'new_link',
            weldedLinkFilletSelected
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Attach Tracer Point',
            this.addJoint.bind(this),
            'add_tracer',
            weldedLinkFilletSelected
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Attach Force',
            this.createForce.bind(this),
            'add_force',
            weldedLinkFilletSelected
          )
        );
        break;
      }
      case 'RevJoint': {
        let jointIsSlider = this.gridUtils.isAttachedToSlider(this.lastRightClick);
        let jointIsGround = (this.lastRightClick as RealJoint).ground;
        let canToggleInput = this.gridUtils.canToggleInput(this.lastRightClick as RealJoint);
        const jointIsInput = this.gridUtils.isVisuallyInput(this.lastRightClick as RealJoint);

        // A MOUNT of a sealed cylinder (the interior joints have no hitboxes,
        // so no other member can arrive here). Ground and Weld stay; Slider is
        // structurally off the table, and Delete cascades to the whole part —
        // mirrored by the edit panel so the two surfaces cannot disagree.
        const mountCylinder = this.mechanismSrv.cylinderAt(this.lastRightClick as RealJoint);
        if (mountCylinder) {
          this.cMenuItems.push(
            new cMenuItem(
              'Delete Cylinder',
              () => this.mechanismSrv.deleteCylinder(mountCylinder),
              'remove'
            )
          );
          this.cMenuItems.push(
            new cMenuItem(
              'Attach Link',
              this.startCreatingLink.bind(this),
              'new_link',
              jointIsInput
            )
          );
          this.cMenuItems.push(
            new cMenuItem(
              jointIsGround ? 'Remove Ground' : 'Add Ground',
              this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
              jointIsGround ? 'remove_ground' : 'add_ground'
            )
          );
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).input ? 'Remove Input' : 'Make Input',
              this.mechanismSrv.adjustInput.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).input ? 'remove_input' : 'add_input',
              !canToggleInput
            )
          );
          this.cMenuItems.push(new cMenuItem('Add Slider', () => {}, 'add_slider', true));
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).isWelded ? 'Unweld Joint' : 'Weld Joint',
              this.mechanismSrv.toggleWeldedJoint.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).isWelded ? 'unweld_joint' : 'weld_joint',
              !this.gridUtils.canToggleWeld(this.lastRightClick as RealJoint)
            )
          );
          break;
        }
        let canTogglePath =
          !(this.lastRightClick as RealJoint).ground && this.mechanismSrv.oneValidMechanismExists();

        this.cMenuItems.push(
          new cMenuItem(
            'Delete Joint',
            this.mechanismSrv.deleteJoint.bind(this.mechanismSrv),
            'remove'
          )
        );

        // A third body at a driven joint is what "driven" stops being able to
        // describe (§2.9), so the item that would add one is greyed rather
        // than offered and then refused after the fact.
        this.cMenuItems.push(
          new cMenuItem('Attach Link', this.startCreatingLink.bind(this), 'new_link', jointIsInput)
        );

        // Enabled whatever else the joint is, exactly as the panel's toggle is:
        // Ground and Slider became independent axes of the 2x2 in §4.1, so
        // greying one out because of the other puts a reachable cell out of
        // reach from this surface and not from the other.
        this.cMenuItems.push(
          new cMenuItem(
            jointIsGround ? 'Remove Ground' : 'Add Ground',
            this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
            jointIsGround ? 'remove_ground' : 'add_ground'
          )
        ); //Rev Joint - Ground

        if (jointIsSlider) {
          this.cMenuItems.push(
            new cMenuItem(
              (this.gridUtils.getSliderJoint(this.lastRightClick as RealJoint) as RealJoint).input
                ? 'Remove Input'
                : 'Make Input',
              this.mechanismSrv.adjustInput.bind(this.mechanismSrv),
              (this.gridUtils.getSliderJoint(this.lastRightClick as RealJoint) as RealJoint).input
                ? 'remove_input'
                : 'add_input',
              !canToggleInput
            )
          ); //Rev Joint Slider
        } else {
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).input ? 'Remove Input' : 'Make Input',
              this.mechanismSrv.adjustInput.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).input ? 'remove_input' : 'add_input',
              !canToggleInput
            ) //Rev Joint - Input
          );
        }

        // A block is a body too, so adding one to a driven pin puts a third at
        // the joint exactly as attaching a link does. Removing one is always
        // allowed -- that direction takes a body away.
        this.cMenuItems.push(
          new cMenuItem(
            this.gridUtils.isAttachedToSlider(this.lastRightClick) ? 'Remove Slider' : 'Add Slider',
            this.mechanismSrv.toggleSlider.bind(this.mechanismSrv),
            this.gridUtils.isAttachedToSlider(this.lastRightClick) ? 'remove_slider' : 'add_slider',
            jointIsInput && !this.gridUtils.isAttachedToSlider(this.lastRightClick)
          )
        ); //Rev Joint - Always

        this.cMenuItems.push(
          new cMenuItem(
            (this.lastRightClick as RealJoint).isWelded ? 'Unweld Joint' : 'Weld Joint',
            this.mechanismSrv.toggleWeldedJoint.bind(this.mechanismSrv),
            (this.lastRightClick as RealJoint).isWelded ? 'unweld_joint' : 'weld_joint',
            // Greyed only when there is structurally nothing to fuse (fewer than
            // two links); a grounded or driven joint still gets the explained
            // refusal, exactly as the panel's toggle does.
            !this.gridUtils.canToggleWeld(this.lastRightClick as RealJoint)
          )
        ); //Rev Joint - the service explains a refusal, as the panel's toggle does

        // this.cMenuItems.push(
        //   new cMenuItem(
        //     (this.lastRightClick as RealJoint).showCurve ? 'Hide Path' : 'Show Path',
        //     () => {
        //       this.gridUtils.toggleCurve(this.lastRightClick);
        //     },
        //     (this.lastRightClick as RealJoint).showCurve ? 'hide_path' : 'show_path',
        //     !canTogglePath
        //   )
        // ); //Rev Joint - Not Ground and at least one valid mechanism exists
        break;
      }

      case 'String': //This means grid
        this.cMenuItems.push(
          new cMenuItem('Add Link', this.startCreatingLink.bind(this), 'new_link')
        );
        this.cMenuItems.push(
          new cMenuItem('Create Cylinder', this.startCreatingCylinder.bind(this), 'add_cylinder')
        );
    }
  }

  /** Where the two-point cylinder gesture started: the barrel-side mount. */
  private cylinderCreateStart?: Coord;

  /**
   * Begin the two-point cylinder gesture (§ cylinder 2), mirroring Add Link:
   * the right-click point is the barrel-side mount, a ghost of the assembly
   * tracks the cursor (which is where the ROD will finish), and the next
   * left-click commits. Right- or middle-click cancels, exactly as link
   * creation does.
   */
  startCreatingCylinder() {
    // Same first-object rule as link creation: fit the object scale to the
    // current zoom before anything is sized from it.
    if (this.mechanismSrv.links.length == 0) {
      this.svgGrid.updateObjectScale();
    }
    this.cylinderCreateStart = this.svgGrid.screenToSVG(this.lastRightClickCoord);
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
      barrel: barrelCollapsedPath(r, -creation.pinFromMount),
      rod: rodBodyPath(r, creation.rodLength),
      block: cylinderBlockPath(r),
    };
  }

  /** The left-click that ends the gesture: build the part, one undo entry. */
  private commitCylinderCreation(end: Coord) {
    const start = this.cylinderCreateStart;
    this.cylinderCreateStart = undefined;
    this.dragState.finishCreating();
    if (!start) return;
    this.mechanismSrv.createCylinderFrom(start, end);
  }

  setLastRightClick(clickedObj: Joint | Link | String | Force, event?: MouseEvent) {
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

  get mode(): typeof SynthesisClickMode {
    return SynthesisClickMode;
  }

  setSynthesisClickMode(mode: SynthesisClickMode) {
    console.log('Setting synthesis click mode to ' + mode);
    this.synthesisClickMode = mode;
    let pose = this.lastLeftClick as SynthesisPose;
    this.synthesisRotateStart =
      pose.thetaRadians -
      Math.atan2(this.mouseLocation.y - pose.position.y, this.mouseLocation.x - pose.position.x);
  }

  setLastLeftClick(clickedObj: Joint | Link | String | Force | SynthesisPose, event?: MouseEvent) {
    this.lastLeftClick = clickedObj;
    // console.warn('Last Left Click: ');
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
    // const newJoint = this.createRevJoint()
    // const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    // const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    // TODO: Make sure you add logic within here so that joint is part of fixedLocations for respective link subset
    const coord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );

    this.mechanismSrv.addJointAt(coord);
  }

  createForce() {
    this.dragState.beginCreatingForce();
    this.forceTempHolderSVG.style.display = 'block';
    this.mechanismSrv.onMechUpdateState.next(3);
  }

  creatingForce($event: MouseEvent) {
    const startCoord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );
    const mousePos = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.forceTempHolderSVG.children[0].setAttribute(
      'd',
      'M ' + startCoord.x + ' ' + startCoord.y + ' L ' + mousePos.x + ' ' + mousePos.y
    );
    this.forceTempHolderSVG.children[1].setAttribute(
      'd',
      'M ' + startCoord.x + ' ' + startCoord.y + ' L ' + mousePos.x + ' ' + mousePos.y
    );
  }

  startCreatingLink() {
    // console.log('createLink');
    // console.log(this.lastRightClickCoord);
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
    // const mouseRawPos = this.getMousePosition($event);
    // if (mouseRawPos === undefined) {
    //   return;
    // }
    // const mousePos = this.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    // // TODO: Within future, create a tempJoint and temp Link and set those values as these values in order to avoid
    // // TODO: having to call setAttribute and have HTML update for you automatically
    // console.log(startCoord);
    this.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    this.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    this.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    this.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    this.jointTempHolderSVG.style.display = 'block';
    // this.onMechUpdateState.next(3);
  }

  mouseMove($event: MouseEvent) {
    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.lastMouseLocation = this.mouseLocation;
    this.originInScreen = this.svgGrid.SVGtoScreen(new Coord(0, 0));
    this.mouseLocationRaw = new Coord($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;

    this.dragState.notePointerMoved();
    let deltaMouseX = this.mouseLocation.x - this.lastMouseLocation.x;
    let deltaMouseY = this.mouseLocation.y - this.lastMouseLocation.y;

    if (this.dragState.isPointerDown && this.lastLeftClickType === 'SynthesisPose') {
      if (this.synthesisClickMode === SynthesisClickMode.ROTATE) {
        let pose = this.lastLeftClick as SynthesisPose;
        let rotate =
          Math.atan2(
            this.mouseLocation.y - pose.position.y,
            this.mouseLocation.x - pose.position.x
          ) + this.synthesisRotateStart;
        if (!isNaN(rotate)) {
          this.gridUtils.setPoseTheta(pose, rotate);
        }
      } else {
        this.gridUtils.dragPose(
          this.activeObjService.selectedPose,
          deltaMouseX,
          deltaMouseY,
          this.synthesisClickMode
        );
      }
    }

    if (this.dragState.isCreatingLink || this.dragState.grid === gridStates.createForce) {
      this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
      this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
    }
    switch (this.dragState.joint) {
      case jointStates.creating:
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
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
        const draggedCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedJoint);
        if (draggedCylinder) {
          this.updateDropCandidate(mousePosInSvg, $event.altKey);
          this.slotCandidate = undefined;
          this.axisSnapGuides = [];
          const wanted = this.snapTargetJoint
            ? new Coord(this.snapTargetJoint.x, this.snapTargetJoint.y)
            : this.mountAxisSnap(draggedCylinder, mousePosInSvg);
          this.gridUtils.dragCylinderMount(
            draggedCylinder,
            this.activeObjService.selectedJoint,
            wanted
          );
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
              : this.alongItsSlot(this.activeObjService.selectedJoint, mousePosInSvg)
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
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
        break;
      case linkStates.dragging: {
        if (!this.canEditNow() || !this.pastDragThreshold($event)) {
          return;
        }
        // Measured from where the body was last placed, not from the previous
        // pointer event: the moves held back below the click threshold would
        // otherwise be lost motion, leaving the link trailing the cursor by
        // however far the hold lasted.
        const bodyCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
        if (bodyCylinder) {
          // Dragging the body translates the whole assembly rigidly; the
          // mounts are the handles for re-posing.
          this.gridUtils.dragCylinder(
            bodyCylinder,
            mousePosInSvg.x - this.linkDragAnchor.x,
            mousePosInSvg.y - this.linkDragAnchor.y
          );
        } else {
          this.gridUtils.dragLink(
            this.activeObjService.selectedLink,
            mousePosInSvg.x - this.linkDragAnchor.x,
            mousePosInSvg.y - this.linkDragAnchor.y
          );
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
        this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, false);
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        this.dragState.noteMechanismModified();
        break;
      case forceStates.draggingStart:
        if (!this.canEditNow()) {
          return;
        }

        //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
        const fake_link = document.getElementById(this.activeObjService.selectedLink.id) as unknown;
        const link_svg = fake_link as SVGElement;
        const geo = fake_link as SVGGeometryElement;
        let isIn = false;
        if (geo.isPointInFill) {
          const fakeGrid = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          const svgp = fakeGrid.createSVGPoint();
          svgp.x = mousePosInSvg.x;
          svgp.y = mousePosInSvg.y;
          isIn = geo.isPointInFill(svgp);
        } else {
          isIn = isInside([mousePosInSvg.x, mousePosInSvg.y], geo.getAttribute('d')); //1634 in SVGFuncs.ts
        }
        // force is in link. Check to make sure that the force is not on top of a joint
        if (isIn) {
          this.activeObjService.selectedLink.joints.forEach((j) => {
            if (!(j instanceof RealJoint)) {
              return;
            }
            const x = j.x;
            const y = j.y;
            const r = this.settings.objectScale * j.r * 2;
            let dx = x - mousePosInSvg.x;
            let dy = y - mousePosInSvg.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= r) {
              isIn = false;
            }
          });
        }
        if (isIn) {
          //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
          this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, true);
        }
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        this.dragState.noteMechanismModified();
        break;
    }
  }

  /**
   * Whether an edit is allowed right now, notifying the user when it is not.
   * Editing is only defined at the t=0 pose in Edit mode: the solved timesteps
   * are derived from it, so a change made anywhere else has nothing to write to.
   */
  private canEditNow(): boolean {
    if (AnimationBarComponent.animate) {
      this.sendNotification('Cannot edit while animation is running');
      return false;
    }
    if (this.mechanismSrv.mechanismTimeStep !== 0) {
      this.sendNotification('Stop animation (or reset to 0 position) to edit');
      return false;
    }
    if (this.tabService.getCurrentTab() === TabID.SYNTHESIZE) {
      this.sendNotification('Cannot edit while in Synthesis mode. Switch to Edit mode to edit');
      return false;
    }
    // Analyze already refuses to open an edit context menu (see onContextMenu),
    // but dragging bypassed that: the mode was read-only by menu only. Whole-link
    // drag would have widened the hole, so the guard covers every drag instead.
    if (this.tabService.getCurrentTab() === TabID.ANALYZE) {
      this.sendNotification('Analysis mode is read-only. Switch to Edit mode to edit');
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

  /** Lines showing which joints a drag has just squared itself against. */
  public axisSnapGuides: SnapGuide[] = [];

  /**
   * Pull a free drag onto a neighbour's axis when it is nearly on it.
   *
   * Only a free drag: a block is already constrained to its slot, and a capture
   * has a target of its own, so snapping either would be a second opinion about
   * where the joint goes.
   */
  private withAxisSnap(joint: Joint, wanted: Coord): Coord {
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
  private mountAxisSnap(sealed: Cylinder, wanted: Coord): Coord {
    const memberIds = new Set(cylinderJoints(sealed).map((joint) => joint.id));
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

  /** Shake the dropped joint and say why it could not land where it was aimed. */
  private refuseDrop(jointID: string, message: string): void {
    this.sendNotification(message);
    this.shakingJointID = jointID;
    setTimeout(() => (this.shakingJointID = undefined), 420);
  }

  /** Pop the survivor of a merge, so the change is legible where it happened. */
  private popJoint(jointID: string): void {
    this.poppingJointID = jointID;
    setTimeout(() => (this.poppingJointID = undefined), 400);
  }

  private showPathWhileDragging(): void {
    if (this.mechanismSrv.mechanisms[0].joints[0].length === 0) return;
    if (this.mechanismSrv.mechanisms[0].dof !== 1) return;
    if (this.mechanismSrv.showPathHolder === false) {
      this.mechanismSrv.onMechUpdateState.next(1);
    }
    this.mechanismSrv.showPathHolder = true;
  }

  onContextMenu($event: MouseEvent) {
    if (this.tabService.getCurrentTab() === TabID.SYNTHESIZE) {
      this.sendNotification('Cannot edit while in Synthesis mode. Switch to Edit mode to edit');
      this.cMenuItems = [];
      return;
    }

    if (this.tabService.getCurrentTab() === TabID.ANALYZE) {
      // Analyze mode is read-only. Show no edit menu; setLastRightClick has
      // already declined to change the selection.
      this.cMenuItems = [];
      return;
    }

    if (AnimationBarComponent.animate == true) {
      this.sendNotification('Cannot open context menu while animating. Stop animation to edit');
      this.cMenuItems = [];
      return;
    }
    if (this.mechanismSrv.mechanismTimeStep !== 0) {
      this.sendNotification('Reset to T=0 (or push stop button) to edit');
      this.cMenuItems = [];
      //Close the MatContextMenu
      // console.log(this.contextMenu);
      // this.contextMenu.close();
      return;
    }
    this.lastRightClickCoord.x = $event.clientX;
    this.lastRightClickCoord.y = $event.clientY;
    console.log('context menu');
    console.log(this.lastRightClickCoord);
  }

  mouseUp($event: MouseEvent) {
    //This is the mouseUp that is called no matter what is clicked on
    this.synthesisClickMode = SynthesisClickMode.NORMAL;
    // The alignment guides belong to the drag that made them.
    this.axisSnapGuides = [];

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
      this.refuseDrop(source.id, MERGE_REFUSAL_MESSAGES[refused.refusal]);
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
      this.refuseDrop(source.id, MERGE_REFUSAL_MESSAGES[refusal]);
      return false;
    }

    // A merged-into-welded joint re-welds itself, but a grounded, driven, or
    // slider-carrying survivor cannot be welded at all. Losing the weld
    // silently would leave the user with a linkage they did not ask for. A
    // merge that goes exactly as asked says nothing: the pop is the receipt.
    if (wasWelded && !target.isWelded) {
      this.sendNotification(
        `Merged joint ${source.id} into ${target.id}, but ${target.id} cannot be welded`
      );
    }
    this.popJoint(target.id);
    return true;
  }

  mouseDown($event: MouseEvent) {
    // Log the time that the mouse was clicked
    this.timeMouseDown = new Date().getTime();
    // console.warn('mouseDown');
    // console.log(typeChosen);
    // console.log(thing);
    // $event.preventDefault();
    // $event.stopPropagation();
    // this.disappearContext();
    this.dragState.press();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    // console.log(this.startX, this.startY);
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;
    // Where a link drag measures its offset from. Without anchoring it here the
    // first move would translate the link by the distance from whatever
    // unrelated pointer event came last — a jump on grab.
    this.linkDragAnchor = mousePosInSvg;

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // The second click of the two-point cylinder gesture commits wherever
        // it lands — over grid, joint or link alike — with the cursor as the
        // rod's end, exactly where the ghost has been standing.
        if (this.dragState.grid === gridStates.createCylinder) {
          this.commitCylinderCreation(mousePosInSvg);
          break;
        }
        // let clickPos = new Coord($event.pageX, $event.pageY);
        // let mousePosInSvg = this.svgGrid.screenToSVG(clickPos);
        // console.warn('Mouse down: ');
        // console.log(NewGridComponent.isInsideLink(this.mechanismSrv.links[0], mousePosInSvg));
        // console.warn(this.activeObjService.objType);
        switch (this.lastLeftClickType) {
          case 'Grid':
            switch (this.dragState.grid) {
              case gridStates.createJointFromGrid:
                //Here's where you actaully make the link
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                if (this.mechanismSrv.links.length == 0) {
                  // console.log('first link');
                  this.svgGrid.updateObjectScale();
                  // console.log(this.svgGrid.panZoomObject);
                  // console.log(this.svgGrid.panZoomObject.getZoom().toFixed(2));
                  // console.log(Number((70 / this.svgGrid.panZoomObject.getZoom()).toFixed(2)));
                }

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromJoint:
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!
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
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
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
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createForce:
                const startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
                // const endCoordRaw = this.getMousePosition($event);
                const endCoord = this.svgGrid.screenToSVG(
                  new Coord($event.clientX, $event.clientY)
                );
                this.mechanismSrv.createForce(startCoord, endCoord);
                this.dragState.finishCreating();
                this.forceTempHolderSVG.style.display = 'none';
                break;
            }
            break;
          case 'Joint':
            // this.jointXatMouseDown = thing.x;
            // this.jointYatMouseDown = thing.y;
            // Get the joint that was clicked on and top left of the rectangualr bounds
            switch (this.dragState.grid) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
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
                this.jointTempHolderSVG.style.display = 'none';
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
                  this.jointTempHolderSVG.style.display = 'none';
                  this.sendNotification("Don't link to a joint on the same link");
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
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
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
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
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
                this.jointTempHolderSVG.style.display = 'none';
                break;
            }
            switch (this.dragState.joint) {
              case jointStates.waiting:
                this.dragState.beginDraggingJoint();
                // this.selectedJoint = thing;
                break;
            }
            break;
          case 'Link':
            if (this.dragState.isCreatingLink) {
              this.sendNotification(
                'Cannot link to a bar. Please create and select a tracer point on the link.'
              );
              this.dragState.cancel();
              this.jointTempHolderSVG.style.display = 'none';
              break;
            }
            if (this.dragState.link === linkStates.waiting) {
              this.dragState.beginDraggingLink();
            }
            break;
          case 'Force':
            console.log('force is last left click');
            switch (this.dragState.force) {
              case forceStates.waiting:
                console.log(this.activeObjService.selectedForce);
                if (this.activeObjService.selectedForce.isStartSelected) {
                  this.dragState.beginDraggingForceStart();
                } else if (this.activeObjService.selectedForce.isEndSelected) {
                  this.dragState.beginDraggingForceEnd();
                }
            }
            break;
          case 'JointTemp':
            this.dragState.cancel();
            this.jointTempHolderSVG.style.display = 'none';
            this.sendNotification("Don't link a joint to itself");
        }
        break;
      // TODO: Be sure all things reset
      case 1: // Middle-Click
        this.dragState.cancel();
        this.cylinderCreateStart = undefined;
        this.jointTempHolderSVG.style.display = 'none';
        return;
      case 2: // Right-Click
        this.dragState.cancel();
        this.cylinderCreateStart = undefined;
        this.jointTempHolderSVG.style.display = 'none';
        break;
    }
  }

  static sendNotification(text: string, rateLimitMS?: number) {
    // Services reach the snackbar through here, and they are also exercised in
    // tests with no component standing. A missing canvas means nobody is
    // looking, not that the caller did something wrong.
    NewGridComponent.instance?.sendNotification(text, rateLimitMS);
  }

  sendNotification(text: string, rateLimitMS?: number) {
    rateLimitMS = rateLimitMS || 1000; //Default to 1 second
    //If there is more than one notification in the last seccond, ingore all but the first
    if (this.lastNotificationTime + rateLimitMS < Date.now()) {
      this.lastNotificationTime = Date.now();
      this.snackBar.open(text, '', {
        panelClass: 'my-custom-snackbar',
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 4000,
      });
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
    if (this.mechanismSrv.oneValidMechanismExists()) {
      const jointIndex = this.mechanismSrv.joints.indexOf(link.joints[0]);
      return this.mechanismSrv.mechanisms[0].joints[0][jointIndex];
    } else {
      return link.joints[0];
    }
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
    // A slider dragged over a valid slot previews the accepted state: the block
    // turns to the slot's own angle and the red nowhere-to-slide highlight goes
    // out while the drop would land. Without this the preview showed the cut
    // opening in the bar while the block stayed unturned and red — the channel
    // said yes and the block said no about the same release. Presentation only:
    // the joint itself is not reseated until the drop commits (cutSlotOn).
    const slot = this.slotCandidate;
    if (!slot || this.dragState.joint !== jointStates.dragging) return marks;
    const pinID = this.activeObjService.selectedJoint?.id;
    if (!pinID) return marks;
    const slotAngleDeg = (Math.atan2(slot.b.y - slot.a.y, slot.b.x - slot.a.x) * 180) / Math.PI;
    return marks.map((mark) =>
      mark.pin.id === pinID ? { ...mark, rotation: slotAngleDeg, dangling: false } : mark
    );
  }

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
    const mechanism = this.mechanismSrv.mechanisms[0];
    const frames = mechanism?.isMechanismValid() ? mechanism.joints : undefined;
    if (!frames?.length) return found;

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
   */
  get cylinderList(): CylinderMark[] {
    const revision = this.mechanismSrv.cylinderRevision;
    const pose = this.mechanismSrv.poseRevision;
    const scale = this.settings.objectScale;
    const forward = !this.settings.isInputCW.value;
    const cache = this.cylinderListCache;
    if (
      !cache ||
      cache.revision !== revision ||
      cache.pose !== pose ||
      cache.scale !== scale ||
      cache.forward !== forward
    ) {
      this.cylinderListCache = {
        revision,
        pose,
        scale,
        forward,
        list: this.sliderMarks.cylinderMarks(this.mechanismSrv.getJoints(), 0.15 * scale, forward),
      };
    }
    return this.cylinderListCache!.list;
  }

  /** Whether the selection is this cylinder's body, however it was selected. */
  isBodySelected(mark: CylinderMark): boolean {
    return (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink?.id === mark.body.id
    );
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
   */
  get groundLineWidth(): number {
    return (1.2 * 4 * this.settings.objectScale) / 157;
  }

  /** The hatch bars of that same symbol, drawn at 5/157 of its width. */
  get groundHatchWidth(): number {
    return (1.2 * 5 * this.settings.objectScale) / 157;
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
    const paths = this.channelList
      .filter((channel) => channel.carrierId === link.id)
      .map((channel) => channel.path);

    // The slot being previewed goes through the same subtraction a committed
    // one does, rather than being drawn as a stand-in on top. Two reasons: the
    // hover state is then pixel-identical to the result, and a real hole has no
    // legibility to lose against a link colour it cannot predict -- every
    // stand-in considered (a white fill, an outline, an amber highlight) fell
    // below contrast on part of the palette, because the palette is random.
    const preview = this.previewChannelOn(link);
    if (preview) paths.push(preview);

    return paths.length === 0 ? outline : `${outline} ${mergedChannels(paths)}`;
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
    const angle = (mark.rotation * Math.PI) / 180;
    const localPreview = transformRigidPath(
      preview,
      { x: mark.x, y: mark.y },
      { x: mark.x + Math.cos(angle), y: mark.y + Math.sin(angle) },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );
    return `${piece.outline} ${mergedChannels([...piece.cuts, localPreview])}`.trim();
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

  private freshMarks(): { marks: SliderMark[]; channels: Channel[] } {
    const joints = this.mechanismSrv.getJoints();
    const r = 0.15 * this.settings.objectScale;
    // A Slide's weld plate is painted in its rider's own colour, so recolouring
    // a link changes a mark while moving nothing. Same failure as the grounded
    // angle: the panel shows the new colour and the canvas keeps the old.
    const paint = this.mechanismSrv
      .getLinks()
      .map((link) => `${link.id}:${(link as RealLink).fill}`)
      .join(',');
    const key =
      `${r}|${paint}|${this.settings.isInputCW.value}|` +
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
  // one window:keydown. Anything that needs the key down hangs off here.
  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    this.reconsiderDrop($event, true);

    if (($event.ctrlKey || $event.metaKey) && $event.keyCode == 90) {
      //Ctrl + Z
      NewGridComponent.sendNotification(
        'You attempted to undo. What were you trying to undo? Please let us know through the report button in the help section.'
      );
    }

    if ($event.keyCode == 27) {
      //Escape Key
      // NewGridComponent.sendNotification(
      //   'You pressed the "Escape" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      // );
      this.activeObjService.updateSelectedObj(undefined);
    }

    if ($event.keyCode == 46) {
      //Delete Key
      if (true) {
        //TODO: Sorry jacob you need to fix this it used to say: if(GridComponent.canDelete)
        if (this.activeObjService.objType === 'Grid') {
          NewGridComponent.sendNotification('Select an object to delete.');
          return;
        }
        if (this.activeObjService.objType === 'Joint') {
          this.mechanismSrv.deleteJoint();
        } else if (this.activeObjService.objType === 'Link') {
          this.mechanismSrv.deleteLink();
        }
        this.activeObjService.updateSelectedObj(undefined);
        NewGridComponent.sendNotification('Deleted Selected Object.');
      } else {
        return;
      }
    }
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
