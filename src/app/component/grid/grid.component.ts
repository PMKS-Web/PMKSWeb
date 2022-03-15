import {Component, OnInit, AfterViewInit, ViewChild, ElementRef} from '@angular/core';
import {Coord} from "./coord/coord";
import {AppConstants} from "./app-constants/app-constants";
import {Joint} from "../../model/joint";
import {switchMapTo} from "rxjs";
import {core} from "@angular/compiler";
import {Link} from "../../model/link";


// The possible states the program could be in.
enum gridStates {
  init,
  waiting,
  creating,
  moving,
  panning,
  zooming,
  editing,
  processing
}

enum jointStates {
  init,
  waiting,
  creating,
  moving,
  panning,
  zooming,
  editing,
  processing
}

enum linkStates {
  init,
  waiting,
  creating,
  moving,
  panning,
  zooming,
  editing,
  processing
}

enum forceStates {
  init,
  waiting,
  creating,
  moving,
  panning,
  zooming,
  editing,
  processing
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
  private static contextMenuAddSliderSVG: SVGElement
  private static contextMenuDeleteJointSVG: SVGElement
  private static contextMenuAddTracerPointSVG: SVGElement


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
  // private static selectedForce: Force;


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
    // GridComponent.contextMenuAddTracerPointSVG = document.getElementById('') as unknown as SVGElement;
    // GridComponent.contextMenuAddTracerJointSVG.style.display = 'none'

