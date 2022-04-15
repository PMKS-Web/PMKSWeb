import {AfterViewInit, Component, Input, OnInit} from '@angular/core';
import {Coord} from "../../model/coord";
import {AppConstants} from "../../model/app-constants";
import {Joint, RevJoint, PrisJoint, ImagJoint, RealJoint} from "../../model/joint";
import {ImagLink, Link, RealLink, Shape} from "../../model/link";
import {Force} from "../../model/force";
import {Mechanism} from "../../model/mechanism/mechanism";
import {InstantCenter} from "../../model/instant-center";
import {roundNumber} from "../../model/utils";


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
  @Input() showIdTags: boolean = false;
  @Input() showCoMTags: boolean = false;
  @Input() unit: string = 'cm';
  @Input() gravity: boolean = false;
  @Input() runAnimation: boolean = true;
  joints: Joint[] = [];
  links: Link[] = [];
  forces: Force[] = [];
  ics: InstantCenter[] = [];
  mechanisms: Mechanism[] = [];

  screenCoord: string = '';

  // holders
  static canvasSVGElement: SVGElement; // Reference to the SVG canvas (coordinate grid)
  private static transformMatrixGridSVGElement: SVGElement;
  private static transformMatrixSVG: HTMLElement;
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
  showcaseShapeSelector: boolean = false;

  static get gridOffset(): { x: number; y: number } {
    return this._gridOffset;
  }

  private static gridStates: gridStates = gridStates.waiting;
  private static jointStates: jointStates = jointStates.waiting;
  private static linkStates: linkStates = linkStates.waiting;
  private static forceStates: forceStates = forceStates.waiting;
  private static moveModes: moveModes;
  static scaleFactor = 1;

  private static panOffset = {
    x: 0,
    y: 0
  };
  // TODO: Make getters and setters
  static _gridOffset = {
    x: 0,
    y: 0
  };

  // remove this if this is possible
  private static selectedJoint: RealJoint;
  static selectedLink: RealLink;
  private static selectedForce: Force;
  private static selectedForceEndPoint: string;

