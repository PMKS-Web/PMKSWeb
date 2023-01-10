import { AfterViewInit, Component, EventEmitter, HostListener, Input, OnInit } from '@angular/core';
import { Coord } from '../../model/coord';
import { AppConstants } from '../../model/app-constants';
import { Joint, RevJoint, PrisJoint, RealJoint } from '../../model/joint';
import { Piston, Link, RealLink, Shape, Bound } from '../../model/link';
import { Force } from '../../model/force';
import { Mechanism } from '../../model/mechanism/mechanism';
import { InstantCenter } from '../../model/instant-center';
import {
  determineSlope,
  determineX,
  determineY,
  determineYIntersect,
  roundNumber,
  splitURLInfo,
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
// import {MatSnackBar} from "@angular/material/snack-bar";
// import { MatIcon } from '@angular/material/icon';

// The possible states the program could be in.
enum gridStates {
  waiting,
  createJointFromGrid,
  createJointFromJoint,
  createJointFromLink,
  createForce,
  dragging,
}

enum jointStates {
  waiting,
  creating,
  dragging,
}

enum linkStates {
  waiting,
  dragging,
  creating,
  resizing,
}

enum forceStates {
  waiting,
  creating,
  dragging,
}

enum shapeEditModes {
  move,
  resize,
}

enum createModes {
  link,
  force,
}

enum moveModes {
  joint,
  forceEndpoint,
  threePosition,
  pathPoint,
}

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

  static screenCoord: string = '';

  static onMechPositionChange = new EventEmitter<number>();

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
  static selectedBound: string;
  private static initialLinkMouseCoord: Coord;
  private static selectedForce: Force;
  private static selectedForceEndPoint: string;
  static initialLink: RealLink;
  // static snackBar: MatSnackBar;
  static _snackBar: MatSnackBar;

  private static instance: GridComponent | null = null;

  // TODO: ADD LOGIC FOR INSTANT CENTERS AND GEARS AFTER FINISHING SIMJOINTS AND SIMLINKS!
  constructor(public activeObjService: ActiveObjService, private snackBar?: MatSnackBar) {
    GridComponent._snackBar = snackBar!;
    if (GridComponent.instance) {
      return GridComponent.instance;
    } else {
      GridComponent.instance = this;
    }
  }

  findEnlargedLinkHelper() {
    // console.log(this.activeObjService.Link.bound);
    return RealLink.getPointsFromBounds(
      this.activeObjService.Link.bound,
      this.activeObjService.Link.shape,
      0.5
    );
  }

  ngOnInit(): void {
    // don't forget to add "#" CSS selector to the name of the DOM element.
    // var draw = SVG().addTo('#canvas').size(1000, 1000).panZoom();
    // var rect = draw.rect(100, 100).attr({ fill: '#f06' });
    // rect.draggable();

    const jointPropsString = splitURLInfo('j=');
    const linkPropsString = splitURLInfo('&l=');
    const forcePropsString = splitURLInfo('&f=');
    if (jointPropsString.length === 0 || linkPropsString.length === 0) {
      return;
    }
    if (
      !(
        typeof jointPropsString === 'string' &&
        typeof linkPropsString === 'string' &&
        typeof forcePropsString === 'string'
      )
    ) {
      return;
    }
    const jointStringArray = jointPropsString.split('\n');
    const jointArray = [] as Joint[];
    jointStringArray.forEach((jointString) => {
      if (jointString.length === 0) {
        return;
      }
      const propsArray = jointString.split(',');
      // todo: needs input error checking
      const id = propsArray[0];
      const x = stringToFloat(propsArray[1]);
      const y = stringToFloat(propsArray[2]);
      // const linkIDArray = propsArray[3].split('|');
      // const links = this.getLinksByIds(linkIDArray, linkArray);
      // const links = propsArray[3];
      const type = propsArray[4];
      const ground = stringToBoolean(propsArray[5]);
      // const coefficient_of_friction = propsArray[7];
      const input = stringToBoolean(propsArray[7]);
      let joint: Joint;
      switch (type) {
        case 'R':
          joint = new RevJoint(id, x, y, input, ground);
          break;
        case 'P':
          joint = new PrisJoint(id, x, y, input, ground);
          if (!(joint instanceof PrisJoint)) {
            return;
          }
          const angle = stringToFloat(propsArray[6]);
          joint.angle = angle;
          break;
        default:
          return;
      }
      jointArray.push(joint);

      // const joint = new Joint(propsArray[0], parseFloat(propsArray[1]), parseFloat(propsArray[2]), propsArray[3]);
      // const ground = this.stringToBoolean(propsArray[4]);
      // const input = this.stringToBoolean(propsArray[5]);
      // const joint = new Joint(id, parseFloat(x), parseFloat(y), type, parseFloat(angle), parseFloat(coefficient_of_friction));
      // joint.input = input_joint;
      // joint.grounded = ground_joint;
      // if (input_joint) {
      //   // joint.setInput(true, joint);
      //   joint.setInput(true);
      // } else if (joint.getSlider()) {
      //   joint.setSlider(true);
      // } else if (ground_joint) {
      //   joint.setGrounded(true, type);
      // }
      // joint.links = links;
      // joint.setLinks(links);
      // jointArray.push(joint);
    });
    const linkStringArray = linkPropsString.split('\n');
    const linkArray = [] as Link[];
    linkStringArray.forEach((linkString) => {
      if (linkString.length === 0) {
        return;
      }
      const propsArray = linkString.split(',');
      // todo: needs input error checking
      const id = propsArray[0];
      const typeOfLink = propsArray[1];
      const jointIDArray = propsArray[6].split('|');
      // const forceIDArray = propsArray[7].split('|');
      let joints: RealJoint[] = [];
      jointIDArray.forEach((jointID) => {
        const joint = jointArray.find((jt) => jt.id === jointID)!;
        if (!(joint instanceof RealJoint)) {
          return;
        }
        // TODO: Maybe put check here to see if they got a joint
        joints.push(joint);
      });
      let newLink: Link;
      switch (typeOfLink) {
        case 'R':
          const mass = stringToFloat(propsArray[2]);
          const mass_moi = stringToFloat(propsArray[3]);
          const CoM_X = stringToFloat(propsArray[4]);
          const CoM_Y = stringToFloat(propsArray[5]);
          const CoM = new Coord(CoM_X, CoM_Y);
          // const jointIDArray = propsArray[6].split('|');
          // // const forceIDArray = propsArray[7].split('|');
          // let joints: RealJoint[] = [];
          // jointIDArray.forEach(jointID => {
          //   const joint = jointArray.find(jt => jt.id === jointID)!;
          //   if (!(joint instanceof RealJoint)) {return}
          //   // TODO: Maybe put check here to see if they got a joint
          //   joints.push(joint);
          // });
          // const joints = getJointsByIds(jointIDArray, jointArray);
          // const forces = getForcesByIds(forceIDArray, forceArray);
          const shape = stringToShape(propsArray[8]);
          // const shapeFullname = this.shapeNicknameToFullname(propsArray[7]);
          // const shape = this.stringToShape(shapeFullname);

          const b1 = new Coord(stringToFloat(propsArray[9]), stringToFloat(propsArray[10]));
          const b2 = new Coord(stringToFloat(propsArray[11]), stringToFloat(propsArray[12]));
          const b3 = new Coord(stringToFloat(propsArray[13]), stringToFloat(propsArray[14]));
          const b4 = new Coord(stringToFloat(propsArray[15]), stringToFloat(propsArray[16]));
          const arrow_x = (b1.x + b2.x + b3.x + b4.x) / 4;
          const arrow_y = (b1.x + b2.x + b3.x + b4.x) / 4;
          const arrow = new Coord(arrow_x, arrow_y);

          const bound: Bound = new (class implements Bound {
            arrow: Coord = arrow;
            b1: Coord = b1;
            b2: Coord = b2;
            b3: Coord = b3;
            b4: Coord = b4;
          })();
          newLink = new RealLink(id, joints, mass, mass_moi, shape, bound, CoM);
          break;
        case 'P':
          newLink = new Piston(id, joints);
          break;
        default:
          return;
      }

      // const newLink = new RealLink(id, joints, shape, { b1: b1, b2: b2, b3: b3, b4: b4, arrow: arrow });
      // TODO: Set the code as below and also include mass, massMoI, and CoM. This important for links with other link shapes
      // const newLinks = new RealLink(id, joints, shape, bound);
      // newLink.mass = mass;
      // newLink.massMoI = mass_moi;
      // newLink.CoM.x = CoM_X;
      // newLink.CoM.y = CoM_Y;
      for (let j_index = 0; j_index < joints.length - 1; j_index++) {
        for (let next_j_index = j_index + 1; next_j_index < joints.length; next_j_index++) {
          joints[j_index].connectedJoints.push(joints[next_j_index]);
          joints[next_j_index].connectedJoints.push(joints[j_index]);
        }
      }
      joints.forEach((j) => {
        j.links.push(newLink);
      });
      linkArray.push(newLink);
    });
    const forceStringArray = forcePropsString.split('\n');
    const forceArray = [] as Force[];
    forceStringArray.forEach((forceString) => {
      if (forceString.length === 0) {
        return;
      }
      const propsArray = forceString.split(',');

      const id = propsArray[0];
      const linkId = propsArray[1];
      const link = linkArray.find((l) => {
        return l.id === linkId;
      });
      // if (!link) { throw new Error('link referenced in force does not exist'); }
      if (!(link instanceof RealLink)) {
        return;
      }
      const start = new Coord(stringToFloat(propsArray[2]), stringToFloat(propsArray[3]));
      const end = new Coord(stringToFloat(propsArray[4]), stringToFloat(propsArray[5]));
      const global = stringToBoolean(propsArray[6]);
      const direction = stringToBoolean(propsArray[7]);
      const mag = stringToFloat(propsArray[8]);
      const newForce = new Force(id, link, start, end, global);
      newForce.arrowOutward = direction;
      newForce.mag = mag;
      link.forces.push(newForce);
      forceArray.push(newForce);
    });
    GridComponent.joints = jointArray;
    GridComponent.links = linkArray;
    GridComponent.forces = forceArray;
    // jointArray.forEach(j => {
    // GridComponent.
    // });
    // linkArray.forEach(l => {});
    // forceArray.forEach(f => {});
  }

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
              }
            }

            break;
          default:
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
              case gridStates.waiting:
                const mPos = GridComponent.getMousePosition($event)!;
                GridComponent.panOffset.x = mPos.x;
                GridComponent.panOffset.y = mPos.y;
                GridComponent.gridStates = gridStates.dragging;
                break;
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

                GridComponent.updateMechanism();
                GridComponent.gridStates = gridStates.waiting;
                GridComponent.linkStates = linkStates.waiting;
                GridComponent.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createForce:
                let startCoord = new Coord(0, 0);
                let screenX: number;
                let screenY: number;
                if (GridComponent.selectedLink.shape === Shape.line) {
                  screenX = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('x'));
                  screenY = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('y'));
                } else {
                  screenX = Number(
                    GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x')
                  );
                  screenY = Number(
                    GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y')
                  );
                }
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
                  GridComponent.selectedBound = thing;
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
          GridComponent.showPathHolder = GridComponent.mechanisms[0].dof === 1;
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
        GridComponent.selectedLink.bound.b1.x += offsetX;
        GridComponent.selectedLink.bound.b1.y += offsetY;
        GridComponent.selectedLink.bound.b2.x += offsetX;
        GridComponent.selectedLink.bound.b2.y += offsetY;
        GridComponent.selectedLink.bound.b3.x += offsetX;
        GridComponent.selectedLink.bound.b3.y += offsetY;
        GridComponent.selectedLink.bound.b4.x += offsetX;
        GridComponent.selectedLink.bound.b4.y += offsetY;
        GridComponent.initialLinkMouseCoord.x = trueCoord.x;
        GridComponent.initialLinkMouseCoord.y = trueCoord.y;
        GridComponent.selectedLink.d = RealLink.getPointsFromBounds(
          GridComponent.selectedLink.bound,
          GridComponent.selectedLink.shape
        );
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
        let fixedBound: string;

        switch (GridComponent.selectedBound) {
          case 'b1':
            typeOfBoundToCoordMap.set('fixed', GridComponent.selectedLink.bound.b3);
            fixedBound = 'b3';
            typeOfBoundToCoordMap.set('drag', GridComponent.selectedLink.bound.b1);
            typeOfBoundToCoordMap.set('sideCoord1', GridComponent.selectedLink.bound.b2);
            typeOfBoundToCoordMap.set('sideCoord2', GridComponent.selectedLink.bound.b4);
            break;
          case 'b2':
            typeOfBoundToCoordMap.set('fixed', GridComponent.selectedLink.bound.b4);
            fixedBound = 'b4';
            typeOfBoundToCoordMap.set('drag', GridComponent.selectedLink.bound.b2);
            typeOfBoundToCoordMap.set('sideCoord1', GridComponent.selectedLink.bound.b1);
            typeOfBoundToCoordMap.set('sideCoord2', GridComponent.selectedLink.bound.b3);
            break;
          case 'b3':
            typeOfBoundToCoordMap.set('fixed', GridComponent.selectedLink.bound.b1);
            fixedBound = 'b1';
            typeOfBoundToCoordMap.set('drag', GridComponent.selectedLink.bound.b3);
            typeOfBoundToCoordMap.set('sideCoord1', GridComponent.selectedLink.bound.b2);
            typeOfBoundToCoordMap.set('sideCoord2', GridComponent.selectedLink.bound.b4);
            break;
          case 'b4':
            typeOfBoundToCoordMap.set('fixed', GridComponent.selectedLink.bound.b2);
            fixedBound = 'b2';
            typeOfBoundToCoordMap.set('drag', GridComponent.selectedLink.bound.b4);
            typeOfBoundToCoordMap.set('sideCoord1', GridComponent.selectedLink.bound.b1);
            typeOfBoundToCoordMap.set('sideCoord2', GridComponent.selectedLink.bound.b3);
            break;
          default:
            fixedBound = 'none';
            const centerx =
              (GridComponent.selectedLink.bound.b1.x +
                GridComponent.selectedLink.bound.b2.x +
                GridComponent.selectedLink.bound.b3.x +
                GridComponent.selectedLink.bound.b4.x) /
              4;
            const centery =
              (GridComponent.selectedLink.bound.b1.y +
                GridComponent.selectedLink.bound.b2.y +
                GridComponent.selectedLink.bound.b3.y +
                GridComponent.selectedLink.bound.b4.y) /
              4;

            const dox = GridComponent.selectedLink.bound.b1.x - centerx;
            const doy = GridComponent.selectedLink.bound.b1.y - centery;
            const orotation = Math.atan2(doy, dox);

            const dnx = trueCoord.x - centerx;
            const dny = trueCoord.y - centery;
            const distn = Math.sqrt(dox * dox + doy * doy);
            const nrotation = Math.atan2(dny, dnx);

            const drotation = nrotation - orotation;

            const d1x = GridComponent.selectedLink.bound.b1.x - centerx;
            const d1y = GridComponent.selectedLink.bound.b1.y - centery;
            const rot1 = Math.atan2(d1y, d1x);
            const xc1 = Math.cos(rot1 + drotation) * distn;
            const yc1 = Math.sin(rot1 + drotation) * distn;
            b1n = new Coord(centerx + xc1, centery + yc1);

            const d2x = GridComponent.selectedLink.bound.b2.x - centerx;
            const d2y = GridComponent.selectedLink.bound.b2.y - centery;
            const rot2 = Math.atan2(d2y, d2x);
            const xc2 = Math.cos(rot2 + drotation) * distn;
            const yc2 = Math.sin(rot2 + drotation) * distn;
            b2n = new Coord(centerx + xc2, centery + yc2);

            const d3x = GridComponent.selectedLink.bound.b3.x - centerx;
            const d3y = GridComponent.selectedLink.bound.b3.y - centery;
            const rot3 = Math.atan2(d3y, d3x);
            const xc3 = Math.cos(rot3 + drotation) * distn;
            const yc3 = Math.sin(rot3 + drotation) * distn;
            b3n = new Coord(centerx + xc3, centery + yc3);

            const d4x = GridComponent.selectedLink.bound.b4.x - centerx;
            const d4y = GridComponent.selectedLink.bound.b4.y - centery;
            const rot4 = Math.atan2(d4y, d4x);
            const xc4 = Math.cos(rot4 + drotation) * distn;
            const yc4 = Math.sin(rot4 + drotation) * distn;
            b4n = new Coord(centerx + xc4, centery + yc4);

            arrow5n = new Coord(centerx, centery);

            // TODO: Determine new logic for this since there can't be return here...
            arrow5n_x = (b1n.x + b2n.x + b3n.x + b4n.x) / 4;
            arrow5n_y = (b1n.y + b2n.y + b3n.y + b4n.y) / 4;
            arrow5n = new Coord(arrow5n_x, arrow5n_y);
            GridComponent.selectedLink.bound.b1.x = b1n.x;
            GridComponent.selectedLink.bound.b1.y = b1n.y;
            GridComponent.selectedLink.bound.b2.x = b2n.x;
            GridComponent.selectedLink.bound.b2.y = b2n.y;
            GridComponent.selectedLink.bound.b3.x = b3n.x;
            GridComponent.selectedLink.bound.b3.y = b3n.y;
            GridComponent.selectedLink.bound.b4.x = b4n.x;
            GridComponent.selectedLink.bound.b4.y = b4n.y;
            GridComponent.selectedLink.bound.arrow.x = arrow5n.x;
            GridComponent.selectedLink.bound.arrow.y = arrow5n.y;
            GridComponent.selectedLink.d = RealLink.getPointsFromBounds(
              GridComponent.selectedLink.bound,
              GridComponent.selectedLink.shape
            );
            GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(
              GridComponent.selectedLink.joints
            );
            GridComponent.selectedLink.updateCoMDs();
            return;
        }

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

        switch (fixedBound) {
          case 'b1':
            b1n = new Coord(fixedCoord.x, fixedCoord.y);
            b2n = new Coord(side_coord_x_1, side_coord_y_1);
            b3n = new Coord(drag_coord_x, drag_coord_y);
            b4n = new Coord(side_coord_x_2, side_coord_y_2);
            break;
          case 'b2':
            b1n = new Coord(side_coord_x_1, side_coord_y_1);
            b2n = new Coord(fixedCoord.x, fixedCoord.y);
            b3n = new Coord(side_coord_x_2, side_coord_y_2);
            b4n = new Coord(drag_coord_x, drag_coord_y);
            break;
          case 'b3':
            b1n = new Coord(drag_coord_x, drag_coord_y);
            b2n = new Coord(side_coord_x_1, side_coord_y_1);
            b3n = new Coord(fixedCoord.x, fixedCoord.y);
            b4n = new Coord(side_coord_x_2, side_coord_y_2);
            break;
          case 'b4':
            b1n = new Coord(side_coord_x_1, side_coord_y_1);
            b2n = new Coord(drag_coord_x, drag_coord_y);
            b3n = new Coord(side_coord_x_2, side_coord_y_2);
            b4n = new Coord(fixedCoord.x, fixedCoord.y);
            break;
          default:
            // TODO: Adjust logic when you determine arrow position
            b1n = new Coord(side_coord_x_1, side_coord_y_1);
            b2n = new Coord(drag_coord_x, drag_coord_y);
            b3n = new Coord(side_coord_x_2, side_coord_y_2);
            b4n = new Coord(fixedCoord.x, fixedCoord.y);
            break;
        }
        arrow5n_x = (b1n.x + b2n.x + b3n.x + b4n.x) / 4;
        arrow5n_y = (b1n.y + b2n.y + b3n.y + b4n.y) / 4;
        arrow5n = new Coord(arrow5n_x, arrow5n_y);
        GridComponent.selectedLink.bound.b1.x = b1n.x;
        GridComponent.selectedLink.bound.b1.y = b1n.y;
        GridComponent.selectedLink.bound.b2.x = b2n.x;
        GridComponent.selectedLink.bound.b2.y = b2n.y;
        GridComponent.selectedLink.bound.b3.x = b3n.x;
        GridComponent.selectedLink.bound.b3.y = b3n.y;
        GridComponent.selectedLink.bound.b4.x = b4n.x;
        GridComponent.selectedLink.bound.b4.y = b4n.y;
        GridComponent.selectedLink.bound.arrow.x = arrow5n.x;
        GridComponent.selectedLink.bound.arrow.y = arrow5n.y;
        GridComponent.selectedLink.d = RealLink.getPointsFromBounds(
          GridComponent.selectedLink.bound,
          GridComponent.selectedLink.shape
        );
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
    GridComponent.contextMenuEditShape.style.display = 'none';
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
        if (link.shape === Shape.line) {
          this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuEditShape, offsetX, offsetY, 20, 20);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 40, 40);
        } else {
          this.showcaseContextMenu(
            GridComponent.contextMenuAddLinkOntoLink,
            offsetX,
            offsetY,
            0,
            0
          );
          this.showcaseContextMenu(
            GridComponent.contextMenuAddTracerPoint,
            offsetX,
            offsetY,
            20,
            20
          );
          this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 40, 40);
          this.showcaseContextMenu(GridComponent.contextMenuEditShape, offsetX, offsetY, 60, 60);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 80, 80);
        }
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
    const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
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
      this.activeObjService.Joint.id === GridComponent.selectedJoint.id
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
    GridComponent.updateMechanism();
  }

  //This is only used for context menu link creation
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
  }

  createForce($event: MouseEvent) {
    this.disappearContext();
    let startCoord: Coord;
    if (GridComponent.selectedLink.shape === Shape.line) {
      const screenX = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('x'));
      const screenY = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('y'));
      startCoord = GridComponent.screenToGrid(screenX, screenY);
    } else {
      const screenX = Number(
        GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x')
      );
      const screenY = Number(
        GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y')
      );
      startCoord = GridComponent.screenToGrid(screenX, screenY);
    }
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
  }

  editShape() {
    this.disappearContext();
    // TODO: Check if this logic is valid
    GridComponent.initialLink = new RealLink(
      GridComponent.selectedLink.id,
      GridComponent.selectedLink.joints
    );
    GridComponent.initialLink.bound = GridComponent.selectedLink.bound;
    GridComponent.initialLink.d = GridComponent.selectedLink.d;
    GridComponent.initialLink.CoM = GridComponent.selectedLink.CoM;
    GridComponent.showcaseShapeSelector = !GridComponent.showcaseShapeSelector;
  }

  deleteSelectedLink() {
    //Selected means selected in the activeObj Service
    this.disappearContext();
    // console.warn(this.activeObjService.Link);
    const linkIndex = GridComponent.links.findIndex((l) => l.id === this.activeObjService.Link.id);
    GridComponent.links[linkIndex].joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      const delLinkIndex = j.links.findIndex((l) => l.id === this.activeObjService.Link.id);
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
  }

  deleteLink() {
    this.disappearContext();
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.Link.id === GridComponent.selectedLink.id
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
        const otherDesiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === GridComponent.links[linkIndex].joints[j_i].id
        );
        otherJoint.connectedJoints.splice(otherDesiredJointIndex, 1);
      }
    }
    GridComponent.links.splice(linkIndex, 1);
    GridComponent.updateMechanism();
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
          if (l.shape !== Shape.line) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === selectedJoint.id);
          l.joints[jointIndex].x = roundNumber(trueCoord.x, 3);
          l.joints[jointIndex].y = roundNumber(trueCoord.y, 3);
          l.bound = RealLink.getBounds(
            new Coord(l.joints[0].x, l.joints[0].y),
            new Coord(l.joints[1].x, l.joints[1].y),
            Shape.line
          );
          l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.updateCoMDs();
          l.updateLengthAndAngle();
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
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
            l.bound = RealLink.getBounds(
              new Coord(l.joints[0].x, l.joints[0].y),
              new Coord(l.joints[1].x, l.joints[1].y),
              Shape.line
            );
            l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
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
      if (selectedForce.link.shape === 'line') {
        const jointOne = selectedForce.link.joints[0];
        const jointTwo = selectedForce.link.joints[1];
        const smallestX = jointOne.x < jointTwo.x ? jointOne.x : jointTwo.x;
        const biggestX = jointOne.x > jointTwo.x ? jointOne.x : jointTwo.x;
        // TODO: Check to see whether these roundNumbers here are necessary or not
        if (smallestX > trueCoord.x) {
          selectedForce.startCoord.x = roundNumber(smallestX, 3);
        } else if (biggestX < trueCoord.x) {
          selectedForce.startCoord.x = roundNumber(biggestX, 3);
        } else {
          selectedForce.startCoord.x = roundNumber(trueCoord.x, 3);
        }
        const slope = (jointTwo.y - jointOne.y) / (jointTwo.x - jointOne.x);
        const b = jointOne.y;
        selectedForce.startCoord.y = roundNumber(
          jointOne.y + (selectedForce.startCoord.x - jointOne.x) * slope,
          3
        );
      } else {
        selectedForce.startCoord.x = trueCoord.x;
        selectedForce.startCoord.y = trueCoord.y;
      }
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
    GridComponent.onMechPositionChange.emit(progress);
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
      l.bound = link.bound;
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

  getSelectedLinkProp(prop: string, type?: string, xOrY?: string) {
    switch (prop) {
      case 'shape':
        return GridComponent.selectedLink.shape;
      case 'bound':
        switch (type) {
          case 'b1':
            if (xOrY === 'x') {
              return GridComponent.selectedLink.bound.b1.x;
            } else {
              return GridComponent.selectedLink.bound.b1.y;
            }
          case 'b2':
            if (xOrY === 'x') {
              return GridComponent.selectedLink.bound.b2.x;
            } else {
              return GridComponent.selectedLink.bound.b2.y;
            }
          case 'b3':
            if (xOrY === 'x') {
              return GridComponent.selectedLink.bound.b3.x;
            } else {
              return GridComponent.selectedLink.bound.b3.y;
            }
          case 'b4':
            if (xOrY === 'x') {
              return GridComponent.selectedLink.bound.b4.x;
            } else {
              return GridComponent.selectedLink.bound.b4.y;
            }
          case 'arrow':
            if (xOrY === 'x') {
              return (
                (GridComponent.selectedLink.bound.b1.x +
                  GridComponent.selectedLink.bound.b2.x +
                  GridComponent.selectedLink.bound.b3.x +
                  GridComponent.selectedLink.bound.b4.x) /
                4
              );
            } else {
              return (
                (GridComponent.selectedLink.bound.b1.y +
                  GridComponent.selectedLink.bound.b2.y +
                  GridComponent.selectedLink.bound.b3.y +
                  GridComponent.selectedLink.bound.b4.y) /
                4
              );
            }
          default:
            return;
        }
      case 'points':
        const b = GridComponent.selectedLink.bound;
        return (
          b.b1.x.toString() +
          ',' +
          b.b1.y.toString() +
          ' ' +
          b.b2.x.toString() +
          ',' +
          b.b2.y.toString() +
          ' ' +
          b.b3.x.toString() +
          ',' +
          b.b3.y.toString() +
          ' ' +
          b.b4.x.toString() +
          ',' +
          b.b4.y.toString()
        );
      default:
        return;
    }
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
    return AnimationBarComponent.showIdTags;
  }

  showCoMTags() {
    return AnimationBarComponent.showCoMTags;
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
    if ($event.keyCode == 13) {
      GridComponent.sendNotification(
        'You pressed the "Enter" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }

    if ($event.keyCode == 27) {
      GridComponent.sendNotification(
        'You pressed the "Escape" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }

    if ($event.keyCode == 46) {
      GridComponent.sendNotification(
        'You pressed the "Delete" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
    }

    if ($event.keyCode == 32) {
      GridComponent.sendNotification(
        'You pressed the "space" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      );
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
