import {AfterViewInit, Component, OnInit} from '@angular/core';
import {Coord} from "./coord/coord";
import {AppConstants} from "./app-constants/app-constants";
import {Joint} from "../../model/joint";
import {Link, Shape} from "../../model/link";
import {Force} from "../../model/force";


// The possible states the program could be in.
enum gridStates {
  waiting,
  creating,
  moving,
  panning,
  editing, // TODO: Is this used?
}

enum jointStates {
  waiting,
  creating,
  moving, // TODO: I think use this function?
  panning,
}

enum linkStates {
  waiting,
  creating,
  moving,
}

enum forceStates {
  waiting,
  creating,
  moving,
  panning,
  editing,
}


enum shapeEditModes {
  move,
  resize
}

enum createModes {
  link,
  force
}

enum moveModes {
  joint,
  forceEndpoint,
  threePosition,
  pathPoint
}

@Component({
  selector: 'app-grid',
  templateUrl: './grid.component.html',
  styleUrls: ['./grid.component.css'],
})

export class GridComponent implements OnInit, AfterViewInit {

  // private static jointArray: Joint[];
  // private static linkArray: Link[];
  // private static forceArray: Force[];
  joints: Joint[] = [];
  links: Link[] = [];
  forces: Force[] = [];

  // holders
  private static canvasSVGElement: SVGElement; // Reference to the SVG canvas (coordinate grid)
  private static transformMatrixGridSVGElement: SVGElement;
  private static transformMatrixSVG: SVGElement;
  private static linkageHolderSVG: SVGElement;
  private static pathsHolderSVG: SVGElement;
  private static pathsPathPointHolderSVG: SVGElement;
  private static forcesHolderSVG: SVGElement;
  private static jointLinkForceTagHolderSVG: SVGElement;
  private static comTagHolderSVG: SVGElement;
  private static pathPointHolderSVG: SVGElement;
  private static threePositionHolderSVG: SVGElement;
  private static tempHolderSVG: SVGElement;

  private static contextMenuAddLinkOntoGridSVG: SVGElement;
  private static contextMenuAddLinkOntoJointSVG: SVGElement;
  private static contextMenuAddGroundSVG: SVGElement;
  private static contextMenuAddSliderSVG: SVGElement;
  private static contextMenuDeleteJointSVG: SVGElement;
  private static contextMenuAddLinkOntoLink: SVGElement;
  private static contextMenuAddTracerPointSVG: SVGElement;
  private static contextMenuAddForce: SVGElement;
  private static contextMenuEditShape: SVGElement;
  private static contextMenuDeleteLink: SVGElement;
  private static contextMenuChangeForceDirection: SVGElement;
  private static contextMenuChangeForceLocal: SVGElement;
  private static contextMenuDeleteForce: SVGElement;
  // Edit shape, delete link, add force


  private static gridStates: gridStates;
  private static jointStates: jointStates;
  private static linkStates: linkStates;
  private static forceStates: forceStates;
  private static moveModes: moveModes;
  private static scaleFactor = 1;

  private static panOffset = {
    x: 0,
    y: 0
  };
  private static gridOffset = {
    x: 0,
    y: 0
  };

  // remove this if this is possible
  private static selectedJoint: Joint;
  private static selectedLink: Link;
  private static selectedForce: Force;


  constructor() { }