    GridComponent.reset();
    // GridComponent.jointArray = [];
  }

  private static screenToGrid(x: number, y: number) {
    const newX = (1 / GridComponent.scaleFactor) * (x - GridComponent.gridOffset.x);
    // const newY = (1 / GridComponent.scaleFactor) * (y + GridComponent.gridOffset.y);
    const newY = -1 * (1 / GridComponent.scaleFactor) * (y - GridComponent.gridOffset.y);
    return new Coord(newX, newY);
  }
  private static gridToScreen(x: number, y: number) {
    // This is correct logic
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

  // private static updateXYPos(x: number, y: number) {
  //   const xPos = document.getElementById('xPos');
  //   const yPos = document.getElementById('yPos');
  //   if (xPos && yPos) {
  //     xPos.innerText = GridComponent.roundNumber(x, 0).toString();
  //     yPos.innerText = GridComponent.roundNumber(y, 0).toString();
  //   }
  // }

  private static panCanvas(x: number, y: number) {
    const offsetX = this.panOffset.x - x;
    const offsetY = this.panOffset.y - y;
    this.panOffset.x = x;
    this.panOffset.y = y;
    const box = GridComponent.canvasSVGElement.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    let correctedPan = false;
    // Cause panning outside the defined area to pan the user back in.
    if (GridComponent.screenToGrid(offsetX, 0).x < -100) {
      GridComponent.panSVG(Math.abs(offsetX), 0);
      correctedPan = true;
    }
    if (this.screenToGrid(width + offsetX, 0).x > 100) {
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
                  GridComponent.tempHolderSVG.style.display='none';
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
                // const mPos = GridComponent.getMousePosition($event);
                // if (mPos === undefined) {
                //   return
                // }
                // GridComponent.panOffset.x = mPos.x;
                // GridComponent.panOffset.y = mPos.y;
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
          // case gridStates.moving:
          //   switch (GridComponent.moveMode) {
          //     case moveModes.joint:
          //       GridComponent.dragJoint(e, GridComponent.draggingJoint);
          //       break;
          //     case moveModes.forceEndpoint:
          //       GridComponent.dragForceEndpoint(e, that.draggingEndpoint);
          //       GridComponent.createNewSimulator();
          //       break;
          //     case moveModes.pathPoint:
          //       GridComponent.dragPathPoint(e, GridComponent.draggingPathPoint);
          //       break;
          //     case moveModes.threePosition:
          //       GridComponent.dragThreePosition(e, GridComponent.draggingThreePosition);
          //       break;
          //   }
          //   break;
          // case gridStates.editing:
          //   if (GridComponent.editingMode === shapeEditModes.move) {
          //     const delta = {
          //       x: trueCoord.x - GridComponent.initialMouseCoord.x,
          //       y: trueCoord.y - GridComponent.initialMouseCoord.y
          //     };
          //     GridComponent.editingLink.drag(delta);
          //     // TODO: wonder how to do this in better way...
          //     // that.editingLink.idTag.setAttributeNS(undefined, 'x', '0');
          //     // that.editingLink.idTag.setAttributeNS(undefined, 'y', '0');
          //   } else if (GridComponent.editingMode === shapeEditModes.resize) {
          //     GridComponent.editingLink.tryNewBound(trueCoord, GridComponent.editingDot);
          //   }
          //   break;

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
              // TODO: Add a line showcasing force
            }
          // case gridStates.creating:
          //   if (GridComponent.createMode === createModes.link) {
          //     const line = GridComponent.tempLink;
          //     if (!line) { break; }
          //     line.setAttribute('x2', `${trueCoord.x}`);
          //     line.setAttribute('y2', `${trueCoord.y}`);
          //   } else if (GridComponent.createMode === createModes.force) {
          //     const startX = parseFloat(GridComponent.tempForceEndpoint.getAttribute('x'));
          //     const startY = parseFloat(GridComponent.tempForceEndpoint.getAttribute('y'));
          //     GridComponent.updateArrow(GridComponent.tempForce, startX, startY, trueCoord.x, trueCoord.y);
          //   }
          //   break;
        }
        break;
      case 'joint':
        const joint = thing;
        switch (GridComponent.jointStates) {
          case jointStates.panning:
            joint.x = trueCoord.x;
            joint.y = trueCoord.y;
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
    this.disappearContext($event);
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
        break;
      case 'force':
        break;
    }
  }

  disappearContext($event: MouseEvent) {
    GridComponent.contextMenuAddLinkOntoGridSVG.style.display = 'none';
    GridComponent.contextMenuAddGroundSVG.style.display = 'none';
    GridComponent.contextMenuAddLinkOntoJointSVG.style.display = 'none';
    GridComponent.contextMenuAddSliderSVG.style.display = 'none';
    GridComponent.contextMenuDeleteJointSVG.style.display = 'none';
  }

  addJoint($event: MouseEvent) {
    this.disappearContext($event);
    const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
    const newJoint = new Joint('a', coord.x, coord.y);
    this.joints.push(newJoint);
  }

  createGround($event: MouseEvent) {
    this.disappearContext($event);
    const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
  }

  createSlider($event: MouseEvent) {
    this.disappearContext($event);
    const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
  }

  deleteJoint($event: MouseEvent) {
    this.disappearContext($event);
    const screenX = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPointSVG.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
  }

  createLink($event: MouseEvent, gridOrJoint: string) {
    this.disappearContext($event);
    let screenX: number;
    let screenY: number;
    let coord = new Coord(0, 0);
    switch (gridOrJoint) {
      case 'grid':
        screenX = Number(GridComponent.contextMenuAddLinkOntoGridSVG.children[0].getAttribute('x'));
        screenY = Number(GridComponent.contextMenuAddLinkOntoGridSVG.children[0].getAttribute('y'));
        GridComponent.linkStates = linkStates.creating;
        coord = GridComponent.screenToGrid(screenX, screenY);
        break;
      case 'joint':
        coord.x = GridComponent.selectedJoint.x;
        coord.y = GridComponent.selectedJoint.y;
        GridComponent.jointStates = jointStates.creating;
        break;
      default:
        return;
    }
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('x1', coord.x.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('y1', coord.y.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('x2', coord.x.toString());
    GridComponent.tempHolderSVG.children[0].children[0].setAttribute('y2', coord.y.toString());
    GridComponent.tempHolderSVG.children[0].children[1].setAttribute('x', coord.x.toString());
    GridComponent.tempHolderSVG.children[0].children[1].setAttribute('y', coord.y.toString());
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
      case 'link':
        break;
      case 'force':
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
      case 'link':
        break;
      case 'force':
        break;
    }
  }
}
