import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
} from '@angular/core';
import { Coord } from '../../model/coord';
import { AppConstants } from '../../model/app-constants';
import { Joint, RevJoint, PrisJoint, RealJoint } from '../../model/joint';
import { Piston, Link, RealLink, Shape, Bound } from '../../model/link';
import { Force } from '../../model/force';
import { Mechanism } from '../../model/mechanism/mechanism';
import { InstantCenter } from '../../model/instant-center';
import {
  determineSlope,
  determineUnknownJointUsingTriangulation,
  determineX,
  determineY,
  determineYIntersect,
  euclideanDistance,
  roundNumber,
  stringToBoolean,
  stringToFloat,
  stringToShape,
} from '../../model/utils';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { type } from 'os';
import { MatSnackBar } from '@angular/material/snack-bar';
import { join } from 'path';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { PositionSolver } from '../../model/mechanism/position-solver';
import * as svgPanZoom from 'svg-pan-zoom';
import { reportUnhandledError } from 'rxjs/internal/util/reportUnhandledError';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
} from '../../model/utils';

@Component({
  selector: 'app-grid',
  templateUrl: './grid.component.html',
  styleUrls: ['./grid.component.scss'],
})
export class GridComponent implements OnInit, AfterViewInit {
  static mechanismTimeStep: number = 0;
  static mechanismAnimationIncrement: number = 2;
  static joints: Joint[] = [];
  static links: Link[] = [];
  static forces: Force[] = [];
  static ics: InstantCenter[] = [];
  static mechanisms: Mechanism[] = [];
  static canDelete: boolean = false;

  static screenCoord: string = '';

  // This is the position of the mechanism
  static onMechPositionChange = new Subject<number>();

  // This is the state of the mechanism
  // 0 is normal, no changes, no pending analysis
  // 1 is actively being dragged, no pending analysis, disable graphs
  // 2 is pending graph draws
  // 3 is pending analysis due to add or remove
  static onMechUpdateState = new BehaviorSubject<number>(3);

  // holders
  static canvasSVGElement: SVGElement; // Reference to the SVG canvas (coordinate grid)
  private static transformMatrixGridSVGElement: SVGElement;
  private static transformMatrixSVG: SVGElement;
  private static pathsHolderSVG: SVGElement;
  private static pathsPathPointHolderSVG: SVGElement;
  private static jointTempHolderSVG: SVGElement;
  private static forceTempHolderSVG: SVGElement;

  private static contextMenuAddLinkOntoGrid: SVGElement;

  private static contextMenuAddInputJoint: SVGElement;
  private static contextMenuAddLinkOntoJoint: SVGElement;
  private static contextMenuAddGround: SVGElement;
  private static contextMenuAddSlider: SVGElement;
  private static contextMenuDeleteJoint: SVGElement;

  private static contextMenuAddLinkOntoLink: SVGElement;
  private static contextMenuAddTracerPoint: SVGElement;
  private static contextMenuAddForce: SVGElement;
  private static contextMenuEditShape: SVGElement;
  private static contextMenuDeleteLink: SVGElement;

  private static contextMenuChangeForceDirection: SVGElement;
  private static contextMenuChangeForceLocal: SVGElement;
  private static contextMenuDeleteForce: SVGElement;
  // Edit shape, delete link, add force
  static showcaseShapeSelector: boolean = false;
  static lastNotificationTime: number = Date.now();

  // static snackBar: any;

  static get gridOffset(): { x: number; y: number } {
    return this._gridOffset;
  }

  private static gridStates: gridStates = gridStates.waiting;
  private static jointStates: jointStates = jointStates.waiting;
  private static linkStates: linkStates = linkStates.waiting;
  private static forceStates: forceStates = forceStates.waiting;
  private static moveModes: moveModes;
  static scaleFactor = 50;

  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;

  private jointXatMouseDown!: number;
  private jointYatMouseDown!: number;

  private static panOffset = {
    x: 0,
    y: 0,
  };
  // TODO: Make getters and setters
  static _gridOffset = {
    x: 0,
    y: 0,
  };

  // remove this if this is possible
  private static selectedJoint: RealJoint;
  static selectedLink: RealLink;
  // static selectedBound: string;
  private static initialLinkMouseCoord: Coord;
  private static selectedForce: Force;
  private static selectedForceEndPoint: string;
  static initialLink: RealLink;
  // static snackBar: MatSnackBar;
  static _snackBar: MatSnackBar;

  private static instance: GridComponent | null = null;

  //These are SVG visible coordinates
  public svgMinX: number = 0;
  public svgMaxX: number = 0;
  public svgMinY: number = 0;
  public svgMaxY: number = 0;

  public static panZoomObject: SvgPanZoom.Instance;

  step = 10; // distance between each line

  // TODO: ADD LOGIC FOR INSTANT CENTERS AND GEARS AFTER FINISHING SIMJOINTS AND SIMLINKS!
  constructor(
    public activeObjService: ActiveObjService,
    public cd: ChangeDetectorRef,
    private snackBar?: MatSnackBar
  ) {
    GridComponent._snackBar = snackBar!;
    if (GridComponent.instance) {
      return GridComponent.instance;
    } else {
      GridComponent.instance = this;
    }
  }

  findEnlargedLinkHelper() {
    return this.getLinkProp(this.activeObjService.selectedLink, 'd');
    // console.log(this.activeObjService.Link.bound);
    // return RealLink.getPointsFromBounds(
    //   this.activeObjService.Link.bound,
    //   this.activeObjService.Link.shape,
    //   0.5
    // );
  }

  ngOnInit(): void {}

  ngAfterViewInit() {
    GridComponent.transformMatrixSVG = document.getElementById(
      'transformMatrix'
    ) as unknown as SVGElement;
    GridComponent.transformMatrixGridSVGElement = document.getElementById(
      'transformMatrixGrid'
    ) as unknown as SVGElement;
    GridComponent.pathsHolderSVG = document.getElementById('pathsHolder') as unknown as SVGElement;
    GridComponent.pathsPathPointHolderSVG = document.getElementById(
      'pathsPathPointHolder'
    ) as unknown as SVGElement;
    GridComponent.jointTempHolderSVG = document.getElementById(
      'jointTempHolder'
    ) as unknown as SVGElement;
    GridComponent.forceTempHolderSVG = document.getElementById(
      'forceTempHolder'
    ) as unknown as SVGElement;
    GridComponent.canvasSVGElement = document.getElementById('canvas') as unknown as SVGElement;

    // context Menu for Grid
    GridComponent.contextMenuAddLinkOntoGrid = document.getElementById(
      'menuEntryAddLinkOnGrid'
    ) as unknown as SVGElement;
    // context Menu for Joint
    GridComponent.contextMenuAddGround = document.getElementById(
      'menuEntryCreateGround'
    ) as unknown as SVGElement;
    GridComponent.contextMenuAddSlider = document.getElementById(
      'menuEntryCreateSlider'
    ) as unknown as SVGElement;
    GridComponent.contextMenuDeleteJoint = document.getElementById(
      'menuEntryDeleteJoint'
    ) as unknown as SVGElement;
    GridComponent.contextMenuAddLinkOntoJoint = document.getElementById(
      'menuEntryAddLinkOnJoint'
    ) as unknown as SVGElement;
    GridComponent.contextMenuAddInputJoint = document.getElementById(
      'menuEntryAddInput'
    ) as unknown as SVGElement;
    // context Menu for Link
    GridComponent.contextMenuAddLinkOntoLink = document.getElementById(
      'menuEntryAddLinkOnLink'
    ) as unknown as SVGElement;
    GridComponent.contextMenuAddTracerPoint = document.getElementById(
      'menuEntryAddTracerPoint'
    ) as unknown as SVGElement;
    GridComponent.contextMenuAddForce = document.getElementById(
      'menuEntryAddForce'
    ) as unknown as SVGElement;
    GridComponent.contextMenuEditShape = document.getElementById(
      'menuEntryEditShape'
    ) as unknown as SVGElement;
    GridComponent.contextMenuDeleteLink = document.getElementById(
      'menuEntryDeleteLink'
    ) as unknown as SVGElement;
    // context Menu for Force
    GridComponent.contextMenuChangeForceDirection = document.getElementById(
      'menuEntryChangeForceDirection'
    ) as unknown as SVGElement;
    GridComponent.contextMenuChangeForceLocal = document.getElementById(
      'menuEntryChangeForceLocal'
    ) as unknown as SVGElement;
    GridComponent.contextMenuDeleteForce = document.getElementById(
      'menuEntryDeleteForce'
    ) as unknown as SVGElement;

    GridComponent.reset();
  }