  ngOnInit(): void {
  }
  ngAfterViewInit() {
    GridComponent.gridStates = gridStates.waiting;
    GridComponent.jointStates = jointStates.waiting;
    GridComponent.linkStates = linkStates.waiting;
    GridComponent.forceStates = forceStates.waiting;
    // See later if we can have the style.display = 'none' to be set within html instead of here
    GridComponent.transformMatrixSVG = document.getElementById('transformMatrix') as unknown as SVGElement;
    GridComponent.transformMatrixGridSVGElement = document.getElementById('transformMatrixGrid') as unknown as SVGElement;
    GridComponent.linkageHolderSVG = document.getElementById('linkageHolder') as unknown as SVGElement;
    GridComponent.pathsHolderSVG = document.getElementById('pathsHolder') as unknown as SVGElement;
    GridComponent.pathsPathPointHolderSVG = document.getElementById('pathsPathPointHolder') as unknown as SVGElement;
    GridComponent.forcesHolderSVG = document.getElementById('forcesHolder') as unknown as SVGElement;
    GridComponent.jointLinkForceTagHolderSVG = document.getElementById('jointLinkForcesTagHolder') as unknown as SVGElement;
    GridComponent.comTagHolderSVG = document.getElementById('comTagHolder') as unknown as SVGElement;
    GridComponent.pathPointHolderSVG = document.getElementById('pathPointHolder') as unknown as SVGElement;
    GridComponent.threePositionHolderSVG = document.getElementById('threePositionHolder') as unknown as SVGElement;
    GridComponent.tempHolderSVG = document.getElementById('tempHolder') as unknown as SVGElement;
    GridComponent.tempHolderSVG.style.display = 'none';
    GridComponent.canvasSVGElement = document.getElementById('canvas') as unknown as SVGElement;


    GridComponent.contextMenuAddLinkOntoGridSVG = document.getElementById('menuEntryAddLinkOnGrid') as unknown as SVGElement;
    GridComponent.contextMenuAddLinkOntoGridSVG.style.display = 'none';

    GridComponent.contextMenuAddGroundSVG = document.getElementById('menuEntryCreateGround') as unknown as SVGElement;
    GridComponent.contextMenuAddGroundSVG.style.display = 'none';
    GridComponent.contextMenuAddSliderSVG = document.getElementById('menuEntryCreateSlider') as unknown as SVGElement;
    GridComponent.contextMenuAddSliderSVG.style.display = 'none';
    GridComponent.contextMenuDeleteJointSVG = document.getElementById('menuEntryDeleteJoint') as unknown as SVGElement;
    GridComponent.contextMenuDeleteJointSVG.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoJointSVG = document.getElementById('menuEntryAddLinkOnJoint') as unknown as SVGElement;
    GridComponent.contextMenuAddLinkOntoJointSVG.style.display = 'none';

    GridComponent.contextMenuAddLinkOntoLink = document.getElementById('menuEntryAddLinkOnLink') as unknown as SVGElement;
    GridComponent.contextMenuAddLinkOntoLink.style.display = 'none';
    GridComponent.contextMenuAddTracerPointSVG = document.getElementById('menuEntryAddTracerPoint') as unknown as SVGElement;
    GridComponent.contextMenuAddTracerPointSVG.style.display = 'none';
    GridComponent.contextMenuAddForce = document.getElementById('menuEntryAddForce') as unknown as SVGElement;
    GridComponent.contextMenuAddForce.style.display = 'none';
    GridComponent.contextMenuEditShape = document.getElementById('menuEntryEditShape') as unknown as SVGElement;
    GridComponent.contextMenuEditShape.style.display = 'none';
    GridComponent.contextMenuDeleteLink = document.getElementById('menuEntryDeleteLink') as unknown as SVGElement;
    GridComponent.contextMenuDeleteLink.style.display = 'none';

    GridComponent.contextMenuChangeForceDirection = document.getElementById('menuEntryChangeForceDirection') as unknown as SVGElement;
    GridComponent.contextMenuChangeForceDirection.style.display = 'none';
    GridComponent.contextMenuChangeForceLocal = document.getElementById('menuEntryChangeForceLocal') as unknown as SVGElement;
    GridComponent.contextMenuChangeForceLocal.style.display = 'none';
    GridComponent.contextMenuDeleteForce = document.getElementById('menuEntryDeleteForce') as unknown as SVGElement;
    GridComponent.contextMenuDeleteForce.style.display = 'none';

    GridComponent.reset();
  }

