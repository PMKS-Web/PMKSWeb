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
}

enum forceStates {
  waiting,
  creating,
  dragging,
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
  private static jointTempHolderSVG: SVGElement;
  private static forceTempHolderSVG: SVGElement;

  private static contextMenuAddLinkOntoGrid: SVGElement;

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

  private static gridStates: gridStates = gridStates.waiting;
  private static jointStates: jointStates = jointStates.waiting;
  private static linkStates: linkStates = linkStates.waiting;
  private static forceStates: forceStates = forceStates.waiting;
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
  private static selectedForceEndPoint: string;


  constructor() { }

  ngOnInit(): void {
  }
  ngAfterViewInit() {
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
    GridComponent.jointTempHolderSVG = document.getElementById('jointTempHolder') as unknown as SVGElement;
    GridComponent.forceTempHolderSVG = document.getElementById('forceTempHolder') as unknown as SVGElement;
    GridComponent.canvasSVGElement = document.getElementById('canvas') as unknown as SVGElement;

    // context Menu for Grid
    GridComponent.contextMenuAddLinkOntoGrid = document.getElementById('menuEntryAddLinkOnGrid') as unknown as SVGElement;
    // context Menu for Joint
    GridComponent.contextMenuAddGround = document.getElementById('menuEntryCreateGround') as unknown as SVGElement;
    GridComponent.contextMenuAddSlider = document.getElementById('menuEntryCreateSlider') as unknown as SVGElement;
    GridComponent.contextMenuDeleteJoint = document.getElementById('menuEntryDeleteJoint') as unknown as SVGElement;
    GridComponent.contextMenuAddLinkOntoJoint = document.getElementById('menuEntryAddLinkOnJoint') as unknown as SVGElement;
    // context Menu for Link
    GridComponent.contextMenuAddLinkOntoLink = document.getElementById('menuEntryAddLinkOnLink') as unknown as SVGElement;
    GridComponent.contextMenuAddTracerPoint = document.getElementById('menuEntryAddTracerPoint') as unknown as SVGElement;
    GridComponent.contextMenuAddForce = document.getElementById('menuEntryAddForce') as unknown as SVGElement;
    GridComponent.contextMenuEditShape = document.getElementById('menuEntryEditShape') as unknown as SVGElement;
    GridComponent.contextMenuDeleteLink = document.getElementById('menuEntryDeleteLink') as unknown as SVGElement;
    // context Menu for Force
    GridComponent.contextMenuChangeForceDirection = document.getElementById('menuEntryChangeForceDirection') as unknown as SVGElement;
    GridComponent.contextMenuChangeForceLocal = document.getElementById('menuEntryChangeForceLocal') as unknown as SVGElement;
    GridComponent.contextMenuDeleteForce = document.getElementById('menuEntryDeleteForce') as unknown as SVGElement;

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
  // TODO: Once the Grid Toolbar (Animation Bar) is created, reuse this function
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
    // const width = box.right - box.left;
    const height = box.bottom - box.top;
    if (CTM === null ) { return }
    const newX = GridComponent.roundNumber((e.clientX - CTM.e) / CTM.a, 0);
    let newY: number;
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
    GridComponent.zoomPoint(wheelAmount, rawSVGCoords.x, rawSVGCoords.y * -1);
  }
  mouseDown($event: MouseEvent, typeChosen: string, thing?: any, forcePoint?: string) {
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
              case gridStates.waiting:
                const mPos = GridComponent.getMousePosition($event);
                if (mPos === undefined) {
                  return
                }
                GridComponent.panOffset.x = mPos.x;
                GridComponent.panOffset.y = mPos.y;
                GridComponent.gridStates = gridStates.dragging;
                break;
              case gridStates.creating:
                if (GridComponent.jointStates === jointStates.creating) {
                  const x2 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2'));
                  const y2 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2'));
                  let lastLetter = '';
                  let joint2ID: string;
                  this.joints.forEach(j => {
                    if (j.id > lastLetter) {
                      lastLetter = j.id;
                    }
                  });
                  joint2ID = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
                  const joint2 = new Joint(joint2ID, this.roundNumber(x2, 3), this.roundNumber(y2, 3));
                  const link = new Link(GridComponent.selectedJoint.id + joint2.id, [GridComponent.selectedJoint, joint2]);
                  GridComponent.selectedJoint.links.push(link);
                  GridComponent.selectedJoint.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(GridComponent.selectedJoint);
                  joint2.links.push(link);
                  this.joints.push(joint2);
                  this.links.push(link);
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display='none';
                } else if (GridComponent.linkStates === linkStates.creating) {
                  const x1 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x1'));
                  const y1 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y1'));
                  const x2 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2'));
                  const y2 = Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2'));
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
                  const joint1 = new Joint(joint1ID, this.roundNumber(x1, 3), this.roundNumber(y1, 3));
                  const joint2 = new Joint(joint2ID, this.roundNumber(x2, 3), this.roundNumber(y2, 3));
                  const link = new Link(joint1ID + joint2ID, [joint1, joint2]);
                  joint1.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(joint1);
                  joint1.links.push(link);
                  joint2.links.push(link);
                  this.joints.push(joint1);
                  this.joints.push(joint2);
                  this.links.push(link);
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.linkStates = linkStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display = 'none';
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
                  GridComponent.selectedLink.forces.push(force)
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.forceStates = forceStates.waiting;
                  GridComponent.forceTempHolderSVG.style.display = 'none';
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
                GridComponent.gridStates = gridStates.dragging;
                GridComponent.jointStates = jointStates.dragging;
                GridComponent.selectedJoint = thing as Joint;
                break;
            }
            break;
          case 'link':
            switch (GridComponent.linkStates) {
              case linkStates.waiting:
                GridComponent.linkStates = linkStates.dragging
                break;
            }
            break;
          case 'force':
            switch (GridComponent.forceStates) {
              case forceStates.waiting:
                if (forcePoint === undefined) { return }
                GridComponent.gridStates = gridStates.dragging;
                GridComponent.forceStates = forceStates.dragging;
                GridComponent.selectedForceEndPoint = forcePoint;
                GridComponent.selectedForce = thing as Force;
            }
            break;
        }
        break;
      case 1: // Middle-Click
        return;
      case 2: // Right-Click
        break;
    }
  }
  mouseUp($event: MouseEvent, typeChosen: string, thing?: any) {
    switch (typeChosen) {
      case 'grid':
        switch (GridComponent.gridStates) {
          case gridStates.creating:
            // TODO: Believe put in logic to update TSL but not yet. Also, set GridComponent.thing = thing.waiting
            switch (GridComponent.moveModes) {
              case moveModes.joint:
                GridComponent.jointStates = jointStates.waiting;
                break;
              case moveModes.forceEndpoint:
                GridComponent.forceStates = forceStates.waiting;
                break;
              case moveModes.pathPoint:
                break;
              case moveModes.threePosition:
                break;
            }
            break;
          case gridStates.dragging:
            switch (GridComponent.moveModes) {
              case moveModes.joint:
                GridComponent.jointStates = jointStates.waiting;
                break;
              case moveModes.forceEndpoint:
                GridComponent.forceStates = forceStates.waiting;
                break;
              case moveModes.pathPoint:
                break;
              case moveModes.threePosition:
                break;
            }
            GridComponent.gridStates = gridStates.waiting;
            break;
        }
        break;
      case 'joint':
        switch (GridComponent.jointStates) {
          case jointStates.dragging:
            GridComponent.jointStates = jointStates.waiting;
            GridComponent.gridStates = gridStates.waiting;
            break;
        }
        break;
      case 'link':
        break;
      case 'force':
        switch (GridComponent.forceStates) {
          case forceStates.dragging:
            GridComponent.forceStates = forceStates.waiting;
            GridComponent.gridStates = gridStates.waiting;
        }
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
          case gridStates.dragging:
            // These conditions are thrown when dragging an object but mouse is on top of the grid
            // TODO: Rather than to have these if, else if, else if, else,
            // TODO: Have the gridStates also include dragGrid, dragJoint, dragLink, and dragForce
            if (GridComponent.jointStates === jointStates.dragging) {
              GridComponent.selectedJoint = GridComponent.dragJoint(GridComponent.selectedJoint, trueCoord);
            } else if (GridComponent.linkStates === linkStates.dragging) { // user is dragging a link
              // TODO: Add logic when dragging a link within edit shape mode
            } else if (GridComponent.forceStates === forceStates.dragging) { // user is dragging a force
              GridComponent.selectedForce = GridComponent.dragForce(GridComponent.selectedForce, trueCoord);
            } else { // user is dragging the grid
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
            }
            break;
          case gridStates.creating:
            if (GridComponent.jointStates === jointStates.creating || GridComponent.linkStates === linkStates.creating) {
              GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
              GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
            } else if (GridComponent.forceStates === forceStates.creating) {
              this.createForce($event);
            }
        }
        break;
      case 'joint':
        let joint = thing as Joint;
        switch (GridComponent.jointStates) {
          case jointStates.dragging:
            joint = GridComponent.dragJoint(joint, trueCoord);
            break;
          case jointStates.waiting:
            break;
        }
        break;
      case 'link':
        // TODO: Have to take into consideration when clicking on a joint and having dragged the joint on top of the link
        break;
      case 'force':
        let force = thing as Force;
        switch (GridComponent.forceStates) {
          case forceStates.dragging:
            force = GridComponent.dragForce(force, trueCoord);
            break;
        }
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
        this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoGrid, offsetX, offsetY, 0, 0);
        break;
      case 'joint':
        const joint = thing;
        GridComponent.selectedJoint = joint;
        if (joint.links.length === 2) {
          this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 0, 15);
        } else {
          this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoJoint, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 35);
          this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 55);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 75);
        }
        break;
      case 'link':
        const link = thing;
        GridComponent.selectedLink = link;
        if (link.shape === Shape.line) {
          this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 0, 15);
          this.showcaseContextMenu(GridComponent.contextMenuEditShape, offsetX, offsetY, 20, 35);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 40, 55);
        } else {
          this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoLink, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuAddTracerPoint, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuEditShape, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 0, 0);
        }
        break;
      case 'force':
        const force = thing;
        GridComponent.selectedForce = force;
        this.showcaseContextMenu(GridComponent.contextMenuChangeForceDirection, offsetX, offsetY, 0, 0);
        this.showcaseContextMenu(GridComponent.contextMenuChangeForceLocal, offsetX, offsetY, 20, 20);
        this.showcaseContextMenu(GridComponent.contextMenuDeleteForce, offsetX, offsetY, 40, 40);
        break;
    }
  }
  showcaseContextMenu(contextMenu: SVGElement, offsetX: number, offsetY: number,
                      boxIncrement: number, textIncrement: number) {
    contextMenu.style.display = 'block'
    contextMenu.children[0].setAttribute('x', offsetX.toString());
    contextMenu.children[0].setAttribute('y', (offsetY + boxIncrement).toString());
    contextMenu.children[1].setAttribute('x', offsetX.toString());
    contextMenu.children[1].setAttribute('y', (offsetY + textIncrement).toString());
  }

  disappearContext() {
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

  addJoint() {
    this.disappearContext();
    const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
    const newJoint = new Joint('a', this.roundNumber(coord.x, 3), this.roundNumber(coord.y, 3));
    this.joints.push(newJoint);
  }

  createGround() {
    this.disappearContext();
    GridComponent.selectedJoint.ground = !GridComponent.selectedJoint.ground;
  }

  createSlider() {
    this.disappearContext();
    // TODO: Sliders are ground joints. However, we prob don't want to showcase ground. So probably need to update this
    // TODO: Within the HTML document
    GridComponent.selectedJoint.type = GridComponent.selectedJoint.type === 'P' ? 'R' : 'P';
  }

  deleteJoint() {
    this.disappearContext();
    const jointIndex = this.joints.findIndex(jt => jt.id === GridComponent.selectedJoint.id);
    GridComponent.selectedJoint.links.forEach(l => {
      // TODO: Fix this logic
      if (l.joints.length < 3) {
        for (let curJointIndex = 0; curJointIndex < l.joints.length; curJointIndex++) {
          const curLinkIndex = l.joints[curJointIndex].links[0].id === l.id ? 0 : 1;
          this.joints[jointIndex].links.splice(curLinkIndex, 1);
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
        startX = Number(GridComponent.contextMenuAddLinkOntoGrid.children[0].getAttribute('x'));
        startY = Number(GridComponent.contextMenuAddLinkOntoGrid.children[0].getAttribute('y'));
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
    // TODO: Within future, create a tempJoint and temp Link and set those values as these values in order to avoid
    // TODO: having to call setAttribute and have HTML update for you automatically
    GridComponent.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', mousePos.x.toString());
    GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', mousePos.y.toString());
    GridComponent.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    GridComponent.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    GridComponent.gridStates = gridStates.creating;
    GridComponent.jointTempHolderSVG.style.display = 'block';
  }

  RectMouseOver($event: MouseEvent, menuType: string) {
    switch (menuType) {
      case 'grid':
        GridComponent.contextMenuAddLinkOntoGrid.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addLink':
        GridComponent.contextMenuAddLinkOntoJoint.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addGround':
        GridComponent.contextMenuAddGround.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addSlider':
        GridComponent.contextMenuAddSlider.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'deleteJoint':
        GridComponent.contextMenuDeleteJoint.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addForce':
        GridComponent.contextMenuAddForce.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
      case 'addTracer':
        GridComponent.contextMenuAddTracerPoint.children[0].setAttribute('style',
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
        GridComponent.contextMenuAddLinkOntoGrid.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addLink':
        GridComponent.contextMenuAddLinkOntoJoint.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addGround':
        GridComponent.contextMenuAddGround.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addSlider':
        GridComponent.contextMenuAddSlider.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'deleteJoint':
        GridComponent.contextMenuDeleteJoint.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addForce':
        GridComponent.contextMenuAddForce.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
      case 'addTracer':
        GridComponent.contextMenuAddTracerPoint.children[0].setAttribute('style',
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
    GridComponent.forceTempHolderSVG.children[0].setAttribute('d', Force.createForceLine(startCoord, mousePos));
    GridComponent.forceTempHolderSVG.children[1].setAttribute('d', Force.createForceArrow(startCoord, mousePos));
    GridComponent.forceStates = forceStates.creating;
    GridComponent.gridStates = gridStates.creating;
    GridComponent.forceTempHolderSVG.style.display = 'block';
  }

  editShape() {
    this.disappearContext();
  }

  deleteLink() {
    this.disappearContext();
    const linkIndex = this.links.findIndex(l => l.id === GridComponent.selectedLink.id);
    this.links.splice(linkIndex, 1);
  }

  changeForceDirection() {
    this.disappearContext();
    GridComponent.selectedForce.arrowOutward = !GridComponent.selectedForce.arrowOutward;
    if (GridComponent.selectedForce.arrowOutward) {
      GridComponent.selectedForce.forceArrow = Force.createForceArrow(
        GridComponent.selectedForce.startCoord, GridComponent.selectedForce.endCoord);
    } else {
      GridComponent.selectedForce.forceArrow = Force.createForceArrow(
        GridComponent.selectedForce.endCoord, GridComponent.selectedForce.startCoord);
    }
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
  }

  deleteForce() {
    this.disappearContext();
    const forceIndex = this.forces.findIndex(f => f.id === GridComponent.selectedForce.id);
    this.forces.splice(forceIndex, 1);
  }

  private static dragJoint(selectedJoint: Joint, trueCoord: Coord) {
    // TODO: have the round Number be integrated within function for determining trueCoord
    selectedJoint.x = this.roundNumber(trueCoord.x, 3);
    selectedJoint.y = this.roundNumber(trueCoord.y, 3);
    selectedJoint.links.forEach(l => {
      // TODO: delete this if this is not needed (verify this)
      const jointIndex = l.joints.findIndex(jt => jt.id === selectedJoint.id);
      l.joints[jointIndex].x = this.roundNumber(trueCoord.x, 3);
      l.joints[jointIndex].y = this.roundNumber(trueCoord.y, 3);
      l.bound = Link.getBounds(
        new Coord(l.joints[0].x, l.joints[0].y),
        new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
      l.d = Link.getPointsFromBounds(l.bound, l.shape);
      l.CoMX = l.determineCenterOfMass(l.joints, 'x');
      l.CoMY = l.determineCenterOfMass(l.joints, 'y');
      l.forces.forEach(f => {
        // TODO: adjust the location of force endpoints and update the line and arrow
      });
    });
    return selectedJoint
  }
  private static dragForce(selectedForce: Force, trueCoord: Coord) {
    if (GridComponent.selectedForceEndPoint === 'startPoint') {
      selectedForce.startCoord.x = trueCoord.x;
      selectedForce.startCoord.y = trueCoord.y;
    } else {
      selectedForce.endCoord.x = trueCoord.x;
      selectedForce.endCoord.y = trueCoord.y;
    }
    selectedForce.forceLine = Force.createForceLine(selectedForce.startCoord, selectedForce.endCoord);
    if (selectedForce.arrowOutward) {
      selectedForce.forceArrow = Force.createForceArrow(selectedForce.startCoord, selectedForce.endCoord);
    } else {
      selectedForce.forceArrow = Force.createForceArrow(selectedForce.endCoord, selectedForce.startCoord);
    }
    return selectedForce;
  }

  roundNumber(num: number, scale: number): number {
    const tens = Math.pow(10, scale);
    return Math.round(num * tens) / tens;
  }
}