  private static screenToGrid(x: number, y: number) {
    const newX = roundNumber(
      (1 / GridComponent.scaleFactor) * (x - GridComponent._gridOffset.x),
      3
    );
    const newY = roundNumber(
      -1 * (1 / GridComponent.scaleFactor) * (y - GridComponent._gridOffset.y),
      3
    );
    return new Coord(newX, newY);
  }

  private static gridToScreen(x: number, y: number) {
    const newX = AppConstants.scaleFactor * x + GridComponent._gridOffset.x;
    const newY = AppConstants.scaleFactor * y + GridComponent._gridOffset.y;
    return new Coord(newX, newY);
  }

  private static zoomPoint(newScale: number, pointX: number, pointY: number) {
    const beforeScaleCoords = this.screenToGrid(pointX, pointY);
    // Prevent zooming in or out too far
    if (newScale * GridComponent.scaleFactor < AppConstants.maxZoomOut) {
      GridComponent.scaleFactor = AppConstants.maxZoomOut;
    } else if (newScale * GridComponent.scaleFactor > AppConstants.maxZoomIn) {
      GridComponent.scaleFactor = AppConstants.maxZoomIn;
    } else {
      GridComponent.scaleFactor = newScale * GridComponent.scaleFactor;
    }
    const afterScaleCoords = this.screenToGrid(pointX, pointY);
    GridComponent._gridOffset.x =
      GridComponent._gridOffset.x -
      (beforeScaleCoords.x - afterScaleCoords.x) * GridComponent.scaleFactor;
    GridComponent._gridOffset.y =
      GridComponent._gridOffset.y +
      (beforeScaleCoords.y - afterScaleCoords.y) * GridComponent.scaleFactor;
    GridComponent.applyMatrixToSVG();
  }

  // TODO: Figure out how to put this logic within html/css (find some code online that already does this :P)
  private static applyMatrixToSVG() {
    const offsetX = GridComponent._gridOffset.x;
    const offsetY = GridComponent._gridOffset.y;
    const newMatrix =
      'translate(' + offsetX + ' ' + offsetY + ') scale(' + GridComponent.scaleFactor + ')';
    const gridMatrix =
      'translate(' +
      offsetX +
      ' ' +
      offsetY +
      ') scale(' +
      GridComponent.scaleFactor * AppConstants.scaleFactor +
      ')';
    GridComponent.transformMatrixSVG.setAttributeNS(null, 'transform', newMatrix);
    GridComponent.transformMatrixGridSVGElement.setAttributeNS(null, 'transform', gridMatrix);
  }

  // TODO: Once the Grid Toolbar (Animation Bar) is created, reuse this function
  private static reset() {
    const box = GridComponent.canvasSVGElement.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    GridComponent._gridOffset.x = (width / 2) * AppConstants.scaleFactor;
    GridComponent._gridOffset.y = (height / 2) * AppConstants.scaleFactor;
    GridComponent.scaleFactor = 1;
    this.zoomPoint(1 / AppConstants.scaleFactor, 0, 0);
    this.applyMatrixToSVG();
  }

  private static panSVG(dx: number, dy: number) {
    const newOffsetX = this._gridOffset.x - dx;
    const newOffsetY = this._gridOffset.y + dy;
    this._gridOffset.x = newOffsetX;
    this._gridOffset.y = newOffsetY;
    this.applyMatrixToSVG();
  }

  private static getMousePosition(e: MouseEvent) {
    //This is crazy
    const svg = GridComponent.canvasSVGElement as SVGGraphicsElement;
    // console.log(svg);
    if (svg === null || svg === undefined) {
      return new Coord(0, 0);
    }
    const CTM = svg.getScreenCTM();
    if (CTM === null || CTM === undefined) {
      return new Coord(0, 0);
    }
    // if (e.touches) { e = e.touches[0]; }
    const box = svg.getBoundingClientRect();
    // const width = box.right - box.left;
    const height = box.bottom - box.top;
    const newX = roundNumber((e.clientX - CTM.e) / CTM.a, 0);
    let newY: number;
    // NOTE: CTM.f is the svg.ClientHeight + height of rest of elements. In Firefox, clientHeight does not work (returns 0) so we need to
    // manually detect and add it.
    if (svg.clientHeight === 0) {
      newY = roundNumber((e.clientY - (CTM.f + height)) / -Math.abs(CTM.d), 0);
    } else {
      newY = roundNumber((e.clientY - CTM.f) / -Math.abs(CTM.d), 0);
    }
    // NOTE: The CTM returns different values per browser. In Firefox & Safari it is 1 and in Chrome/Edge it is -1.
    // By putting a -Math.Abs() to it we are standardizing it at -1
    return new Coord(newX, newY);
  }

  public static oneValidMechanismExists() {
    if (GridComponent.mechanisms.length == 0 || GridComponent.mechanisms[0] === undefined) {
      return false;
    }
    return GridComponent.mechanisms[0].isMechanismValid();
  }

  scrollGrid($event: WheelEvent) {
    $event.preventDefault();
    $event.stopPropagation();
    let wheelAmount = $event.deltaY;
    if (wheelAmount > 0) {
      wheelAmount = 20 / 21;
    } else if (wheelAmount < 0) {
      wheelAmount = 21 / 20;
    } else {
      return;
    }
    const rawSVGCoords = GridComponent.getMousePosition($event);
    if (rawSVGCoords === undefined) {
      return;
    }
    GridComponent.zoomPoint(wheelAmount, rawSVGCoords.x, rawSVGCoords.y * -1);
  }