  private static screenToGrid(x: number, y: number) {
    const newX = (1 / GridComponent.scaleFactor) * (x - GridComponent.gridOffset.x);
    const newY = -1 * (1 / GridComponent.scaleFactor) * (y - GridComponent.gridOffset.y);
    return new Coord(newX, newY);
  }
  private static gridToScreen(x: number, y: number) {
    const newX = (AppConstants.scaleFactor * x) + GridComponent.gridOffset.x;
    const newY = (AppConstants.scaleFactor * y) + GridComponent.gridOffset.y;
    return new Coord(newX, newY);
  }
  private static zoomPoint(newScale: number, pointX: number, pointY: number) {
    const beforeScaleCoords = this.screenToGrid(pointX, pointY);
    // Prevent zooming in or out too far
    if ((newScale * GridComponent.scaleFactor) < AppConstants.maxZoomOut) {
      GridComponent.scaleFactor = AppConstants.maxZoomOut;
    } else if ((newScale * GridComponent.scaleFactor) > AppConstants.maxZoomIn) {
      GridComponent.scaleFactor = AppConstants.maxZoomIn;
    } else {
      GridComponent.scaleFactor = newScale * GridComponent.scaleFactor;
    }
    const afterScaleCoords = this.screenToGrid(pointX, pointY);
    GridComponent.gridOffset.x = GridComponent.gridOffset.x - (beforeScaleCoords.x - afterScaleCoords.x) * GridComponent.scaleFactor;
    GridComponent.gridOffset.y = GridComponent.gridOffset.y + (beforeScaleCoords.y - afterScaleCoords.y) * GridComponent.scaleFactor;
    GridComponent.applyMatrixToSVG();
  }
  private static applyMatrixToSVG() {
    const offsetX = GridComponent.gridOffset.x;
    const offsetY = GridComponent.gridOffset.y;
    const newMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + GridComponent.scaleFactor + ')';
    const gridMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + GridComponent.scaleFactor * AppConstants.scaleFactor + ')';
    GridComponent.transformMatrixSVG.setAttributeNS(null, 'transform', newMatrix);
    GridComponent.transformMatrixGridSVGElement.setAttributeNS(null, 'transform', gridMatrix);
  }
  private static reset() {
    const box = GridComponent.canvasSVGElement.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    GridComponent.gridOffset.x = (width / 2) * AppConstants.scaleFactor;
    GridComponent.gridOffset.y = (height / 2) * AppConstants.scaleFactor;
    GridComponent.scaleFactor = 1;
    this.zoomPoint(1 / AppConstants.scaleFactor, 0, 0);
    this.applyMatrixToSVG();
  }
  private static panSVG(dx: number, dy: number) {
    const newOffsetX = this.gridOffset.x - dx;
    const newOffsetY = this.gridOffset.y + dy;
    this.gridOffset.x = newOffsetX;
    this.gridOffset.y = newOffsetY;
    this.applyMatrixToSVG();
  }


  private static getMousePosition(e: MouseEvent) {
    const svg = GridComponent.canvasSVGElement as SVGGraphicsElement;
    const CTM = svg.getScreenCTM();
    // if (e.touches) { e = e.touches[0]; }
    const box = svg.getBoundingClientRect();
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    if (CTM === null ) { return }
    const newX = GridComponent.roundNumber((e.clientX - CTM.e) / CTM.a, 0);
    let newY = 0;
    // NOTE: CTM.f is the svg.ClientHeight + height of rest of elements. In Firefox, clientHeight does not work (returns 0) so we need to
    // manually detect and add it.
    if (svg.clientHeight === 0) {
      newY = GridComponent.roundNumber((e.clientY - (CTM.f + height)) / -Math.abs(CTM.d), 0);
    } else {
      newY = GridComponent.roundNumber((e.clientY - CTM.f) / -Math.abs(CTM.d), 0);
    }
    // NOTE: The CTM returns different values per browser. In Firefox & Safari it is 1 and in Chrome/Edge it is -1.
    // By putting a -Math.Abs() to it we are standardizing it at -1
    return new Coord(newX, newY);
  }

  private static roundNumber(num: number, scale: number): number {
    const tens = Math.pow(10, scale);
    return Math.round(num * tens) / tens;
  }

