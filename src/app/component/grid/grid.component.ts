import {AfterViewInit, Component, Input, OnInit} from '@angular/core';
import {Coord} from "../../model/coord";
import {AppConstants} from "../../model/app-constants";
import {Joint} from "../../model/joint";
import {Link, Shape} from "../../model/link";
import {Force} from "../../model/force";
import {Simulator} from "../../model/simulator/simulator";


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
  // TODO: Put updateSimulator whenever dragging, deleting, creating, anything
  @Input() showIdTags: boolean = true;
  @Input() showCoMTags: boolean = true;
  @Input() unit: string = 'cm';
  @Input() gravity: boolean = false;
  joints: Joint[] = [];
  links: Link[] = [];
  forces: Force[] = [];
  simulators: Simulator[] = [];

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
    GridComponent.contextMenuAddInputJoint = document.getElementById('menuEntryAddInput') as unknown as SVGElement;
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
    const newX = this.roundNumber((1 / GridComponent.scaleFactor) * (x - GridComponent.gridOffset.x), 3);
    const newY = this.roundNumber(-1 * (1 / GridComponent.scaleFactor) * (y - GridComponent.gridOffset.y), 3);
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

  mouseUp() {
    // TODO check for condition when a state was not waiting. If it was not waiting, then update the simulator
    GridComponent.gridStates = gridStates.waiting;
    GridComponent.jointStates = jointStates.waiting;
    GridComponent.linkStates = linkStates.waiting;
    GridComponent.forceStates = forceStates.waiting;
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
                  const x2 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')), 3);
                  const y2 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')), 3);
                  let lastLetter = '';
                  let joint2ID: string;
                  this.joints.forEach(j => {
                    if (j.id > lastLetter) {
                      lastLetter = j.id;
                    }
                  });
                  joint2ID = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
                  const joint2 = new Joint(joint2ID, x2, y2);
                  const link = new Link(GridComponent.selectedJoint.id + joint2.id, [GridComponent.selectedJoint, joint2]);
                  GridComponent.selectedJoint.links.push(link);
                  GridComponent.selectedJoint.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(GridComponent.selectedJoint);
                  joint2.links.push(link);
                  this.joints.push(joint2);
                  this.links.push(link);
                  this.createNewSimulator();
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display='none';
                } else if (GridComponent.linkStates === linkStates.creating) {
                  const x1 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')), 3);
                  const y1 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')), 3);
                  const x2 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')), 3);
                  const y2 = this.roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')), 3);
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
                  const joint1 = new Joint(joint1ID, x1,  y1);
                  const joint2 = new Joint(joint2ID, x2, y2);
                  const link = new Link(joint1ID + joint2ID, [joint1, joint2]);
                  joint1.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(joint1);
                  joint1.links.push(link);
                  joint2.links.push(link);
                  this.joints.push(joint1);
                  this.joints.push(joint2);
                  this.links.push(link);
                  this.createNewSimulator();
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
                  // TODO: Be sure the force added is at correct position for binary link
                  const force = new Force('F' + '1', GridComponent.selectedLink, startCoord, endCoord);
                  this.forces.push(force);
                  this.createNewSimulator();
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
  mouseMove($event: MouseEvent, typeChosen: string) {
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
              this.createNewSimulator();
            } else if (GridComponent.linkStates === linkStates.dragging) { // user is dragging a link
              // TODO: Add logic when dragging a link within edit shape mode
              this.createNewSimulator();
            } else if (GridComponent.forceStates === forceStates.dragging) { // user is dragging a force
              // TODO: Add logic to drag force properly within the grid
              GridComponent.selectedForce = GridComponent.dragForce(GridComponent.selectedForce, trueCoord);
              this.createNewSimulator();
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
        switch (GridComponent.jointStates) {
          case jointStates.dragging:
            GridComponent.selectedJoint = GridComponent.dragJoint(GridComponent.selectedJoint, trueCoord);
            this.createNewSimulator();
            break;
          case jointStates.waiting:
            break;
        }
        break;
      case 'link':
        // TODO: Have to take into consideration when clicking on a joint and having dragged the joint on top of the link
        break;
      case 'force':
        switch (GridComponent.forceStates) {
          case forceStates.dragging:
            GridComponent.selectedForce = GridComponent.dragForce(GridComponent.selectedForce, trueCoord);
            this.createNewSimulator();
            break;
        }
        break;
    }
  }
  RectMouseOver($event: MouseEvent, menuType: string) {
    switch (menuType) {
      case 'addInput':
        GridComponent.contextMenuAddInputJoint.children[0].setAttribute('style',
          'fill: rgb(200, 200, 200); stroke: white; stroke-width: 1px');
        break;
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
      case 'addInput':
        GridComponent.contextMenuAddInputJoint.children[0].setAttribute('style',
          'fill: rgb(244, 244, 244); stroke: white; stroke-width: 1px');
        break;
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
        switch (joint.links.length) {
          case 0:
            switch (joint.type) {
              case 'R':
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Add Slider'
                if (joint.ground) {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Remove Ground'
                  if (joint.input) {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input'
                  } else {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input'
                  }
                  this.showcaseContextMenu(GridComponent.contextMenuAddInputJoint, offsetX, offsetY, 0, 0);
                  this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoJoint, offsetX, offsetY, 20, 20);
                  this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 40, 40);
                  this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 60, 60);
                  this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 80, 80);
                } else {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                  this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoJoint, offsetX, offsetY, 0, 0);
                  this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 20);
                  this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 40);
                  this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 60);
                }
                break;
              case 'P':
                if (GridComponent.selectedJoint.input) {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                } else {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                }
                GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Remove Slider';
                this.showcaseContextMenu(GridComponent.contextMenuAddInputJoint, offsetX, offsetY, 0, 0);
                this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoJoint, offsetX, offsetY, 20, 20);
                this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 40, 40);
                this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 60, 60);
                this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 80, 80);
                break;
            }

            break;
          case 1:
            switch (joint.type) {
              case 'R':
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Add Slider'
                if (joint.ground) {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Remove Ground'
                  if (joint.input) {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input'
                  } else {
                    GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input'
                  }
                  this.showcaseContextMenu(GridComponent.contextMenuAddInputJoint, offsetX, offsetY, 0, 0);
                  this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 20);
                  this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 40);
                  this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 60);
                } else {
                  GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                  this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoJoint, offsetX, offsetY, 0, 0);
                  this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 20);
                  this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 40);
                  this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 60);
                }
                break;
              case 'P':
                if (GridComponent.selectedJoint.input) {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Remove Input';
                } else {
                  GridComponent.contextMenuAddInputJoint.children[1].innerHTML = 'Add Input';
                }
                GridComponent.contextMenuAddGround.children[1].innerHTML = 'Add Ground';
                GridComponent.contextMenuAddSlider.children[1].innerHTML = 'Remove Slider';
                this.showcaseContextMenu(GridComponent.contextMenuAddInputJoint, offsetX, offsetY, 0, 0);
                this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 20);
                this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 40);
                this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 60);
                break;
            }
            break;
          default:
            this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 0, 0);
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
          this.showcaseContextMenu(GridComponent.contextMenuAddLinkOntoLink, offsetX, offsetY, 0, 0);
          this.showcaseContextMenu(GridComponent.contextMenuAddTracerPoint, offsetX, offsetY, 20, 20);
          this.showcaseContextMenu(GridComponent.contextMenuAddForce, offsetX, offsetY, 40, 40);
          this.showcaseContextMenu(GridComponent.contextMenuEditShape, offsetX, offsetY, 60, 60);
          this.showcaseContextMenu(GridComponent.contextMenuDeleteLink, offsetX, offsetY, 80, 80);
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

  addJoint() {
    this.disappearContext();
    const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    const coord = GridComponent.screenToGrid(screenX, screenY);
    const newJoint = new Joint('a', coord.x, coord.y);
    this.joints.push(newJoint);
    this.createNewSimulator();
  }
  createGround() {
    this.disappearContext();
    if (GridComponent.selectedJoint.type === 'P') {
      GridComponent.selectedJoint.type = 'R'
    } else {
      GridComponent.selectedJoint.ground = !GridComponent.selectedJoint.ground;
    }
    this.createNewSimulator();
  }
  createSlider() {
    this.disappearContext();
    // TODO: Sliders are ground joints. However, we prob don't want to showcase ground. So probably need to update this
    // TODO: Within the HTML document
    GridComponent.selectedJoint.type = GridComponent.selectedJoint.type === 'P' ? 'R' : 'P';
    GridComponent.selectedJoint.ground = GridComponent.selectedJoint.type === 'P';
    this.createNewSimulator();
  }
  deleteJoint() {
    this.disappearContext();
    const jointIndex = this.joints.findIndex(jt => jt.id === GridComponent.selectedJoint.id);
    GridComponent.selectedJoint.links.forEach(l => {
      if (l.joints.length < 3) {
        // delete forces on link
        l.forces.forEach(f => {
          const forceIndex = this.forces.findIndex(fo => fo.id === f.id);
          this.forces.splice(forceIndex, 1);
        });
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID = l.joints[0].id === GridComponent.selectedJoint.id ? l.joints[1].id : l.joints[0].id;
        const desiredJointIndex = this.joints.findIndex(j => j.id === desiredJointID);
        const deleteJointIndex = this.joints[desiredJointIndex].connectedJoints.findIndex(jt => jt.id === GridComponent.selectedJoint.id);
        this.joints[desiredJointIndex].connectedJoints.splice(deleteJointIndex, 1);
        const deleteLinkIndex = this.joints[desiredJointIndex].links.findIndex(li => li.id === l.id);
        this.joints[desiredJointIndex].links.splice(deleteLinkIndex,  1);
        // remove link from links
        const deleteLinkIndex2 = this.links.findIndex(li => li.id === l.id);
        this.links.splice(deleteLinkIndex2, 1);
      }
    });
    this.joints.splice(jointIndex, 1);
    this.createNewSimulator();
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
  createInput($event: MouseEvent) {
    this.disappearContext();
    // TODO: Adjust this logic when there are multiple mechanisms created
    GridComponent.selectedJoint.input = !GridComponent.selectedJoint.input;
    this.createNewSimulator();
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
    this.createNewSimulator();
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
    this.createNewSimulator();
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
    this.createNewSimulator();
  }
  deleteForce() {
    this.disappearContext();
    const forceIndex = this.forces.findIndex(f => f.id === GridComponent.selectedForce.id);
    this.forces.splice(forceIndex, 1);
    this.createNewSimulator();
  }

  createNewSimulator() {
    this.simulators = [];
    this.simulators.push(new Simulator(this.joints, this.links, this.forces, this.gravity, this.unit));
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
      l.updateCoMDs();
      l.forces.forEach(f => {
        // TODO: adjust the location of force endpoints and update the line and arrow
      });
    });
    return selectedJoint
  }
  private static dragForce(selectedForce: Force, trueCoord: Coord) {
    if (GridComponent.selectedForceEndPoint === 'startPoint') {
      if (selectedForce.link.shape === 'line') {
        const jointOne = selectedForce.link.joints[0];
        const jointTwo = selectedForce.link.joints[1];
        const smallestX = jointOne.x < jointTwo.x ? jointOne.x : jointTwo.x;
        const biggestX = jointOne.x > jointTwo.x ? jointOne.x : jointTwo.x;
        // TODO: Check to see whether these roundNumbers here are necessary or not
        if (smallestX > trueCoord.x) {
          selectedForce.startCoord.x = this.roundNumber(smallestX, 3);
        } else if (biggestX < trueCoord.x) {
          selectedForce.startCoord.x = this.roundNumber(biggestX, 3);
        } else {
          selectedForce.startCoord.x = this.roundNumber(trueCoord.x, 3);
        }
        const slope = (jointTwo.y - jointOne.y ) / (jointTwo.x - jointOne.x);
        const b = jointOne.y;
        selectedForce.startCoord.y = this.roundNumber(jointOne.y + (selectedForce.startCoord.x - jointOne.x) * slope, 3);
      } else {
        selectedForce.startCoord.x = trueCoord.x;
        selectedForce.startCoord.y = trueCoord.y;
      }
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

  private static roundNumber(num: number, scale: number): number {
    const tens = Math.pow(10, scale);
    return Math.round(num * tens) / tens;
  }
  roundNumber(num: number, scale: number): number {
    const tens = Math.pow(10, scale);
    return Math.round(num * tens) / tens;
  }
}