// TODO: ADD LOGIC FOR INSTANT CENTERS AND GEARS AFTER FINISHING SIMJOINTS AND SIMLINKS!
  constructor() {
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    GridComponent.transformMatrixSVG = <HTMLElement> document.getElementById('transformMatrix');
    GridComponent.transformMatrixGridSVGElement = document.getElementById('transformMatrixGrid') as unknown as SVGElement;
    GridComponent.pathsHolderSVG = document.getElementById('pathsHolder') as unknown as SVGElement;
    GridComponent.pathsPathPointHolderSVG = document.getElementById('pathsPathPointHolder') as unknown as SVGElement;
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
    const newX = roundNumber((1 / GridComponent.scaleFactor) * (x - GridComponent._gridOffset.x), 3);
    const newY = roundNumber(-1 * (1 / GridComponent.scaleFactor) * (y - GridComponent._gridOffset.y), 3);
    return new Coord(newX, newY);
  }

  private static gridToScreen(x: number, y: number) {
    const newX = (AppConstants.scaleFactor * x) + GridComponent._gridOffset.x;
    const newY = (AppConstants.scaleFactor * y) + GridComponent._gridOffset.y;
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
    GridComponent._gridOffset.x = GridComponent._gridOffset.x - (beforeScaleCoords.x - afterScaleCoords.x) * GridComponent.scaleFactor;
    GridComponent._gridOffset.y = GridComponent._gridOffset.y + (beforeScaleCoords.y - afterScaleCoords.y) * GridComponent.scaleFactor;
    GridComponent.applyMatrixToSVG();
  }

  // TODO: Maybe see if there is a way to put this within HTML
  private static applyMatrixToSVG() {
    const offsetX = GridComponent._gridOffset.x;
    const offsetY = GridComponent._gridOffset.y;
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
    const CTM = svg.getScreenCTM();
    // if (e.touches) { e = e.touches[0]; }
    const box = svg.getBoundingClientRect();
    // const width = box.right - box.left;
    const height = box.bottom - box.top;
    if (CTM === null) {
      return
    }
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
      return
    }
    GridComponent.zoomPoint(wheelAmount, rawSVGCoords.x, rawSVGCoords.y * -1);
  }

  mouseUp() {
    // TODO check for condition when a state was not waiting. If it was not waiting, then update the mechanism
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
                  const x2 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')), 3);
                  const y2 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')), 3);
                  const joint2ID = this.determineNextLetter();
                  const joint2 = new RevJoint(joint2ID, x2, y2);
                  const link = new RealLink(GridComponent.selectedJoint.id + joint2.id, [GridComponent.selectedJoint, joint2]);
                  GridComponent.selectedJoint.links.push(link);
                  GridComponent.selectedJoint.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(GridComponent.selectedJoint);
                  joint2.links.push(link);
                  this.joints.push(joint2);
                  this.links.push(link);
                  this.updateMechanism();
                  GridComponent.gridStates = gridStates.waiting;
                  GridComponent.jointStates = jointStates.waiting;
                  GridComponent.jointTempHolderSVG.style.display = 'none';
                } else if (GridComponent.linkStates === linkStates.creating) {
                  const x1 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x1')), 3);
                  const y1 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y1')), 3);
                  const x2 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('x2')), 3);
                  const y2 = roundNumber(Number(GridComponent.jointTempHolderSVG.children[0].getAttribute('y2')), 3);
                  const joint1ID = this.determineNextLetter();
                  const joint2ID = this.determineNextLetter([joint1ID]);
                  const joint1 = new RevJoint(joint1ID, x1, y1);
                  const joint2 = new RevJoint(joint2ID, x2, y2);
                  const link = new RealLink(joint1ID + joint2ID, [joint1, joint2]);
                  joint1.connectedJoints.push(joint2);
                  joint2.connectedJoints.push(joint1);
                  joint1.links.push(link);
                  joint2.links.push(link);
                  this.joints.push(joint1);
                  this.joints.push(joint2);
                  this.links.push(link);
                  this.updateMechanism();
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
                  if (endCoordRaw === undefined) {
                    return
                  }
                  const endCoord = GridComponent.screenToGrid(endCoordRaw.x, endCoordRaw.y * -1);
                  // TODO: Be sure the force added is at correct position for binary link
                  const force = new Force('F' + this.forces.length + 1, GridComponent.selectedLink, startCoord, endCoord);
                  this.forces.push(force);
                  this.updateMechanism();
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
                GridComponent.selectedJoint = thing as RealJoint;
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
                if (forcePoint === undefined) {
                  return
                }
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

  // TODO: Be sure to adjust the position of the ImagJoint when dragging a joint that is a prismatic joint
  mouseMove($event: MouseEvent, typeChosen: string) {
    $event.preventDefault();
    $event.stopPropagation();
    const rawCoord = GridComponent.getMousePosition($event);
    if (rawCoord === undefined) {
      return
    }
    const trueCoord = GridComponent.screenToGrid(rawCoord.x, -1 * rawCoord.y);
    this.screenCoord = '(' + trueCoord.x + ' , ' + trueCoord.y + ')';

    switch (typeChosen) {
      case 'grid':
        switch (GridComponent.gridStates) {
          case gridStates.dragging:
            // These conditions are thrown when dragging an object but mouse is on top of the grid
            // TODO: Rather than to have these if, else if, else if, else,
            // TODO: Have the gridStates also include dragGrid, dragJoint, dragLink, and dragForce
            if (GridComponent.jointStates === jointStates.dragging) {
              GridComponent.selectedJoint = GridComponent.dragJoint(GridComponent.selectedJoint, trueCoord);
              this.updateMechanism();
            } else if (GridComponent.linkStates === linkStates.dragging) { // user is dragging a link
              // TODO: Add logic when dragging a link within edit shape mode
              this.updateMechanism();
            } else if (GridComponent.forceStates === forceStates.dragging) { // user is dragging a force
              // TODO: Add logic to drag force properly within the grid
              GridComponent.selectedForce = GridComponent.dragForce(GridComponent.selectedForce, trueCoord);
              this.updateMechanism();
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
            this.updateMechanism();
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
            this.updateMechanism();
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
            switch (joint.constructor) {
              case RevJoint:
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
              case PrisJoint:
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
            switch (joint.constructor) {
              case RevJoint:
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
              case PrisJoint:
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
                this.showcaseContextMenu(GridComponent.contextMenuAddInputJoint, offsetX, offsetY, 0, 0);
                this.showcaseContextMenu(GridComponent.contextMenuAddGround, offsetX, offsetY, 20, 20);
                this.showcaseContextMenu(GridComponent.contextMenuAddSlider, offsetX, offsetY, 40, 40);
                this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 60, 60);
                break;
              case RevJoint:
                this.showcaseContextMenu(GridComponent.contextMenuDeleteJoint, offsetX, offsetY, 0, 0);
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
    const newJoint = new RevJoint('a', coord.x, coord.y);
    this.joints.push(newJoint);
    this.updateMechanism();
  }

  createGround() {
    this.disappearContext();
    if (GridComponent.selectedJoint instanceof PrisJoint) {
      let joint = GridComponent.selectedJoint as RevJoint;
      // TODO: Be sure to remove connected joints and links that are ImagJoint and ImagLinks
      joint = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
      const selectedJointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, this.joints);
      this.joints[selectedJointIndex] = joint;
    } else {
      GridComponent.selectedJoint.ground = !GridComponent.selectedJoint.ground;
    }
    this.updateMechanism();
  }

  createSlider() {
    this.disappearContext();
    let joint = GridComponent.selectedJoint;
    joint = joint instanceof PrisJoint ?
      // TODO: Be sure to add/remove connected joints and links that are ImagJoint and ImagLinks
      new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints) :
      new PrisJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
    joint.ground = joint instanceof PrisJoint;
    const selectedJointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, this.joints);
    this.joints[selectedJointIndex] = joint;
    GridComponent.selectedJoint = joint;
    // TODO: Have a method to check for input joint
    if (joint instanceof PrisJoint && this.findInputJointIndex() !== -1) {
      this.createImagJointAndLinks(joint);
    }
    this.updateMechanism();
  }

  deleteJoint() {
    this.disappearContext();
    const jointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, this.joints);
    GridComponent.selectedJoint.links.forEach(l => {
      // TODO: May wanna check this to be sure...
      if (l instanceof ImagLink) {
        return
      }
      if (l.joints.length < 3) {
        // TODO: Utilize this same logic when you delete ImagJoint and ImagLink
        // TODO: this.deleteJointFromConnectedJoints(delJoint);
        // TODO: this.deleteLinkFromConnectedLinks(delLink);
        // delete forces on link
        if (l instanceof RealLink) {
          l.forces.forEach(f => {
            const forceIndex = this.forces.findIndex(fo => fo.id === f.id);
            this.forces.splice(forceIndex, 1);
          });
        }
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID = l.joints[0].id === GridComponent.selectedJoint.id ? l.joints[1].id : l.joints[0].id;
        const desiredJointIndex = this.findJointIDIndex(desiredJointID, this.joints);
        const deleteJointIndex = this.findJointIDIndex(GridComponent.selectedJoint.id, (this.joints[desiredJointIndex] as RealJoint).connectedJoints);
        (this.joints[desiredJointIndex] as RealJoint).connectedJoints.splice(deleteJointIndex, 1);
        const deleteLinkIndex = (this.joints[desiredJointIndex] as RealJoint).links.findIndex(lin => {
          if (!(lin instanceof RealLink)) {return}
          return lin.id === l.id});
        (this.joints[desiredJointIndex] as RealJoint).links.splice(deleteLinkIndex, 1);
        // remove link from links
        const deleteLinkIndex2 = this.links.findIndex(li => li.id === l.id);
        this.links.splice(deleteLinkIndex2, 1);
      }
    });
    this.joints.splice(jointIndex, 1);
    this.updateMechanism();
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
    if (mouseRawPos === undefined) {
      return
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
    GridComponent.gridStates = gridStates.creating;
    GridComponent.jointTempHolderSVG.style.display = 'block';
  }

  createInput($event: MouseEvent) {
    this.disappearContext();
    // TODO: Adjust this logic when there are multiple mechanisms created
    GridComponent.selectedJoint.input = !GridComponent.selectedJoint.input;
    if (GridComponent.selectedJoint.input) {
      this.joints.forEach(j => {
        if (j instanceof PrisJoint) {
          this.createImagJointAndLinks(j);
        }
      });
    } else {
      const jointIndicesRemove: number[] = [];
      const linkIndicesRemove: number[] = [];
      this.joints.forEach((j, j_index) => {
        if (j instanceof ImagJoint) {
          jointIndicesRemove.push(j_index);
        }
      });
      this.links.forEach((l, l_index) => {
        if (l instanceof ImagLink) {
          linkIndicesRemove.push(l_index);
        }
      });
      // TODO: Go through neighboring joints of ImagJoints joints and ImagLinks links and remove itself from list ...
      this.joints.splice(jointIndicesRemove.pop()!, 1);
      this.links.splice(linkIndicesRemove.pop()!, 1);
    }
    this.updateMechanism();
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
    if (mouseRawPos === undefined) {
      return
    }
    const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    GridComponent.forceTempHolderSVG.children[0].setAttribute('d', Force.createForceLine(startCoord, mousePos));
    GridComponent.forceTempHolderSVG.children[1].setAttribute('d', Force.createForceArrow(startCoord, mousePos));
    GridComponent.forceStates = forceStates.creating;
    GridComponent.gridStates = gridStates.creating;
    GridComponent.forceTempHolderSVG.style.display = 'block';
  }

  editShape() {
    this.disappearContext();
    // TODO: Add logic to showcase different link shapes to create
    this.showcaseShapeSelector = !this.showcaseShapeSelector;
  }

  deleteLink() {
    this.disappearContext();
    const linkIndex = this.links.findIndex(l => l.id === GridComponent.selectedLink.id);
    this.links.splice(linkIndex, 1);
    this.updateMechanism();
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
    this.updateMechanism();
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
    this.updateMechanism();
  }

  deleteForce() {
    this.disappearContext();
    const forceIndex = this.forces.findIndex(f => f.id === GridComponent.selectedForce.id);
    this.forces.splice(forceIndex, 1);
    this.updateMechanism();
  }

  updateMechanism() {
    this.mechanisms = [];
    // TODO: Determine logic later once everything else is determined
    this.mechanisms.push(new Mechanism(this.joints, this.links, this.forces, this.ics, this.gravity, this.unit));
  }

  private static dragJoint(selectedJoint: RealJoint, trueCoord: Coord) {
    // TODO: have the round Number be integrated within function for determining trueCoord
    selectedJoint.x = roundNumber(trueCoord.x, 3);
    selectedJoint.y = roundNumber(trueCoord.y, 3);
    selectedJoint.links.forEach(l => {
      if (!(l instanceof RealLink)) {return}
      // TODO: delete this if this is not needed (verify this)
      const jointIndex = l.joints.findIndex(jt => jt.id === selectedJoint.id);
      l.joints[jointIndex].x = roundNumber(trueCoord.x, 3);
      l.joints[jointIndex].y = roundNumber(trueCoord.y, 3);
      l.bound = RealLink.getBounds(
        new Coord(l.joints[0].x, l.joints[0].y),
        new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
      l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
      l.CoM = RealLink.determineCenterOfMass(l.joints);
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
          selectedForce.startCoord.x = roundNumber(smallestX, 3);
        } else if (biggestX < trueCoord.x) {
          selectedForce.startCoord.x = roundNumber(biggestX, 3);
        } else {
          selectedForce.startCoord.x = roundNumber(trueCoord.x, 3);
        }
        const slope = (jointTwo.y - jointOne.y) / (jointTwo.x - jointOne.x);
        const b = jointOne.y;
        selectedForce.startCoord.y = roundNumber(jointOne.y + (selectedForce.startCoord.x - jointOne.x) * slope, 3);
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

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
      case ImagJoint:
        return 'I'
      default:
        return '?'
    }
  }

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  typeOfLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      case ImagLink:
        return 'I';
      default:
        return '?'
    }
  }

  // TODO: Figure out where to put this function so this doesn't have to be copied pasted into different classes
  getLinkProp(l: Link, propType: string) {
    if (l instanceof ImagLink) {
      return
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
    if (this.joints.length === 0 && additionalLetters === undefined) {
      return 'a';
    }
    this.joints.forEach(j => {
      if (j.id > lastLetter) {
        lastLetter = j.id;
      }
    });
    additionalLetters?.forEach(l => {
      if (l > lastLetter) {
        lastLetter = l;
      }
    });
    return String.fromCharCode(lastLetter.charCodeAt(0) + 1);
  }

  private createImagJointAndLinks(joint: PrisJoint) {
    const imagJointId = this.determineNextLetter();
    const inputJointIndex = this.findInputJointIndex();
    const inputJoint = this.joints[inputJointIndex];
    if (inputJoint === undefined) {
      return
    }
    const radToDeg = 180 / Math.PI;
    let coord: Coord;
    if (joint.angle % (180 * radToDeg) === 0) {
      coord = new Coord(inputJoint.x, joint.y);
    } else if (joint.angle % (90 * radToDeg) === 0) {
      coord = new Coord(joint.x, inputJoint.y);
    } else {
      const m1 = Math.cos(joint.angle);
      const m2 = Math.cos(90 - joint.angle);
      const b1 = joint.y;
      const b2 = inputJoint.y;
      const x = (b2 - b1) / (m1 - m2);
      const y = m1 * x + b1;
      coord = new Coord(x, y);
    }
    const imagJoint = new ImagJoint(imagJointId, coord.x, coord.y);
    this.joints.push(imagJoint);
    joint.connectedJoints.push(imagJoint);
    const linkJoints = [];
    linkJoints.push(joint);
    linkJoints.push(imagJoint);
    const linkID = joint.id + imagJoint.id;
    const imagLink = new ImagLink(linkID, linkJoints);
    this.links.push(imagLink);
    joint.links.push(imagLink);
  }

  private findInputJointIndex() {
    return this.joints.findIndex(j => {
      if (j instanceof ImagJoint) {
        return
      }
      const joint = j as RealJoint;
      joint.input
    });
  }

  private findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex(j => j.id === id);
  }

  getGround(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return
    }
    return joint.ground;
  }

  getJointR(joint: Joint) {
    if (!(joint instanceof RevJoint)) {
      return 0
    }
    return joint.r;
  }

  getInput(joint: Joint) {
    if (!(joint instanceof RevJoint || joint instanceof PrisJoint)) {
      return
    }
    return joint.input;
  }

  animate() {
    // if (!this.runAnimation) {return}
    for (let positionNum = 0; positionNum < this.mechanisms[0].joints.length; positionNum++) {
      setTimeout(() => {
        // TODO: with this current logic, this.joints has to exactly match. Should this be for all cases??
        this.joints.forEach((j, j_index) => {
          j.x = this.mechanisms[0].joints[positionNum][j_index].x;
          j.y = this.mechanisms[0].joints[positionNum][j_index].y;
        });
        this.links.forEach((l, l_index) => {
          if (!(l instanceof RealLink)) {return}
          const link = this.mechanisms[0].links[positionNum][l_index];
          if (!(link instanceof RealLink)) {return}
          l.bound = link.bound;
          l.d = link.d;
          l.CoM = link.CoM;
          l.updateCoMDs();
          // l.bound = RealLink.getBounds(new Coord(l.joints[0].x, l.joints[0].y), new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          // l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          // l.CoMX = RealLink.determineCenterOfMass(l.joints, 'x');
          // l.CoMY = RealLink.determineCenterOfMass(l.joints, 'y');
          // l.updateCoMDs();
        });
        this.forces.forEach((f, f_index) => {
          // TODO: Check to see if you can switch the coords. But most likely you cannot and have to change values
          f.startCoord.x = this.mechanisms[0].forces[positionNum][f_index].startCoord.x;
          f.startCoord.y = this.mechanisms[0].forces[positionNum][f_index].startCoord.y;
          f.endCoord.x = this.mechanisms[0].forces[positionNum][f_index].endCoord.x;
          f.endCoord.y = this.mechanisms[0].forces[positionNum][f_index].endCoord.y;
          // TODO: Local should not change this but putting this here...
          f.local = this.mechanisms[0].forces[positionNum][f_index].local;
          f.forceLine = Force.createForceLine(f.startCoord, f.endCoord);
          f.forceArrow = Force.createForceArrow(f.startCoord, f.endCoord);
          f.xMag = this.mechanisms[0].forces[positionNum][f_index].xMag;
          f.yMag = this.mechanisms[0].forces[positionNum][f_index].yMag;
        });
        // this.links = this.mechanisms[0].links[positionNum];
        // this.links.forEach((l, l_index) => {
        // if (!(l instanceof RealLink)) {return}
        // l.joints.forEach(j => {
        //   const jointIndex = this.joints.findIndex(jt => jt.id === j.id);
        //   j.x = this.joints[jointIndex].x;
        //   j.y = this.joints[jointIndex].y;
        // });
        // l.bound = RealLink.getBounds(new Coord(l.joints[0].x, l.joints[0].y), new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
        // l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
        // });
      }, 5 * positionNum);
    }
    // this.animate();
  }
// TODO: Is there a way to work and not have this?? Review again using getters and setters?
  gridOffset() {
    return GridComponent.gridOffset;
  }
  scaleFactor() {
    return GridComponent.scaleFactor;
  }

  saveEdit() {
    this.showcaseShapeSelector = false;
  }
  revertEdit() {
    this.showcaseShapeSelector = false;
  }
  cancelEdit() {
    this.showcaseShapeSelector = false;
  }
}