  scrollGrid($event: WheelEvent) {
    $event.preventDefault();
    $event.stopPropagation();
    // GridComponent.hideMenu.emit(true); // Hide the context menu
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
      return
    }
    const x = rawSVGCoords.x;
    const y = rawSVGCoords.y * -1;
    GridComponent.zoomPoint(wheelAmount, x, y);
  }
  mouseDown($event: MouseEvent, typeChosen: string, thing?: any) {
    $event.preventDefault();
    $event.stopPropagation();
    const rawCoords = GridComponent.getMousePosition($event);
    if (rawCoords === undefined) {
      return
    }
    const trueCoords = GridComponent.screenToGrid(rawCoords.x, rawCoords.y);
    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        switch (typeChosen) {
          case 'grid':
            switch (GridComponent.gridStates) {
              case gridStates.panning:
                break;
              case gridStates.waiting:
                const mPos = GridComponent.getMousePosition($event);
                if (mPos === undefined) {
                  return
                }
                GridComponent.panOffset.x = mPos.x;
                GridComponent.panOffset.y = mPos.y;
                GridComponent.gridStates = gridStates.panning;
                break;
              case gridStates.creating:
                if (GridComponent.jointStates === jointStates.creating) {
                  const x2 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('x2'));
                  const y2 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('y2'));
                  let lastLetter = '';
                  let joint2ID: string;
                  this.joints.forEach(j => {
                    if (j.id > lastLetter) {
                      lastLetter = j.id;
                    }
                  });
                  joint2ID = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
                  const joint2 = new Joint(joint2ID, x2, y2);
                  const link = new Link(this.joints[0].id + joint2ID, [GridComponent.selectedJoint, joint2]);
                  GridComponent.selectedJoint.links.push(link);
                  joint2.links.push(link);
                  this.joints.push(joint2);
                  this.links.push(link);
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.tempHolderSVG.style.display='none';
                } else if (GridComponent.linkStates === linkStates.creating) {
                  const x1 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('x1'));
                  const y1 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('y1'));
                  const x2 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('x2'));
                  const y2 = Number(GridComponent.tempHolderSVG.children[0].children[0].getAttribute('y2'));
                  let lastLetter = '';
                  let joint1ID: string;
                  let joint2ID: string;
                  this.joints.forEach(j => {
                    if (j.id > lastLetter) {
                      lastLetter = j.id;
                    }
                  });
                  if (lastLetter === '') {
                    joint1ID = 'a';
                    joint2ID = 'b';
                  } else {
                    joint1ID = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
                    joint2ID = String.fromCharCode(joint1ID.charCodeAt(0) + 1);
                  }
                  // const joint1ID = String.fromCharCode(c.charCodeAt(0) + 1);
                  const joint1 = new Joint(joint1ID, x1, y1);
                  const joint2 = new Joint(joint2ID, x2, y2);
                  const link = new Link(joint1ID + joint2ID, [joint1, joint2]);
                  joint1.links.push(link);
                  joint2.links.push(link);
                  this.joints.push(joint1);
                  this.joints.push(joint2);
                  this.links.push(link);
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.linkStates = linkStates.waiting;
                  GridComponent.tempHolderSVG.style.display = 'none';
                } else if (GridComponent.forceStates === forceStates.creating) {
                   let startCoord = new Coord(0, 0);
                   let screenX: number;
                   let screenY: number;
                   if (GridComponent.selectedLink.shape === Shape.line) {
                     screenX = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('x'));
                     screenY = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('y'));
                   } else {
                     screenX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
                     screenY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
                   }
                   startCoord = GridComponent.screenToGrid(screenX, screenY);
                   const endCoordRaw = GridComponent.getMousePosition($event);
                   if (endCoordRaw === undefined) { return }
                   const endCoord = GridComponent.screenToGrid(endCoordRaw.x, endCoordRaw.y * -1);
                  const force = new Force('F' + '1', GridComponent.selectedLink, startCoord, endCoord);
                  this.forces.push(force);
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.forceStates = forceStates.waiting;
                  GridComponent.tempHolderSVG.style.display = 'none';
                }
                // if (that.createMode === createModes.link) {
                //   that.secondJointOnCanvas(trueCoords.x, trueCoords.y);
                //   that.createNewSimulator();
                // } else if (that.createMode === createModes.force) {
                //   that.setForceEndEndpoint(trueCoords.x, trueCoords.y);
                //   that.createNewSimulator();
                //   that.cancelCreation();
                //   that.state = gridStates.waiting;
                // }
                break;
              default:
            }
            break;
          case 'joint':
            switch (GridComponent.jointStates) {
              case jointStates.waiting:
                GridComponent.jointStates = jointStates.panning;
                break;
              case jointStates.panning:
                break;
            }
            break;

          case 'link':
            break;
          case 'force':
            break;
        }
        break;
      case 1: // Middle-Click
        return;
      case 2: // Right-Click
        break;
      default:
        return;
    }
  }
  mouseUp($event: MouseEvent, typeChosen: string, thing?: any) {
    switch (typeChosen) {
      case 'grid':
        switch (GridComponent.gridStates) {
          case gridStates.moving:
            switch (GridComponent.moveModes) {
              case moveModes.joint:
                // GridComponent.endMoveJoint(GridComponent.draggingJoint);
                // that.createNewSimulator();
                break;
              case moveModes.forceEndpoint:
                // if (that.draggingEndpoint.type === ForceEndpointType.start &&
                //   !that.draggingEndpoint.force.link.checkCoordInLink(that.draggingEndpoint)) {
                //   that.draggingEndpoint.relocate(that.initialEndpointCoord.x, that.initialEndpointCoord.y);
                //   that.createNewSimulator();
                // }
                // that.endDragForceEndpoint(that.draggingEndpoint);
                // that.createNewSimulator();
                break;
              case moveModes.pathPoint:
                // that.endMovePathPoint(that.draggingPathPoint);
                break;
              case moveModes.threePosition:
                // that.endMoveThreePosition(that.draggingThreePosition);
                break;
            }
            // if (that.moveMode === moveModes.joint) {
            //   that.endMoveJoint(that.draggingJoint);
            // } else {
            //   if (that.draggingEndpoint.type === ForceEndpointType.start &&
            //     !that.draggingEndpoint.force.link.checkCoordInLink(that.draggingEndpoint)) {
            //     that.draggingEndpoint.relocate(that.initialEndpointCoord.x, that.initialEndpointCoord.y);
            //   }
            //   that.endDragForceEndpoint(that.draggingEndpoint);
            // }
            break;
          case gridStates.panning:
            GridComponent.gridStates = gridStates.waiting;
            break;
          case gridStates.creating:
            break;
          case gridStates.editing:
            GridComponent.gridStates = gridStates.waiting;
            // GridComponent.editingLink.cacheBounds();
            break;
        }
        break;
      case 'joint':
        switch (GridComponent.jointStates) {
          case jointStates.waiting:
            break;
          case jointStates.panning:
            GridComponent.jointStates = jointStates.waiting;
            break;
        }
        break;
      case 'link':
        break;
      case 'force':
        break;
    }
  }
  mouseMove($event: MouseEvent, typeChosen: string, thing?: any) {
    $event.preventDefault();
    $event.stopPropagation();
    const rawCoord = GridComponent.getMousePosition($event);
    if (rawCoord === undefined) { return }
    const trueCoord = GridComponent.screenToGrid(rawCoord.x, -1 * rawCoord.y);

    switch (typeChosen) {
      case 'grid':
        switch (GridComponent.gridStates) {
          case gridStates.moving:
            break;
          case gridStates.panning:
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
          case gridStates.creating:
            if (GridComponent.jointStates === jointStates.creating || GridComponent.linkStates === linkStates.creating) {
              GridComponent.tempHolderSVG.children[0].children[0].setAttribute('x2', trueCoord.x.toString());
              GridComponent.tempHolderSVG.children[0].children[0].setAttribute('y2', trueCoord.y.toString());
            } else if (GridComponent.forceStates === forceStates.creating) {
              this.createForce($event);
              // TODO: Add logic showcasing arrow for force
            }
        }
        break;
      case 'joint':
        const joint = thing as Joint;
        switch (GridComponent.jointStates) {
          case jointStates.panning:
            joint.x = trueCoord.x;
            joint.y = trueCoord.y;
            joint.links.forEach(l => {
              l.bound = Link.getBounds(new Coord(l.joints[0].x, l.joints[0].y), new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
              l.d = Link.getPointsFromBounds(l.bound, l.shape);
            });
            break;
          case jointStates.waiting:
            break;
        }
        break;
      case 'link':
        break;
      case 'force':
        break;
    }
  }

  contextMenu($event: MouseEvent, desiredMenu: string, thing?: any) {
    $event.preventDefault();
    $event.stopPropagation();
    this.disappearContext();
    const offsetX = $event.clientX;
    const offsetY = $event.clientY;

    switch (desiredMenu) {
      case 'grid':
        // this.menu.nativeElement.style.display = 'block';
        GridComponent.contextMenuAddLinkOntoGridSVG.style.display = 'block';
        GridComponent.contextMenuAddLinkOntoGridSVG.children[0].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuAddLinkOntoGridSVG.children[0].setAttribute('y', offsetY.toString());
        GridComponent.contextMenuAddLinkOntoGridSVG.children[1].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuAddLinkOntoGridSVG.children[1].setAttribute('y', offsetY.toString());
        break;
      case 'joint':
        const joint = thing;
        GridComponent.selectedJoint = joint;
        if (joint.links.length === 2) {
          GridComponent.contextMenuDeleteJointSVG.style.display = 'block';
          GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuDeleteJointSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteJointSVG.children[1].setAttribute('y', (offsetY + 15).toString());
        } else {
          GridComponent.contextMenuAddLinkOntoJointSVG.style.display = 'block';
          GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[1].setAttribute('y', offsetY.toString());

          GridComponent.contextMenuAddGroundSVG.style.display = 'block';
          GridComponent.contextMenuAddGroundSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddGroundSVG.children[0].setAttribute('y', (offsetY + 20).toString());
          GridComponent.contextMenuAddGroundSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddGroundSVG.children[1].setAttribute('y', (offsetY + 35).toString());

          GridComponent.contextMenuAddSliderSVG.style.display = 'block';
          GridComponent.contextMenuAddSliderSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddSliderSVG.children[0].setAttribute('y', (offsetY + 40).toString());
          GridComponent.contextMenuAddSliderSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddSliderSVG.children[1].setAttribute('y', (offsetY + 55).toString());

          GridComponent.contextMenuDeleteJointSVG.style.display = 'block';
          GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('y', (offsetY + 60).toString());
          GridComponent.contextMenuDeleteJointSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteJointSVG.children[1].setAttribute('y', (offsetY + 75).toString());
        }
        break;
      case 'link':
        const link = thing;
        GridComponent.selectedLink = link;
        if (link.shape === Shape.line) {
          GridComponent.contextMenuAddForce.style.display = 'block';
          GridComponent.contextMenuAddForce.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddForce.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuAddForce.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddForce.children[1].setAttribute('y', (offsetY + 15).toString());

          GridComponent.contextMenuEditShape.style.display = 'block';
          GridComponent.contextMenuEditShape.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuEditShape.children[0].setAttribute('y', (offsetY + 20).toString());
          GridComponent.contextMenuEditShape.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuEditShape.children[1].setAttribute('y', (offsetY + 35).toString());

          GridComponent.contextMenuDeleteLink.style.display = 'block';
          GridComponent.contextMenuDeleteLink.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteLink.children[0].setAttribute('y', (offsetY + 40).toString());
          GridComponent.contextMenuDeleteLink.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteLink.children[1].setAttribute('y', (offsetY + 55).toString());
        } else {
          GridComponent.contextMenuAddLinkOntoLink.style.display = 'block';
          GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddLinkOntoJointSVG.children[1].setAttribute('y', offsetY.toString());

          GridComponent.contextMenuAddTracerPointSVG.style.display = 'block';
          GridComponent.contextMenuAddTracerPointSVG.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddTracerPointSVG.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuAddTracerPointSVG.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddTracerPointSVG.children[1].setAttribute('y', offsetY.toString());

          GridComponent.contextMenuAddForce.style.display = 'block';
          GridComponent.contextMenuAddForce.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddForce.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuAddForce.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuAddForce.children[1].setAttribute('y', offsetY.toString());

          GridComponent.contextMenuEditShape.style.display = 'block';
          GridComponent.contextMenuEditShape.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuEditShape.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuEditShape.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuEditShape.children[1].setAttribute('y', offsetY.toString());

          GridComponent.contextMenuDeleteLink.style.display = 'block';
          GridComponent.contextMenuDeleteLink.children[0].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteLink.children[0].setAttribute('y', offsetY.toString());
          GridComponent.contextMenuDeleteLink.children[1].setAttribute('x', offsetX.toString());
          GridComponent.contextMenuDeleteLink.children[1].setAttribute('y', offsetY.toString());
        }
        break;
      case 'force':
        const force = thing;
        GridComponent.selectedForce = force;
        GridComponent.contextMenuChangeForceDirection.style.display = 'block';
        GridComponent.contextMenuChangeForceDirection.children[0].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuChangeForceDirection.children[0].setAttribute('y', offsetY.toString());
        GridComponent.contextMenuChangeForceDirection.children[1].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuChangeForceDirection.children[1].setAttribute('y', offsetY.toString());

        GridComponent.contextMenuChangeForceLocal.style.display = 'block';
        GridComponent.contextMenuChangeForceLocal.children[0].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuChangeForceLocal.children[0].setAttribute('y', (offsetY + 20).toString());
        GridComponent.contextMenuChangeForceLocal.children[1].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuChangeForceLocal.children[1].setAttribute('y', (offsetY + 20).toString());

        GridComponent.contextMenuDeleteForce.style.display = 'block';
        GridComponent.contextMenuDeleteForce.children[0].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuDeleteForce.children[0].setAttribute('y', (offsetY + 40).toString());
        GridComponent.contextMenuDeleteForce.children[1].setAttribute('x', offsetX.toString());
        GridComponent.contextMenuDeleteForce.children[1].setAttribute('y', (offsetY + 40).toString());
        break;
    }
  }

  disappearContext() {
    GridComponent.contextMenuAddLinkOntoGridSVG.style.display = 'none';
    GridComponent.contextMenuAddGroundSVG.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoJointSVG.style.display = 'none';
    GridComponent.contextMenuAddSliderSVG.style.display = 'none';
    GridComponent.contextMenuDeleteJointSVG.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoLink.style.display = 'none';
    GridComponent.contextMenuAddForce.style.display = 'none';
    GridComponent.contextMenuAddTracerPointSVG.style.display = 'none';
    GridComponent.contextMenuEditShape.style.display = 'none';
    GridComponent.contextMenuDeleteLink.style.display = 'none';
    GridComponent.contextMenuChangeForceDirection.style.display = 'none';
    GridComponent.contextMenuChangeForceLocal.style.display = 'none';
    GridComponent.contextMenuDeleteForce.style.display = 'none';
  }

  addJoint() {
    this.disappearContext();
    const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
    const newJoint = new Joint('a', coord.x, coord.y);
    this.joints.push(newJoint);
  }

  createGround() {
    this.disappearContext();
    GridComponent.selectedJoint.ground = !GridComponent.selectedJoint.ground;
  }

  createSlider($event: MouseEvent) {
    this.disappearContext();
    GridComponent.selectedJoint.type = 'P';
  }

  deleteJoint($event: MouseEvent) {
    this.disappearContext();
    const jointIndex = this.joints.findIndex(jt => jt.id === GridComponent.selectedJoint.id);
    // TODO: Check later to see if deleting joints also deletes links. Check when links are created
    GridComponent.selectedJoint.links.forEach(l => {
      if (l.joints.length < 3) {
        for (let curJointIndex = 0; jointIndex < l.joints.length; curJointIndex++) {
          const cur_joint = l.joints[curJointIndex];
          const curLinkIndex = l.joints[curJointIndex].links[0].id === l.id ? 0 : 1;
          cur_joint.links.splice(curLinkIndex, 1);
        }
        const linkIndex = this.links.findIndex(li => li.id === l.id);
        this.links.splice(linkIndex, 1);
      }
    });
    this.joints.splice(jointIndex, 1);
    // const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    // const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    // const coord = GridComponent.screenToGrid(screenX, screenY);
  }

  createLink($event: MouseEvent, gridOrJoint: string) {
    this.disappearContext();
    let startX: number;
    let startY: number;
    let startCoord = new Coord(0, 0);
    switch (gridOrJoint) {
      case 'grid':
        startX = Number(GridComponent.contextMenuAddLinkOntoGridSVG.children[0].getAttribute('x'));
        startY = Number(GridComponent.contextMenuAddLinkOntoGridSVG.children[0].getAttribute('y'));
        startCoord = GridComponent.screenToGrid(startX, startY);
        GridComponent.linkStates = linkStates.creating;
        break;
      case 'joint':
        startCoord.x = GridComponent.selectedJoint.x;
        startCoord.y = GridComponent.selectedJoint.y;
        GridComponent.jointStates = jointStates.creating;
        break;
      default:
        return;
    }
    const mouseRawPos = GridComponent.getMousePosition($event);
    if (mouseRawPos === undefined) { return }
    const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('x1', startCoord.x.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('y1', startCoord.y.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('x2', mousePos.x.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('y2', mousePos.y.toString());
    GridComponent.tempHolderSVG.children[0].children[1].setAttribute('x', startCoord.x.toString());
    GridComponent.tempHolderSVG.children[0].children[1].setAttribute('y', startCoord.y.toString());
    GridComponent.gridStates = gridStates.creating;
    GridComponent.tempHolderSVG.style.display = 'block';
  }

  RectMouseOver($event: MouseEvent, menuType: string) {
    switch (menuType) {
      case 'grid':
        GridComponent.contextMenuAddLinkOntoGridSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addLink':
        GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addGround':
        GridComponent.contextMenuAddGroundSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addSlider':
        GridComponent.contextMenuAddSliderSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'deleteJoint':
        GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addForce':
        GridComponent.contextMenuAddForce.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addTracer':
        GridComponent.contextMenuAddTracerPointSVG.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'editShape':
        GridComponent.contextMenuEditShape.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'deleteLink':
        GridComponent.contextMenuDeleteLink.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'changeForceDirection':
        GridComponent.contextMenuChangeForceDirection.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'changeForceLocal':
        GridComponent.contextMenuChangeForceLocal.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'deleteForce':
        GridComponent.contextMenuDeleteForce.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
    }
  }

  RectMouseOut($event: MouseEvent, menuType: string) {
    switch (menuType) {
      case 'grid':
        GridComponent.contextMenuAddLinkOntoGridSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addLink':
        GridComponent.contextMenuAddLinkOntoJointSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addGround':
        GridComponent.contextMenuAddGroundSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addSlider':
        GridComponent.contextMenuAddSliderSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'deleteJoint':
        GridComponent.contextMenuDeleteJointSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addForce':
        GridComponent.contextMenuAddForce.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addTracer':
        GridComponent.contextMenuAddTracerPointSVG.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'editShape':
        GridComponent.contextMenuEditShape.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'deleteLink':
        GridComponent.contextMenuDeleteLink.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'changeForceDirection':
        GridComponent.contextMenuChangeForceDirection.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'changeForceLocal':
        GridComponent.contextMenuChangeForceLocal.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'deleteForce':
        GridComponent.contextMenuDeleteForce.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
    }
  }

  createForce($event: MouseEvent) {
    this.disappearContext();
    let startCoord: Coord;
    if (GridComponent.selectedLink.shape === Shape.line) {
      const screenX = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('x'));
      const screenY = Number(GridComponent.contextMenuAddForce.children[0].getAttribute('y'));
      startCoord = GridComponent.screenToGrid(screenX, screenY);
    } else {
      const screenX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
      const screenY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
      startCoord = GridComponent.screenToGrid(screenX, screenY);
    }
    const mouseRawPos = GridComponent.getMousePosition($event);
    if (mouseRawPos === undefined) { return }
    const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    // `M ${startX} ${startY} L ${endX} ${endY} Z`;
    GridComponent.tempHolderSVG.children[1].children[0].setAttribute('d',
      'M ' + startCoord.x.toString() + ' ' + startCoord.y.toString() + ' L '
      + mousePos.x.toString() + ' ' + mousePos.y.toString() + ' Z');

    // triangle (pointer) of the arrow
    const angle = Math.atan2(mousePos.y - startCoord.y, mousePos.x - startCoord.x);
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;
    const triLen = 12 * AppConstants.scaleFactor;
    const dx1 = Math.cos(a1) * triLen;
    const dy1 = Math.sin(a1) * triLen;
    const dx2 = Math.cos(a2) * triLen;
    const dy2 = Math.sin(a2) * triLen;

    // const triString = `M ${endX} ${endY} L ${endX - dx1} ${endY - dy1} L ${endX - dx2} ${endY - dy2} Z`;
    GridComponent.tempHolderSVG.children[1].children[1].setAttribute('d',
    'M ' + mousePos.x.toString() + ' ' + mousePos.y.toString() +
      ' L ' + (mousePos.x - dx1).toString() + ' ' + (mousePos.y - dy1).toString() +
      ' L ' + (mousePos.x - dx2).toString() + ' ' + (mousePos.y - dy2).toString() + ' Z');
    GridComponent.forceStates = forceStates.creating;
    GridComponent.gridStates = gridStates.creating;
    GridComponent.tempHolderSVG.style.display = 'block';
  }

  editShape() {
    this.disappearContext();
  }

  deleteLink($event: MouseEvent) {
    this.disappearContext();
    const linkIndex = this.links.findIndex(l => l.id === GridComponent.selectedLink.id);
    this.links.splice(linkIndex, 1);
  }

  changeForceDirection($event: MouseEvent) {

  }

  changeForceLocal($event: MouseEvent) {

  }

  deleteForce($event: MouseEvent) {

  }
}