  mouseUp($event: MouseEvent, typeChosen: string, thing?: any, forcePoint?: string) {
    //This is for more targeted mouseUp evnets, only one should be called for each object
    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // console.warn('mouseUp');
        // console.log(typeChosen);
        // console.log(thing);
        // console.log(this.activeObjService.objType);
        let clickOnlyWithoutDrag: boolean = false;

        const diffX = Math.abs($event.pageX - this.startX);
        const diffY = Math.abs($event.pageY - this.startY);
        if (diffX < this.delta && diffY < this.delta) {
          clickOnlyWithoutDrag = true;
        }

        switch (typeChosen) {
          case 'grid':
            if (clickOnlyWithoutDrag) {
              this.activeObjService.updateSelectedObj(undefined);
            }
            break;
          case 'joint':
            //If the animation is running or the mechansim is not at t=0, don't allow selection
            // if (AnimationBarComponent.animate === true) {
            //   return;
            // }
            // if (GridComponent.mechanismTimeStep !== 0) {
            //   return;
            // }
            this.activeObjService.updateSelectedObj(thing);
            GridComponent.canDelete = true;

            if (clickOnlyWithoutDrag) {
              //Revert the joint to its original position
              // console.warn('click only without drag');
              if (thing.x !== this.jointXatMouseDown || thing.y !== this.jointYatMouseDown) {
                // console.warn('Diff exsits');
                GridComponent.dragJoint(
                  thing,
                  new Coord(this.jointXatMouseDown, this.jointYatMouseDown)
                );
                this.activeObjService.updateSelectedObj(thing);
                GridComponent.onMechUpdateState.next(0);
              }
            }
            break;
          default:
            GridComponent.canDelete = true;
            //If the animation is running or the mechansim is not at t=0, don't allow selection
            // if (AnimationBarComponent.animate === true) {
            //   return;
            // }
            // if (GridComponent.mechanismTimeStep !== 0) {
            //   return;
            // }
            this.activeObjService.updateSelectedObj(thing);
            break;
        }
        break;
    }
  }

  mouseUpOld($event: MouseEvent, typeChosen: string) {
    //This is the mouseUp that is called no matter what is clicked on
    // TODO check for condition when a state was not waiting. If it was not waiting, then update the mechanism
    GridComponent.gridStates = gridStates.waiting;
    GridComponent.jointStates = jointStates.waiting;
    GridComponent.linkStates = linkStates.waiting;
    if (GridComponent.forceStates !== forceStates.waiting) {
      GridComponent.forceStates = forceStates.waiting;
      GridComponent.updateMechanism();
    }
    if (GridComponent.showPathHolder) {
      GridComponent.onMechUpdateState.next(2);
    }
    GridComponent.showPathHolder = false;
    // this.activeObjService.updateSelectedObj(thing);
  }

  getShowPathHolder() {
    return GridComponent.showPathHolder;
  }

  //This really needs a comment, what is 'thing?'
  mouseDown($event: MouseEvent, typeChosen: string, thing?: any, forcePoint?: string) {
    // console.warn('mouseDown');
    // console.log(typeChosen);
    // console.log(thing);
    $event.preventDefault();
    $event.stopPropagation();
    this.disappearContext();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // console.log(thing);
        switch (typeChosen) {
          case 'grid':
            switch (GridComponent.gridStates) {
              case gridStates.createJointFromGrid:
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                joint1 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mergeToJoints([joint1, joint2]);
                this.mergeToLinks([link]);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.linkStates = linkStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromJoint:
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                joint2 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!
                );
                GridComponent.selectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(GridComponent.selectedJoint);

                link = this.createRealLink(GridComponent.selectedJoint.id + joint2.id, [
                  GridComponent.selectedJoint,
                  joint2,
                ]);
                GridComponent.selectedJoint.links.push(link);
                joint2.links.push(link);
                this.mergeToJoints([joint2]);
                this.mergeToLinks([link]);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.jointStates = jointStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                GridComponent.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                joint1.links.push(GridComponent.selectedLink);
                GridComponent.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                GridComponent.selectedLink.id = GridComponent.selectedLink.id.concat(joint1.id);
                this.mergeToJoints([joint1, joint2]);
                this.mergeToLinks([link]);
                GridComponent.selectedLink.d = RealLink.getD(GridComponent.selectedLink.joints);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.linkStates = linkStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createForce:
                let startCoord = new Coord(0, 0);
                let screenX: number;
                let screenY: number;
                // if (GridComponent.selectedLink.shape === Shape.line) {
                //   screenX = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('x'));
                //   screenY = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('y'));
                // } else {
                screenX = Number(
                  GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x')
                );
                screenY = Number(
                  GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y')
                );
                // }
                startCoord = GridComponent.screenToGrid(screenX, screenY);
                const endCoordRaw = GridComponent.getMousePosition($event);
                if (endCoordRaw === undefined) {
                  return;
                }
                const endCoord = GridComponent.screenToGrid(endCoordRaw.x, endCoordRaw.y * -1);
                // TODO: Be sure the force added is at correct position for binary link
                const force = new Force(
                  'F' + (GridComponent.forces.length + 1).toString(),
                  GridComponent.selectedLink,
                  startCoord,
                  endCoord
                );
                GridComponent.selectedLink.forces.push(force);
                GridComponent.forces.push(force);
                PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces); // needed to determine force position when dragging a joint
                // PositionSolver.setUpInitialJointLocations(GridComponent.selectedLink.joints);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.forceStates = forceStates.waiting;
                GridComponent.forceTempHolderSVG.style.display = 'none';
                break;
            }
            break;
          case 'joint':
            this.jointXatMouseDown = thing.x;
            this.jointYatMouseDown = thing.y;
            switch (GridComponent.gridStates) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = thing;
                // joint2 = this.createRevJoint(
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mergeToJoints([joint1]);
                this.mergeToLinks([link]);
                GridComponent.updateMechanism();
                // PositionSolver.setUpSolvingForces(link.forces); // needed to determine force location when dragging a joint
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.linkStates = linkStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromJoint:
                // joint2 = this.createRevJoint(
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!,
                // );

                joint2 = thing;
                let commonLinkCheck = false;
                // Make sure link is not being attached to the same link
                joint2.links.forEach((l) => {
                  if (commonLinkCheck) {
                    return;
                  }
                  if (GridComponent.selectedJoint.links.findIndex((li) => li.id === l.id) !== -1) {
                    commonLinkCheck = true;
                  }
                });
                if (commonLinkCheck) {
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display = 'none';
                  GridComponent.sendNotification("Don't link to a joint on the same link");
                  return;
                }
                GridComponent.selectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(GridComponent.selectedJoint);

                link = this.createRealLink(GridComponent.selectedJoint.id + joint2.id, [
                  GridComponent.selectedJoint,
                  joint2,
                ]);
                GridComponent.selectedJoint.links.push(link);
                joint2.links.push(link);
                this.mergeToLinks([link]);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.jointStates = jointStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.createRevJoint(
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                // joint2 = this.createRevJoint(
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint2 = thing;
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                GridComponent.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                joint1.links.push(GridComponent.selectedLink);
                GridComponent.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                GridComponent.selectedLink.id = GridComponent.selectedLink.id.concat(joint1.id);
                this.mergeToJoints([joint1]);
                this.mergeToLinks([link]);
                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.linkStates = linkStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
            }
            switch (GridComponent.jointStates) {
              case jointStates.waiting:
                GridComponent.jointStates = jointStates.dragging;
                GridComponent.selectedJoint = thing;
                break;
            }
            break;
          case 'link':
            // console.log(GridComponent.linkStates);
            switch (GridComponent.linkStates) {
              case linkStates.waiting:
                //If the shapeselector is not open
                if (!GridComponent.showcaseShapeSelector) {
                  // GridComponent.sendNotification("Cannot link to a bar. Please select a joint");
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display = 'none';
                  break;
                }
                if (thing !== undefined) {
                  GridComponent.linkStates = linkStates.resizing;
                  // GridComponent.selectedBound = thing;
                } else {
                  GridComponent.linkStates = linkStates.dragging;
                  const rawCoord = GridComponent.getMousePosition($event)!;
                  GridComponent.initialLinkMouseCoord = GridComponent.screenToGrid(
                    rawCoord.x,
                    -1 * rawCoord.y
                  );
                  // GridComponent.initialLink = new RealLink(GridComponent.selectedLink.id, GridComponent.selectedLink.joints);
                  // if (GridComponent.selectedLink.bound)
                  // GridComponent.initialLink.bound = GridComponent.selectedLink.bound;
                  // GridComponent.initialLink.d = GridComponent.selectedLink.d;
                  // GridComponent.initialLink.CoM = GridComponent.selectedLink.CoM;
                }
                break;
            }
            break;
          case 'force':
            switch (GridComponent.forceStates) {
              case forceStates.waiting:
                if (forcePoint === undefined) {
                  return;
                }
                GridComponent.forceStates = forceStates.dragging;
                GridComponent.selectedForceEndPoint = forcePoint;
                GridComponent.selectedForce = thing;
            }
            break;
          case 'jointTemp':
            GridComponent.gridStates = gridStates.waiting;
            GridComponent.jointStates = jointStates.waiting;
            GridComponent.jointTempHolderSVG.style.display = 'none';
            GridComponent.sendNotification("Don't link a joint to itself");
        }
        break;
      // TODO: Be sure all things reset
      case 1: // Middle-Click
        GridComponent.gridStates = gridStates.waiting;
        GridComponent.jointStates = jointStates.waiting;
        GridComponent.linkStates = linkStates.waiting;
        GridComponent.forceStates = forceStates.waiting;
        GridComponent.jointTempHolderSVG.style.display = 'none';
        return;
      case 2: // Right-Click
        GridComponent.gridStates = gridStates.waiting;
        GridComponent.jointStates = jointStates.waiting;
        GridComponent.linkStates = linkStates.waiting;
        GridComponent.forceStates = forceStates.waiting;
        GridComponent.jointTempHolderSVG.style.display = 'none';
        break;
    }
  }

  mouseMove($event: MouseEvent, typeChosen: string, bound?: string) {
    // console.warn('mouseMove');
    // console.log(typeChosen);
    // $event.preventDefault();
    // $event.stopPropagation();
    // TODO: Possibly put this somewhere else so don't have to copy/paste?
    const rawCoord = GridComponent.getMousePosition($event)!;
    const trueCoord = GridComponent.screenToGrid(rawCoord.x, -1 * rawCoord.y);
    GridComponent.screenCoord =
      '(' + roundNumber(trueCoord.x, 1) + ' , ' + roundNumber(trueCoord.y, 1) + ')';

    switch (GridComponent.gridStates) {
      case gridStates.dragging:
        const offsetX = GridComponent.panOffset.x - rawCoord.x;
        const offsetY = GridComponent.panOffset.y - rawCoord.y;
        GridComponent.panOffset.x = rawCoord.x;
        GridComponent.panOffset.y = rawCoord.y;
        const box = GridComponent.canvasSVGElement.getBoundingClientRect();
        const width = box.width;
        const height = box.height;
        let correctedPan = false;
        // Cause panning outside the defined area to pan the user back in.
        if (GridComponent.screenToGrid(offsetX, 0).x < -100) {
          GridComponent.panSVG(Math.abs(offsetX), 0);
          correctedPan = true;
        }
        if (GridComponent.screenToGrid(width + offsetX, 0).x > 100) {
          GridComponent.panSVG(-Math.abs(offsetX), 0);
          correctedPan = true;
        }
        if (GridComponent.screenToGrid(0, offsetY).y < -100) {
          GridComponent.panSVG(0, Math.abs(offsetY));
          correctedPan = true;
        }
        if (GridComponent.screenToGrid(0, height + offsetY).y > 100) {
          GridComponent.panSVG(0, -Math.abs(offsetY));
          correctedPan = true;
        }
        if (!correctedPan) {
          GridComponent.panSVG(offsetX, offsetY);
        }
        break;
      case gridStates.createForce:
      case gridStates.createJointFromGrid:
      case gridStates.createJointFromJoint:
      case gridStates.createJointFromLink:
        GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
        GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
        break;
    }
    switch (GridComponent.jointStates) {
      case jointStates.creating:
        GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
        GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
        break;
      case jointStates.dragging:
        if (AnimationBarComponent.animate === true) {
          GridComponent.sendNotification('Cannot edit while animation is running');
          return;
        }
        if (GridComponent.mechanismTimeStep !== 0) {
          GridComponent.sendNotification('Stop animation (or reset to 0 position) to edit');
          this.disappearContext();
          return;
        }
        GridComponent.selectedJoint = GridComponent.dragJoint(
          GridComponent.selectedJoint,
          trueCoord
        );
        GridComponent.updateMechanism();
        //So that the panel values update continously
        this.activeObjService.updateSelectedObj(GridComponent.selectedJoint);
        if (GridComponent.mechanisms[0].joints[0].length !== 0) {
          if (GridComponent.mechanisms[0].dof === 1) {
            if (GridComponent.showPathHolder == false) {
              GridComponent.onMechUpdateState.next(1);
            }
            GridComponent.showPathHolder = true;
          }
        }
        break;
    }
    switch (GridComponent.linkStates) {
      case linkStates.creating:
        GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
        GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
        break;
      case linkStates.dragging:
        // TODO: Add logic when dragging a link within edit shape mode

        const offsetX = trueCoord.x - GridComponent.initialLinkMouseCoord.x;
        const offsetY = trueCoord.y - GridComponent.initialLinkMouseCoord.y;
        GridComponent.initialLinkMouseCoord.x = trueCoord.x;
        GridComponent.initialLinkMouseCoord.y = trueCoord.y;
        GridComponent.selectedLink.d = RealLink.getD(GridComponent.selectedLink.joints);
        GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(
          GridComponent.selectedLink.joints
        );
        GridComponent.updateMechanism();
        break;
      case linkStates.resizing:
        // Adjust the link's bounding boxes
        let b1n,
          b2n,
          b3n,
          b4n,
          arrow5n: Coord = new Coord(0, 0)!;

        let drag_coord_x, side_coord_x_1, side_coord_x_2: number;
        let drag_coord_y, side_coord_y_1, side_coord_y_2: number;

        let arrow5n_x, arrow5n_y: number;

        let m1, closest_m, m2, m3, m4, m5: number;
        let b1, closest_b, b2, b3, b4, b5: number;

        const typeOfBoundToCoordMap = new Map<string, Coord>();

        // TOOD: Put this within function call to do all this logic
        const fixedCoord = typeOfBoundToCoordMap.get('fixed')!;
        const dragCoord = typeOfBoundToCoordMap.get('drag')!;
        const sideCoord1 = typeOfBoundToCoordMap.get('sideCoord1')!;
        const sideCoord2 = typeOfBoundToCoordMap.get('sideCoord2')!;

        // determine line from b1 to b3

        m1 = determineSlope(fixedCoord.x, fixedCoord.y, dragCoord.x, dragCoord.y);
        b1 = determineYIntersect(fixedCoord.x, fixedCoord.y, m1);
        // determine the point within this line that is closest to where the mouse is
        closest_m = -1 * Math.pow(m1, -1);
        closest_b = determineYIntersect(trueCoord.x, trueCoord.y, closest_m);
        // closest_b = determineYIntersect(newBound.x, newBound.y, closest_m);
        drag_coord_x = determineX(closest_m, closest_b, m1, b1);
        drag_coord_y = determineY(drag_coord_x, closest_m, closest_b);
        // determine the other 2 points
        m2 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord1.x, sideCoord1.y);
        b2 = determineYIntersect(fixedCoord.x, fixedCoord.y, m2);
        m3 = determineSlope(dragCoord.x, dragCoord.y, sideCoord1.x, sideCoord1.y);
        b3 = determineYIntersect(drag_coord_x, drag_coord_y, m3);
        side_coord_x_1 = determineX(m2, b2, m3, b3);
        side_coord_y_1 = determineY(side_coord_x_1, m2, b2);

        m4 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord2.x, sideCoord2.y);
        b4 = determineYIntersect(fixedCoord.x, fixedCoord.y, m4);
        m5 = determineSlope(dragCoord.x, dragCoord.y, sideCoord2.x, sideCoord2.y);
        b5 = determineYIntersect(drag_coord_x, drag_coord_y, m5);
        side_coord_x_2 = determineX(m4, b4, m5, b5);
        side_coord_y_2 = determineY(side_coord_x_2, m4, b4);

        GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(
          GridComponent.selectedLink.joints
        );
        GridComponent.selectedLink.updateCoMDs();
        break;
    }
    switch (GridComponent.forceStates) {
      case forceStates.creating:
        this.createForce($event);
        break;
      case forceStates.dragging:
        if (AnimationBarComponent.animate === true) {
          GridComponent.sendNotification('Cannot edit while animation is running');
          return;
        }
        if (GridComponent.mechanismTimeStep !== 0) {
          GridComponent.sendNotification('Stop animation (or reset to 0 position) to edit');
          this.disappearContext();
          return;
        }
        GridComponent.selectedForce = GridComponent.dragForce(
          GridComponent.selectedForce,
          trueCoord
        );
        break;
    }
  }

  getJointColor(joint: Joint) {
    if (GridComponent.jointStates !== jointStates.dragging) {
      return joint.showHighlight ? 'yellow' : 'black';
    } else {
      return joint.id == GridComponent.selectedJoint.id ? 'red' : 'black';
    }
  }

  createRevJoint(x: string, y: string, prevID?: string) {
    const x_num = roundNumber(Number(x), 3);
    const y_num = roundNumber(Number(y), 3);
    let id: string;
    if (prevID === undefined) {
      id = this.determineNextLetter();
    } else {
      id = this.determineNextLetter([prevID]);
    }
    return new RevJoint(id, x_num, y_num);
  }

  createRealLink(id: string, joints: Joint[]) {
    return new RealLink(id, joints);
  }

  mergeToJoints(joints: Joint[]) {
    joints.forEach((j) => {
      GridComponent.joints.push(j);
    });
  }

  mergeToLinks(links: Link[]) {
    links.forEach((l) => {
      GridComponent.links.push(l);
    });
  }

  mergeToForces() {}

  disappearContext() {
    GridComponent.contextMenuAddInputJoint.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoGrid.style.display = 'none';
    GridComponent.contextMenuAddGround.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoJoint.style.display = 'none';
    GridComponent.contextMenuAddSlider.style.display = 'none';
    GridComponent.contextMenuDeleteJoint.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoLink.style.display = 'none';
    GridComponent.contextMenuAddForce.style.display = 'none';
    GridComponent.contextMenuAddTracerPoint.style.display = 'none';
    GridComponent.contextMenuDeleteLink.style.display = 'none';
    GridComponent.contextMenuChangeForceDirection.style.display = 'none';
    GridComponent.contextMenuChangeForceLocal.style.display = 'none';
    GridComponent.contextMenuDeleteForce.style.display = 'none';
  }

  //This funciton shows the correct context menu
  contextMenu($event: MouseEvent, desiredMenu: string, thing?: any) {
    $event.preventDefault();
    $event.stopPropagation();
    this.disappearContext();

    if (AnimationBarComponent.animate === true) {
      GridComponent.sendNotification('Cannot edit while animation is running');
      return;
    }
    if (GridComponent.mechanismTimeStep !== 0) {
      GridComponent.sendNotification('Stop animation (or reset to 0 position) to edit');
      this.disappearContext();
      return;
    }

    const offsetX = $event.clientX;
    const offsetY = $event.clientY;

    switch (desiredMenu) {
      case 'grid':
        this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoGrid, offsetX, offsetY, 0, 0);
        break;
      case 'joint':
        const joint = thing;
        GridComponent.selectedJoint = joint;
        switch (joint.links.length) {
          case 0:
            switch (joint.constructor) {
              case RevJoint:
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Add Slider';
                if (joint.ground) {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Remove Ground';
                  if (joint.input) {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                  } else {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                  }
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddInputJoint,
                    offsetX,
                    offsetY,
                    0,
                    0
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddLinkOntoJoint,
                    offsetX,
                    offsetY,
                    20,
                    20
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddGround,
                    offsetX,
                    offsetY,
                    40,
                    40
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddSlider,
                    offsetX,
                    offsetY,
                    60,
                    60
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuDeleteJoint,
                    offsetX,
                    offsetY,
                    80,
                    80
                  );
                } else {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddLinkOntoJoint,
                    offsetX,
                    offsetY,
                    0,
                    0
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddGround,
                    offsetX,
                    offsetY,
                    20,
                    20
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddSlider,
                    offsetX,
                    offsetY,
                    40,
                    40
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuDeleteJoint,
                    offsetX,
                    offsetY,
                    60,
                    60
                  );
                }
                break;
              case PrisJoint:
                if (GridComponent.selectedJoint.input) {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                } else {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                }
                GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Remove Slider';
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddInputJoint,
                  offsetX,
                  offsetY,
                  0,
                  0
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddLinkOntoJoint,
                  offsetX,
                  offsetY,
                  20,
                  20
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddGround,
                  offsetX,
                  offsetY,
                  40,
                  40
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddSlider,
                  offsetX,
                  offsetY,
                  60,
                  60
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuDeleteJoint,
                  offsetX,
                  offsetY,
                  80,
                  80
                );
                break;
            }
            break;
          case 1:
            switch (joint.constructor) {
              case RevJoint:
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Add Slider';
                if (joint.ground) {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Remove Ground';
                  if (joint.input) {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                  } else {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                  }
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddInputJoint,
                    offsetX,
                    offsetY,
                    0,
                    0
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddGround,
                    offsetX,
                    offsetY,
                    20,
                    20
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddSlider,
                    offsetX,
                    offsetY,
                    40,
                    40
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuDeleteJoint,
                    offsetX,
                    offsetY,
                    60,
                    60
                  );
                } else {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddLinkOntoJoint,
                    offsetX,
                    offsetY,
                    0,
                    0
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddGround,
                    offsetX,
                    offsetY,
                    20,
                    20
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuAddSlider,
                    offsetX,
                    offsetY,
                    40,
                    40
                  );
                  this.showcaseContextMenu(
                    GridComponent.contextMenuDeleteJoint,
                    offsetX,
                    offsetY,
                    60,
                    60
                  );
                }
                break;
              case PrisJoint:
                if (GridComponent.selectedJoint.input) {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                } else {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                }
                GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Remove Slider';
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddInputJoint,
                  offsetX,
                  offsetY,
                  0,
                  0
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddGround,
                  offsetX,
                  offsetY,
                  20,
                  20
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddSlider,
                  offsetX,
                  offsetY,
                  40,
                  40
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuDeleteJoint,
                  offsetX,
                  offsetY,
                  60,
                  60
                );
                break;
            }
            break;
          default: // I think default will always be 2
            switch (joint.constructor) {
              case PrisJoint:
                if (GridComponent.selectedJoint.input) {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                } else {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                }
                GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Remove Slider';
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddInputJoint,
                  offsetX,
                  offsetY,
                  0,
                  0
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddGround,
                  offsetX,
                  offsetY,
                  20,
                  20
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuAddSlider,
                  offsetX,
                  offsetY,
                  40,
                  40
                );
                this.showcaseContextMenu(
                  GridComponent.contextMenuDeleteJoint,
                  offsetX,
                  offsetY,
                  60,
                  60
                );
                break;
              case RevJoint:
                this.showcaseContextMenu(
                  GridComponent.contextMenuDeleteJoint,
                  offsetX,
                  offsetY,
                  0,
                  0
                );
            }
            break;
        }
        break;
      case 'link':
        const link = thing;
        GridComponent.selectedLink = link;
        this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoLink, offsetX, offsetY, 0, 0);
        this.showcaseContextMenu(GridComponent.contextMenuAddTracerPoint, offsetX, offsetY, 20, 20);
        this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 40, 40);
        this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 60, 60);
        break;
      case 'force':
        // const force = thing;
        GridComponent.selectedForce = thing;
        this.showcaseContextMenu(
          GridComponent.contextMenuChangeForceDirection,
          offsetX,
          offsetY,
          0,
          0
        );
        this.showcaseContextMenu(
          GridComponent.contextMenuChangeForceLocal,
          offsetX,
          offsetY,
          20,
          20
        );
        this.showcaseContextMenu(GridComponent.contextMenuDeleteForce, offsetX, offsetY, 40, 40);
        break;
    }
  }

  showcaseContextMenu(
    contextMenu: SVGElement,
    offsetX: number,
    offsetY: number,
    boxIncrement: number,
    textIncrement: number
  ) {
    contextMenu.style.display = 'block';
    contextMenu.children[0].setAttribute('x', offsetX.toString());
    contextMenu.children[0].setAttribute('y', (offsetY + boxIncrement).toString());
    contextMenu.children[1].setAttribute('x', offsetX.toString());
    contextMenu.children[1].setAttribute('y', (offsetY + textIncrement).toString());
  }

  addJoint() {
    this.disappearContext();
    // const newJoint = this.createRevJoint()
    // const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    // const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    const screenX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
    // TODO: Add logic to add joint to selectedLink. Also, add adjacent joint to tracer joint
    const newId = this.determineNextLetter();
    const newJoint = new RevJoint(newId, coord.x, coord.y);
    GridComponent.selectedLink.joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      j.connectedJoints.push(newJoint);
      newJoint.connectedJoints.push(j);
    });
    newJoint.links.push(GridComponent.selectedLink);
    GridComponent.selectedLink.joints.push(newJoint);
    GridComponent.selectedLink.id += newJoint.id;
    GridComponent.selectedLink.d = RealLink.getD(GridComponent.selectedLink.joints);
    GridComponent.joints.push(newJoint);
    GridComponent.updateMechanism();
  }

  createGround() {
    this.disappearContext();
    if (GridComponent.selectedJoint instanceof PrisJoint) {
      const revJoint = GridComponent.selectedJoint.connectedJoints.find(
        (j) => j instanceof RevJoint
      )!;
      if (!(revJoint instanceof RevJoint)) {
        return;
      }

      GridComponent.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === GridComponent.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      const piston = GridComponent.links.find((l) => l instanceof Piston)!;
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = GridComponent.joints.findIndex(
        (j) => j.id == GridComponent.selectedJoint.id
      );
      const pistonIndex = GridComponent.links.findIndex((l) => l.id === piston.id);
      GridComponent.joints.splice(prismaticJointIndex, 1);
      GridComponent.links.splice(pistonIndex, 1);

      revJoint.ground = true;
      // let joint = GridComponent.selectedJoint as RevJoint;
      // // TODO: Be sure to remove connected joints and links that are ImagJoint and ImagLinks
      // joint = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
      // const selectedJointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, GridComponent.joints);
      // GridComponent.joints[selectedJointIndex] = joint;
    } else {
      GridComponent.selectedJoint.ground = !GridComponent.selectedJoint.ground;
    }
    GridComponent.updateMechanism();
  }

  createSlider() {
    this.disappearContext();
    if (!(GridComponent.selectedJoint instanceof PrisJoint)) {
      // Create Prismatic Joint
      GridComponent.selectedJoint.ground = false;
      const prismaticJointId = this.determineNextLetter();
      const inputJointIndex = this.findInputJointIndex();
      const connectedJoints: Joint[] = [GridComponent.selectedJoint];
      GridComponent.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.ground) {
          connectedJoints.push(j);
        }
      });
      const prisJoint = new PrisJoint(
        prismaticJointId,
        GridComponent.selectedJoint.x,
        GridComponent.selectedJoint.y,
        GridComponent.selectedJoint.input,
        true,
        [],
        connectedJoints
      );
      GridComponent.selectedJoint.connectedJoints.push(prisJoint);
      const piston = new Piston(GridComponent.selectedJoint.id + prisJoint.id, [
        GridComponent.selectedJoint,
        prisJoint,
      ]);
      prisJoint.links.push(piston);
      GridComponent.selectedJoint.links.push(piston);
      GridComponent.joints.push(prisJoint);
      GridComponent.links.push(piston);
    } else {
      // delete Prismatic Joint
      // TODO: determine logic to delete crank and the prismatic joint
      GridComponent.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === GridComponent.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      const piston = GridComponent.links.find((l) => l instanceof Piston)!;
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = GridComponent.joints.findIndex(
        (j) => j.id == GridComponent.selectedJoint.id
      );
      const pistonIndex = GridComponent.links.findIndex((l) => l.id === piston.id);
      GridComponent.joints.splice(prismaticJointIndex, 1);
      GridComponent.links.splice(pistonIndex, 1);
    }
    GridComponent.updateMechanism();
  }

  deleteJoint() {
    this.disappearContext();
    const jointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, GridComponent.joints);
    //if the joint that is meant to be deleted is the one selected in activeObjectSrv, set the activeObjectSrv to undefined
    if (
      this.activeObjService.objType === 'Joint' &&
      this.activeObjService.selectedJoint.id === GridComponent.selectedJoint.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }

    GridComponent.selectedJoint.links.forEach((l) => {
      // TODO: May wanna check this to be sure...
      if (l instanceof Piston) {
        return;
      }
      if (l.joints.length < 3) {
        // TODO: Utilize this same logic when you delete ImagJoint and ImagLink
        // TODO: this.deleteJointFromConnectedJoints(delJoint);
        // TODO: this.deleteLinkFromConnectedLinks(delLink);
        // delete forces on link
        if (l instanceof RealLink) {
          l.forces.forEach((f) => {
            const forceIndex = GridComponent.forces.findIndex((fo) => fo.id === f.id);
            GridComponent.forces.splice(forceIndex, 1);
          });
        }
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID =
          l.joints[0].id === GridComponent.selectedJoint.id ? l.joints[1].id : l.joints[0].id;
        const desiredJointIndex = this.findJointIDIndex(desiredJointID, GridComponent.joints);
        const deleteJointIndex = this.findJointIDIndex(
          GridComponent.selectedJoint.id,
          (GridComponent.joints[desiredJointIndex] as RealJoint).connectedJoints
        );
        (GridComponent.joints[desiredJointIndex] as RealJoint).connectedJoints.splice(
          deleteJointIndex,
          1
        );
        const deleteLinkIndex = (
          GridComponent.joints[desiredJointIndex] as RealJoint
        ).links.findIndex((lin) => {
          if (!(lin instanceof RealLink)) {
            return;
          }
          return lin.id === l.id;
        });
        (GridComponent.joints[desiredJointIndex] as RealJoint).links.splice(deleteLinkIndex, 1);
        // remove link from links
        const deleteLinkIndex2 = GridComponent.links.findIndex((li) => li.id === l.id);
        GridComponent.links.splice(deleteLinkIndex2, 1);
      } else {
        l.joints.forEach((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          if (jt.id === GridComponent.selectedJoint.id) {
            return;
          }
          const deleteJointIndex = jt.connectedJoints.findIndex(
            (jjj) => jjj.id === GridComponent.selectedJoint.id
          );
          jt.connectedJoints.splice(deleteJointIndex, 1);
        });
        l.id = l.id.replace(GridComponent.selectedJoint.id, '');
        const delJointIndex = l.joints.findIndex((jj) => jj.id === GridComponent.selectedJoint.id);
        l.joints.splice(delJointIndex, 1);
      }
    });
    GridComponent.joints.splice(jointIndex, 1);
    if (GridComponent.selectedLink !== undefined) {
      GridComponent.selectedLink.d = RealLink.getD(GridComponent.selectedLink.joints);
    }
    GridComponent.updateMechanism();
    GridComponent.onMechUpdateState.next(3);
  }

  //This is only used for context menu link creation
  // TODO: This should all be done within HTML and not within TS, but do this last when cleaning up code
  createLink($event: MouseEvent, gridOrJoint: string) {
    this.disappearContext();
    let startX: number;
    let startY: number;
    let startCoord = new Coord(0, 0);
    switch (gridOrJoint) {
      case 'grid':
        startX = Number(GridComponent.contextMenuAddLinkOntoGrid.children[0].getAttribute('x'));
        startY = Number(GridComponent.contextMenuAddLinkOntoGrid.children[0].getAttribute('y'));
        startCoord = GridComponent.screenToGrid(startX, startY);
        GridComponent.gridStates = gridStates.createJointFromGrid;

        break;
      case 'joint':
        startCoord.x = GridComponent.selectedJoint.x;
        startCoord.y = GridComponent.selectedJoint.y;
        GridComponent.gridStates = gridStates.createJointFromJoint;
        GridComponent.jointStates = jointStates.creating;
        break;
      case 'link':
        // TODO: Create logic for attaching a link onto a link
        startX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
        startY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
        startCoord = GridComponent.screenToGrid(startX, startY);
        GridComponent.gridStates = gridStates.createJointFromLink;
        GridComponent.linkStates = linkStates.creating;
        break;
      default:
        return;
    }
    const mouseRawPos = GridComponent.getMousePosition($event);
    if (mouseRawPos === undefined) {
      return;
    }
    const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    // TODO: Within future, create a tempJoint and temp Link and set those values as these values in order to avoid
    // TODO: having to call setAttribute and have HTML update for you automatically
    GridComponent.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', mousePos.x.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', mousePos.y.toString());
    GridComponent.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    GridComponent.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    GridComponent.jointTempHolderSVG.style.display = 'block';
    GridComponent.onMechUpdateState.next(3);
  }

  createInput($event: MouseEvent) {
    this.disappearContext();
    // TODO: Adjust this logic when there are multiple mechanisms created
    GridComponent.selectedJoint.input = !GridComponent.selectedJoint.input;
    let jointsTraveled = ''.concat(GridComponent.selectedJoint.id);
    GridComponent.selectedJoint.connectedJoints.forEach((j) => {
      jointsTraveled = checkConnectedJoints(j, jointsTraveled);
    });

    function checkConnectedJoints(j: Joint, jointsTraveled: string): string {
      if (!(j instanceof RealJoint) || jointsTraveled.includes(j.id)) {
        return jointsTraveled;
      }
      j.input = false;
      jointsTraveled = jointsTraveled.concat(j.id);
      j.connectedJoints.forEach((jt) => {
        jointsTraveled = checkConnectedJoints(jt, jointsTraveled);
      });
      return jointsTraveled;
    }

    // TODO: Set this logic somewhere else
    // if (GridComponent.selectedJoint.input) {
    //   this.joints.forEach(j => {
    //     // This logic belongs somewhere where you change rev Joint to pris Joint
    //     if (j instanceof PrisJoint) {
    //       this.createImagJointAndLinks(j);
    //     }
    //   });
    // } else {
    //   const jointIndicesRemove: number[] = [];
    //   const linkIndicesRemove: number[] = [];
    //   this.joints.forEach((j, j_index) => {
    //     if (j instanceof ImagJoint) {
    //       jointIndicesRemove.push(j_index);
    //     }
    //   });
    //   this.links.forEach((l, l_index) => {
    //     if (l instanceof ImagLink) {
    //       linkIndicesRemove.push(l_index);
    //     }
    //   });
    //   // TODO: Go through neighboring joints of ImagJoints joints and ImagLinks links and remove itself from list ... Verify this logic
    //   // TODO: This belongs when you either change the prismatic joint to rev joint or delete the joint.
    //   if (jointIndicesRemove.length !== 0) {
    //     this.joints.splice(jointIndicesRemove.pop()!, 1);
    //     this.links.splice(linkIndicesRemove.pop()!, 1);
    //   }
    // }
    GridComponent.updateMechanism();
    GridComponent.onMechUpdateState.next(3);
  }

  createForce($event: MouseEvent) {
    this.disappearContext();
    let startCoord: Coord;
    const screenX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
    startCoord = GridComponent.screenToGrid(screenX, screenY);
    const mouseRawPos = GridComponent.getMousePosition($event);
    if (mouseRawPos === undefined) {
      return;
    }
    const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    GridComponent.forceTempHolderSVG.children[0].setAttribute(
      'd',
      Force.createForceLine(startCoord, mousePos)
    );
    GridComponent.forceTempHolderSVG.children[1].setAttribute(
      'd',
      Force.createForceArrow(startCoord, mousePos)
    );
    GridComponent.forceStates = forceStates.creating;
    GridComponent.gridStates = gridStates.createForce;
    GridComponent.forceTempHolderSVG.style.display = 'block';
    GridComponent.onMechUpdateState.next(3);
  }

  editShape() {
    this.disappearContext();
    // TODO: Check if this logic is valid
    GridComponent.initialLink = new RealLink(
      GridComponent.selectedLink.id,
      GridComponent.selectedLink.joints
    );
    GridComponent.initialLink.d = GridComponent.selectedLink.d;
    GridComponent.initialLink.CoM = GridComponent.selectedLink.CoM;
    GridComponent.showcaseShapeSelector = !GridComponent.showcaseShapeSelector;
  }

  //Only to be used when deleting a selected (by panel) link from the edit panel, use delete Link otherwise
  //Alex had a issue with this before when implementing multi-joint links.
  deleteSelectedLink() {
    //Selected means selected in the activeObj Service
    this.disappearContext();

    const linkIndex = GridComponent.links.findIndex(
      (l) => l.id === this.activeObjService.selectedLink.id
    );

    GridComponent.links[linkIndex].joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      // const delLinkIndex = j.links.findIndex((l) => l.id === GridComponent.selectedLink.id);
      const delLinkIndex = j.links.findIndex((l) => l.id === this.activeObjService.selectedLink.id);
      j.links.splice(delLinkIndex, 1);
    });
    for (let j_i = 0; j_i < GridComponent.links[linkIndex].joints.length - 1; j_i++) {
      for (
        let next_j_i = j_i + 1;
        next_j_i < GridComponent.links[linkIndex].joints.length;
        next_j_i++
      ) {
        // TODO: Should recreate a function for this... (kinda too lazy atm)
        const joint = GridComponent.links[linkIndex].joints[j_i];
        if (!(joint instanceof RealJoint)) {
          return;
        }
        const desiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === GridComponent.links[linkIndex].joints[next_j_i].id
        );
        joint.connectedJoints.splice(desiredJointIndex, 1);
        const otherJoint = GridComponent.links[linkIndex].joints[next_j_i];
        if (!(otherJoint instanceof RealJoint)) {
          return;
        }
        const otherDesiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === GridComponent.links[linkIndex].joints[j_i].id
        );
        otherJoint.connectedJoints.splice(otherDesiredJointIndex, 1);
      }
    }
    GridComponent.links.splice(linkIndex, 1);
    GridComponent.updateMechanism();
    GridComponent.onMechUpdateState.next(3);
  }

  deleteLink() {
    this.disappearContext();
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink.id === GridComponent.selectedLink.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }
    // console.warn(this.activeObjService.Link);
    const linkIndex = GridComponent.links.findIndex((l) => l.id === GridComponent.selectedLink.id);
    GridComponent.links[linkIndex].joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      const delLinkIndex = j.links.findIndex((l) => l.id === GridComponent.selectedLink.id);
      j.links.splice(delLinkIndex, 1);
    });
    for (let j_i = 0; j_i < GridComponent.links[linkIndex].joints.length - 1; j_i++) {
      for (
        let next_j_i = j_i + 1;
        next_j_i < GridComponent.links[linkIndex].joints.length;
        next_j_i++
      ) {
        // TODO: Should recreate a function for this... (kinda too lazy atm)
        const joint = GridComponent.links[linkIndex].joints[j_i];
        if (!(joint instanceof RealJoint)) {
          return;
        }
        const desiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === GridComponent.links[linkIndex].joints[next_j_i].id
        );
        joint.connectedJoints.splice(desiredJointIndex, 1);
        const otherJoint = GridComponent.links[linkIndex].joints[next_j_i];
        if (!(otherJoint instanceof RealJoint)) {
          return;
        }
        const otherDesiredJointIndex = otherJoint.connectedJoints.findIndex(
          (jj) => jj.id === GridComponent.links[linkIndex].joints[j_i].id
        );
        otherJoint.connectedJoints.splice(otherDesiredJointIndex, 1);
      }
    }
    GridComponent.links.splice(linkIndex, 1);
    GridComponent.updateMechanism();
    GridComponent.onMechUpdateState.next(3);
  }

  changeForceDirection() {
    this.disappearContext();
    GridComponent.selectedForce.arrowOutward = !GridComponent.selectedForce.arrowOutward;
    if (GridComponent.selectedForce.arrowOutward) {
      GridComponent.selectedForce.forceArrow = Force.createForceArrow(
        GridComponent.selectedForce.startCoord,
        GridComponent.selectedForce.endCoord
      );
    } else {
      GridComponent.selectedForce.forceArrow = Force.createForceArrow(
        GridComponent.selectedForce.endCoord,
        GridComponent.selectedForce.startCoord
      );
    }
    GridComponent.updateMechanism();
  }

  changeForceLocal() {
    this.disappearContext();
    GridComponent.selectedForce.local = !GridComponent.selectedForce.local;
    if (GridComponent.selectedForce.local) {
      GridComponent.selectedForce.stroke = 'blue';
      GridComponent.selectedForce.fill = 'blue';
    } else {
      GridComponent.selectedForce.stroke = 'black';
      GridComponent.selectedForce.fill = 'black';
    }
    GridComponent.updateMechanism();
  }

  deleteForce() {
    this.disappearContext();
    const forceIndex = GridComponent.forces.findIndex(
      (f) => f.id === GridComponent.selectedForce.id
    );
    GridComponent.forces.splice(forceIndex, 1);
    GridComponent.updateMechanism();
  }

  static updateMechanism() {
    GridComponent.mechanisms = [];
    // TODO: Determine logic later once everything else is determined
    let inputAngularVelocity = ToolbarComponent.inputAngularVelocity;
    if (ToolbarComponent.clockwise) {
      inputAngularVelocity = ToolbarComponent.inputAngularVelocity * -1;
    }
    GridComponent.mechanisms.push(
      new Mechanism(
        GridComponent.joints,
        GridComponent.links,
        GridComponent.forces,
        GridComponent.ics,
        ToolbarComponent.gravity,
        ToolbarComponent.unit,
        inputAngularVelocity
      )
    );
  }

  static dragJoint(selectedJoint: RealJoint, trueCoord: Coord) {
    // TODO: have the round Number be integrated within function for determining trueCoord
    selectedJoint.x = roundNumber(trueCoord.x, 3);
    selectedJoint.y = roundNumber(trueCoord.y, 3);
    switch (selectedJoint.constructor) {
      case RevJoint:
        selectedJoint.links.forEach((l) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === selectedJoint.id);
          l.joints[jointIndex].x = roundNumber(trueCoord.x, 3);
          l.joints[jointIndex].y = roundNumber(trueCoord.y, 3);
          l.d = RealLink.getD(l.joints);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.updateCoMDs();
          l.updateLengthAndAngle();
          // PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces);
          PositionSolver.setUpInitialJointLocations(l.joints);
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
            PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
            PositionSolver.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
            f.endCoord.x = PositionSolver.forcePositionMap.get(f.id + 'end')!.x;
            f.endCoord.y = PositionSolver.forcePositionMap.get(f.id + 'end')!.y;
            f.startCoord.x = PositionSolver.forcePositionMap.get(f.id + 'start')!.x;
            f.startCoord.y = PositionSolver.forcePositionMap.get(f.id + 'start')!.y;
            f.forceLine = Force.createForceLine(f.startCoord, f.endCoord);
            f.forceArrow = Force.createForceArrow(f.startCoord, f.endCoord);
          });
        });
        break;
      case PrisJoint:
        selectedJoint.connectedJoints.forEach((j) => {
          if (!(j instanceof RealJoint)) {
            return;
          }
          if (j.ground) {
            return;
          }
          j.x = selectedJoint.x;
          j.y = selectedJoint.y;

          j.links.forEach((l) => {
            if (!(l instanceof RealLink)) {
              return;
            }
            // TODO: delete this if this is not needed (verify this)
            const jointIndex = l.joints.findIndex((jt) => jt.id === j.id);
            l.joints[jointIndex].x = roundNumber(trueCoord.x, 3);
            l.joints[jointIndex].y = roundNumber(trueCoord.y, 3);
            l.d = RealLink.getD(l.joints);
            l.CoM = RealLink.determineCenterOfMass(l.joints);
            l.updateCoMDs();
            l.forces.forEach((f) => {
              // TODO: adjust the location of force endpoints and update the line and arrow
            });
          });
        });
        break;
    }
    return selectedJoint;
  }

  private static dragForce(selectedForce: Force, trueCoord: Coord) {
    // TODO: Determine how to optimize this so screen is more fluid
    if (GridComponent.selectedForceEndPoint === 'startPoint') {
      selectedForce.startCoord.x = trueCoord.x;
      selectedForce.startCoord.y = trueCoord.y;
    } else {
      selectedForce.endCoord.x = trueCoord.x;
      selectedForce.endCoord.y = trueCoord.y;
    }
    selectedForce.forceLine = Force.createForceLine(
      selectedForce.startCoord,
      selectedForce.endCoord
    );
    if (selectedForce.arrowOutward) {
      selectedForce.forceArrow = Force.createForceArrow(
        selectedForce.startCoord,
        selectedForce.endCoord
      );
    } else {
      selectedForce.forceArrow = Force.createForceArrow(
        selectedForce.endCoord,
        selectedForce.startCoord
      );
    }
    selectedForce.angle = Force.updateAngle(selectedForce.startCoord, selectedForce.endCoord);
    return selectedForce;
  }

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
      default:
        return '?';
    }
  }

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  typeOfLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      case Piston:
        return 'P';
      default:
        return '?';
    }
  }

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  static showPathHolder: boolean = false;

  getLinkProp(l: Link, propType: string) {
    if (l instanceof Piston) {
      return;
    }
    const link = l as RealLink;
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoM.x;
      case 'CoMY':
        // TODO: Implement logic to not have -1?
        return link.CoM.y * -1;
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
      case 'CoM_d1':
        return link.CoM_d1;
      case 'CoM_d2':
        return link.CoM_d2;
      case 'CoM_d3':
        return link.CoM_d3;
      case 'CoM_d4':
        return link.CoM_d4;
      default:
        return '?';
    }
  }

  private determineNextLetter(additionalLetters?: string[]) {
    let lastLetter = '';
    if (GridComponent.joints.length === 0 && additionalLetters === undefined) {
      return 'a';
    }
    GridComponent.joints.forEach((j) => {
      if (j.id > lastLetter) {
        lastLetter = j.id;
      }
    });
    additionalLetters?.forEach((l) => {
      if (l > lastLetter) {
        lastLetter = l;
      }
    });
    return String.fromCharCode(lastLetter.charCodeAt(0) + 1);
  }

  // private createImagJointAndLinks(joint: PrisJoint) {
  //   const imagJointId = this.determineNextLetter();
  //   const inputJointIndex = this.findInputJointIndex();
  //   const inputJoint = this.joints[inputJointIndex];
  //   if (inputJoint === undefined) {
  //     return
  //   }
  //   const radToDeg = 180 / Math.PI;
  //   let coord: Coord;
  //   if (joint.angle % (180 * radToDeg) === 0) {
  //     coord = new Coord(inputJoint.x, joint.y);
  //   } else if (joint.angle % (90 * radToDeg) === 0) {
  //     coord = new Coord(joint.x, inputJoint.y);
  //   } else {
  //     const m1 = Math.cos(joint.angle);
  //     const m2 = Math.cos(90 - joint.angle);
  //     const b1 = joint.y;
  //     const b2 = inputJoint.y;
  //     const x = (b2 - b1) / (m1 - m2);
  //     const y = m1 * x + b1;
  //     coord = new Coord(x, y);
  //   }
  //   const imagJoint = new PrisJoint(imagJointId, coord.x, coord.y);
  //   this.joints.push(imagJoint);
  //   joint.connectedJoints.push(imagJoint);
  //   const linkJoints = [];
  //   linkJoints.push(joint);
  //   linkJoints.push(imagJoint);
  //   const linkID = joint.id + imagJoint.id;
  //   const imagLink = new Piston(linkID, linkJoints);
  //   this.links.push(imagLink);
  //   joint.links.push(imagLink);
  // }

  private findInputJointIndex() {
    return GridComponent.joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
  }

  private findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex((j) => j.id === id);
  }

  //Return a boolean, is this link a ground link?
  getGround(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    return joint.ground;
  }

  containsSlider(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        if (!(joint instanceof RevJoint)) {
          return false;
        }
        let condition = false;
        joint.connectedJoints.forEach((j) => {
          if (j.constructor === PrisJoint) {
            condition = true;
          }
        });
        return condition;
      case PrisJoint:
        return false;
      case RealJoint:
        return false;
      default:
        return false;
    }
  }

  getJointR(joint: Joint) {
    if (!(joint instanceof RevJoint)) {
      return 0;
    }
    return joint.r;
  }

  getInput(joint: Joint) {
    if (!(joint instanceof RevJoint || joint instanceof PrisJoint)) {
      return;
    }
    return joint.input;
  }

  noAnimate() {
    clearTimeout(0);
  }

  static animate(progress: number, animationState?: boolean) {
    // GridComponent.onMechPositionChange.next(progress);
    GridComponent.onMechPositionChange.next(progress);
    GridComponent.mechanismTimeStep = progress;
    GridComponent.showPathHolder = !(GridComponent.mechanismTimeStep === 0 && !animationState);
    if (animationState !== undefined) {
      AnimationBarComponent.animate = animationState;
    }

    GridComponent.joints.forEach((j, j_index) => {
      j.x = GridComponent.mechanisms[0].joints[GridComponent.mechanismTimeStep][j_index].x;
      j.y = GridComponent.mechanisms[0].joints[GridComponent.mechanismTimeStep][j_index].y;
    });
    GridComponent.links.forEach((l, l_index) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      const link = GridComponent.mechanisms[0].links[GridComponent.mechanismTimeStep][l_index];
      if (!(link instanceof RealLink)) {
        return;
      }
      // l.d = RealLink.getD(l.joints);
      l.d = link.d;
      l.CoM = link.CoM;
      l.updateCoMDs();
    });
    GridComponent.forces.forEach((f, f_index) => {
      f.startCoord.x =
        GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].startCoord.x;
      f.startCoord.y =
        GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].startCoord.y;
      f.endCoord.x =
        GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].endCoord.x;
      f.endCoord.y =
        GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].endCoord.y;
      f.local = GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].local;
      f.mag = GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].mag;
      f.angle = GridComponent.mechanisms[0].forces[GridComponent.mechanismTimeStep][f_index].angle;
      f.forceLine = Force.createForceLine(f.startCoord, f.endCoord);
      f.forceArrow = Force.createForceArrow(f.startCoord, f.endCoord);
    });
    if (!AnimationBarComponent.animate) {
      return;
    }
    GridComponent.mechanismTimeStep += GridComponent.mechanismAnimationIncrement;
    if (GridComponent.mechanismTimeStep >= GridComponent.mechanisms[0].joints.length) {
      GridComponent.mechanismTimeStep = 0;
    }
    setTimeout(() => {
      this.animate(GridComponent.mechanismTimeStep);
    }, 8);
  }

  static adjustView(setting: string) {
    let halfWidth: number;
    let halfHeight: number;
    switch (setting) {
      case 'in':
        halfWidth = GridComponent.canvasSVGElement.clientWidth / 2;
        halfHeight = GridComponent.canvasSVGElement.clientHeight / 2;
        GridComponent.zoomPoint(21 / 20, halfWidth, halfHeight);
        break;
      case 'out':
        halfWidth = GridComponent.canvasSVGElement.clientWidth / 2;
        halfHeight = GridComponent.canvasSVGElement.clientHeight / 2;
        GridComponent.zoomPoint(20 / 21, halfWidth, halfHeight);
        break;
      case 'reset':
        GridComponent.reset();
        break;
    }
  }

  getJointPath(joint: Joint) {
    if (GridComponent.mechanisms[0].joints[0].length === 0) {
      return '';
    }
    let string = 'M';
    const jointIndex = GridComponent.joints.findIndex((j) => j.id === joint.id);
    string +=
      GridComponent.mechanisms[0].joints[0][jointIndex].x.toString() +
      ' , ' +
      GridComponent.mechanisms[0].joints[0][jointIndex].y.toString();
    for (let j_index = 1; j_index < GridComponent.mechanisms[0].joints.length; j_index++) {
      string +=
        'L' +
        GridComponent.mechanisms[0].joints[j_index][jointIndex].x.toString() +
        ' , ' +
        GridComponent.mechanisms[0].joints[j_index][jointIndex].y.toString();
    }
    return string;
  }

  getJoints() {
    return GridComponent.joints;
  }

  getLinks() {
    return GridComponent.links;
  }

  getForces() {
    return GridComponent.forces;
  }

  showIDTags() {
    // return AnimationBarComponent.showIdTags;
  }

  showCoMTags() {
    // return AnimationBarComponent.showCoMTags;
  }

  getShowcaseShapeSelector() {
    return GridComponent.showcaseShapeSelector;
  }

  static sendNotification(text: string) {
    //If there is more than one notification in the last seccond, ingore all but the first
    if (GridComponent.lastNotificationTime + 1000 < Date.now()) {
      GridComponent.lastNotificationTime = Date.now();
      this._snackBar.open(text, '', {
        panelClass: 'my-custom-snackbar',
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 4000,
      });
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    if (($event.ctrlKey || $event.metaKey) && $event.keyCode == 90) {
      GridComponent.sendNotification(
        'You attempted to undo. What were you trying to undo? If this feature important to you? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }

    if ($event.keyCode == 27) {
      // GridComponent.sendNotification(
      //   'You pressed the "Escape" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      // );
      this.activeObjService.updateSelectedObj(undefined);
    }

    if ($event.keyCode == 46) {
      if (GridComponent.canDelete) {
        if (this.activeObjService.objType === 'Nothing') {
          GridComponent.sendNotification('Select an object to delete.');
          return;
        }
        if (this.activeObjService.objType === 'Joint') {
          this.deleteJoint();
        } else if (this.activeObjService.objType === 'Link') {
          this.deleteSelectedLink();
        }
        this.activeObjService.updateSelectedObj(undefined);
        GridComponent.sendNotification('Deleted Selected Object.');
      } else {
        return;
      }
    }

    if ($event.keyCode == 32) {
      // GridComponent.sendNotification(
      //   'You pressed the "space" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      // );
    }

    if ($event.keyCode == 38) {
      GridComponent.sendNotification(
        'You pressed the "Up" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }

    if ($event.keyCode == 40) {
      GridComponent.sendNotification(
        'You pressed the "Down" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }
  }
}
