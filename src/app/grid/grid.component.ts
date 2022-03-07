import { Component, OnInit, AfterViewInit } from '@angular/core';
import {Joint} from "./joint/joint";
import {Link} from "./link/link";
import {Force} from "./force/force";
import {TransformMatrix} from "./transform-matrix/transform-matrix";
import {Coord} from "./coord/coord";
import {AppConstants} from "./app-constants/app-constants";


// The possible states the program could be in.
enum states {
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
  styleUrls: ['./grid.component.css']
})

export class GridComponent implements OnInit, AfterViewInit {

  private static SVGCanvas: SVGElement; // Reference to the SVG canvas (coordinate grid)
  private static SVGCanvasTM: SVGElement; // The transpose matrix under the SVG canvas.
  private static SVGTransformMatrixGridSVG: SVGElement;
  private static SVGTransformMatrixSVG: SVGElement;
  private static transformMatrix: TransformMatrix;

  jointArray!: Joint[];
  linkArray!: Link[];
  forceArray!: Force[];

  // holders
  private static linkageHolder: SVGElement;
  private static pathsHolder: SVGElement;
  private static pathsPathPointHolder: SVGElement;
  private static forcesHolder: SVGElement;
  private static jointLinkForceTagHolder: SVGElement;
  private static comTagHolder: SVGElement;
  private static pathPointHolder: SVGElement;
  private static threePositionHolder: SVGElement;
  private static tempHolder: SVGElement;

  private static states: states;
  private static moveModes: moveModes;
  private static scaleFactor = 1;

  private static panOffset = {
    x: 0,
    y: 0
  };

  constructor() { }
    // this.jointArray = [];
    // this.linkArray = [];
    // this.forceArray = [];

    // function createPattern(id: string, width: string, height: string, patternUnits: string) {
    //   const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    //   pattern.setAttribute('id', id);
    //   pattern.setAttribute('width', width);
    //   pattern.setAttribute('height', height);
    //   pattern.setAttribute('patternUnits', patternUnits);
    //   return pattern;
    // }
    // function createPath(d: string, fill: string, stroke: string, strokeWidth: string) {
    //   const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    //   path.setAttribute('d', d);
    //   path.setAttribute('fill', fill);
    //   path.setAttribute('stroke', stroke);
    //   path.setAttribute('stroke-width', strokeWidth);
    //   return path;
    // }
    // function createRect(width: string, height: string, fill: string, x?: string, y?: string) {
    //   const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    //   if (x !== undefined) {
    //     rect.setAttribute('x', x);
    //   }
    //   if (y !== undefined) {
    //     rect.setAttribute('y', y);
    //   }
    //   rect.setAttribute('width', width);
    //   rect.setAttribute('height', height);
    //   rect.setAttribute('fill', 'url(#' + fill + ')');
    //   return rect;
    // }
    // function createLine(id: string, x1: string, y1: string, x2: string, y2: string) {
    //   const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    //   line.setAttribute('id', id);
    //   line.setAttribute('x1', x1);
    //   line.setAttribute('y1', y1);
    //   line.setAttribute('x2', x2);
    //   line.setAttribute('y2', y2);
    //   line.style.stroke = 'rgb(0,0,0)';
    //   line.style.strokeWidth = '0.04px';
    //   return line;
    // }

    // const SVGtransformMatrixGridSVG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // SVGtransformMatrixGridSVG.setAttribute('id', 'transformMatrixGrid');
    //
    // const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    // const pattern1 = createPattern('smallGrid', '10', '10', 'userSpaceOnUse');
    // const path1 = createPath('M 10 0 L 0 0 0 10', 'none', 'gray', '0.5');
    // const pattern2 = createPattern('grid', '50', '50', 'userSpaceOnUse');
    // const rect1 = createRect('50', '50', 'smallGrid');
    // const path2 = createPath('M 50 0 L 0 0 0 50', 'none', 'black', '1');
    // const rect2 = createRect('10000px', '10000px', 'grid', '-5000', '-5000');
    // pattern1.appendChild(path1);
    // pattern2.appendChild(rect1);
    // pattern2.appendChild(path2);
    // defs.appendChild(pattern1);
    // defs.appendChild(pattern2);
    // SVGtransformMatrixGridSVG.appendChild(defs);
    //
    // SVGtransformMatrixGridSVG.appendChild(rect2);

    // const SVGtransformMatrixSVG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // SVGtransformMatrixSVG.setAttribute('id', 'transformMatrix');
    // const line1 = createLine('yAxis', '0', '-99999', '0', '99999');
    // const line2 = createLine('xAxis', '-99999', '0', '99999', '0');
    // SVGtransformMatrixSVG.appendChild(line1);
    // SVGtransformMatrixSVG.appendChild(line2);

    // GridComponent.SVGCanvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // GridComponent.SVGCanvas.setAttribute('id', 'SVGCanvas');
    // GridComponent.SVGCanvas.style.width = '100%';
    // GridComponent.SVGCanvas.style.height = '100%';
    // this.SVGCanvas.style.width = '90vw';
    // this.SVGCanvas.style.height = '90vh';
    // this.SVGCanvas.setAttribute('width', '1000px');
    // this.SVGCanvas.setAttribute('height', '1000px');
    // GridComponent.SVGCanvas.appendChild(SVGtransformMatrixGridSVG);
    // GridComponent.SVGCanvas.appendChild(SVGtransformMatrixSVG);
    // GridComponent.SVGCanvas.style.transform = 'scaleY(-1)';

    // document.body.appendChild(GridComponent.SVGCanvas);
  ngOnInit(): void {
  }


  ngAfterViewInit() {
    GridComponent.states = states.waiting;
    GridComponent.SVGTransformMatrixSVG = document.getElementById('transformMatrix') as unknown as SVGElement;
    GridComponent.SVGTransformMatrixGridSVG = document.getElementById('transformMatrixGrid') as unknown as SVGElement;
    GridComponent.SVGCanvas = document.getElementById('SVGCanvas') as unknown as SVGElement
    GridComponent.reset();
    /*
    GridComponent.SVGCanvas.addEventListener('mousedown', function (e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const rawCoords = GridComponent.getMousePosition(e);
      if (rawCoords === undefined) {
        return
      }
      const trueCoords = GridComponent.transformMatrix.screenToGrid(rawCoords.x, rawCoords.y);
      switch (e.button) {
        case 0: // Handle Left-Click on canvas
          // GridComponent.hideMenu.emit(true); // Hide the context menu
          const state = GridComponent.states;
          switch (state) {
            case states.panning:
              break;
            case states.waiting:
              const mPos = GridComponent.getMousePosition(e);
              if (mPos === undefined) {
                return
              }
              GridComponent.panOffset.x = mPos.x;
              GridComponent.panOffset.y = mPos.y;
              GridComponent.states = states.panning;
              break;
            case states.creating:
              // if (that.createMode === createModes.link) {
              //   that.secondJointOnCanvas(trueCoords.x, trueCoords.y);
              //   that.createNewSimulator();
              // } else if (that.createMode === createModes.force) {
              //   that.setForceEndEndpoint(trueCoords.x, trueCoords.y);
              //   that.createNewSimulator();
              //   that.cancelCreation();
              //   that.state = states.waiting;
              // }
              break;
            default:
          }
          break;
        case 1: // Handle Middle-Click on canvas
          return;
        case 2: // Handle Right-Click on canvas
          break;
        default:
          return;
      }
    });
    // Event handler when dragging elements
    GridComponent.SVGCanvas.addEventListener('mousemove', function (ev) {
      const e = ev;
      e.preventDefault();
      e.stopPropagation();
      // Check if we are creating a link
      const rawCoord = GridComponent.getMousePosition(e);
      if (rawCoord === undefined) {
        return
      }
      const trueCoord = GridComponent.transformMatrix.screenToGrid(rawCoord.x, rawCoord.y);

      GridComponent.updateXYPos(trueCoord.x, trueCoord.y);

      switch (GridComponent.states) {
        // case states.moving:
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
        // case states.editing:
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

        case states.panning:
          GridComponent.panCanvas(rawCoord.x, rawCoord.y);
          break;
        // case states.creating:
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
    });
    // this.SVGCanvas.addEventListener('mouseover', function (e) {});
    GridComponent.SVGCanvas.addEventListener('mouseup', function (e) {
      // Deselect the selected link.
      switch (GridComponent.states) {
        case states.moving:
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
        case states.panning:
          GridComponent.states = states.waiting;
          break;
        case states.creating:
          break;
        case states.editing:
          GridComponent.states = states.waiting;
          // GridComponent.editingLink.cacheBounds();
          break;
      }
    });
    // this.SVGCanvas.addEventListener('contextmenu', function (e) {
    //   e.preventDefault();
    //   e.stopPropagation();
    //   if (that.animationMode()) {
    //     IndiFuncs.showErrorNotification('stop the animation before making changes');
    //     return;
    //   }
    //   if (that.isEditing) { return; }
    //
    //   if (that.state === states.creating) {
    //     that.cancelCreation();
    //     that.state = states.waiting;
    //   } else {
    //     that.recordMousePosition(e);
    //     const screenCoords = new Coord(e.clientX, e.clientY);
    //     switch (that.synthesis) {
    //       case 'none':
    //         that.showMenuEmit(screenCoords, contextSelector.canvasNoSyn);
    //         break;
    //       case 'three_pos':
    //         that.showMenuEmit(screenCoords, contextSelector.canvasThreePositionSyn);
    //         break;
    //       case 'path_point':
    //         that.showMenuEmit(screenCoords, contextSelector.canvasPathPointSyn);
    //         break;
    //       default:
    //         break;
    //     }
    //   }
    // });
    GridComponent.SVGCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
      // GridComponent.hideMenu.emit(true); // Hide the context menu
      let wheelAmount = e.deltaY;
      if (wheelAmount > 0) {
        wheelAmount = 20 / 21;
      } else if (wheelAmount < 0) {
        wheelAmount = 21 / 20;
      } else {
        return;
      }
      const rawSVGCoords = GridComponent.getMousePosition(e);
      if (rawSVGCoords === undefined) {
        return
      }
      GridComponent.transformMatrix.zoomPoint(wheelAmount, rawSVGCoords.x, rawSVGCoords.y);
    });
    // this.state = states.waiting;

    // this.refreshLinkage();
    // this.refreshForces();
     */
  }

  private static screenToGrid(x: number, y: number) {
    const newX = (1 / GridComponent.scaleFactor) * (x - GridComponent.panOffset.x);
    const newY = (1 / GridComponent.scaleFactor) * (y - GridComponent.panOffset.y);
    return new Coord(newX, newY);
  }

  private static gridToScreen(x: number, y: number) {
    const newX = (AppConstants.scaleFactor * x) + GridComponent.panOffset.x;
    const newY = (AppConstants.scaleFactor * y) + GridComponent.panOffset.y;
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
    GridComponent.panOffset.x = GridComponent.panOffset.x - (beforeScaleCoords.x - afterScaleCoords.x) * GridComponent.scaleFactor;
    GridComponent.panOffset.y = GridComponent.panOffset.y - (beforeScaleCoords.y - afterScaleCoords.y) * GridComponent.scaleFactor;
    GridComponent.applyMatrixToSVG();
  }

  private static applyMatrixToSVG() {
    if (isNaN(GridComponent.panOffset.x) || isNaN(GridComponent.panOffset.y)) {
      GridComponent.reset();
    } else {
      const offsetX = GridComponent.panOffset.x;
      const offsetY = GridComponent.panOffset.y;
      const newMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + GridComponent.scaleFactor + ')';
      const gridMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + GridComponent.scaleFactor * AppConstants.scaleFactor + ')';
      GridComponent.SVGTransformMatrixSVG.setAttributeNS(null, 'transform', newMatrix);
      GridComponent.SVGTransformMatrixGridSVG.setAttributeNS(null, 'transform', gridMatrix);
    }
  }

  private static reset() {
    const box = GridComponent.SVGCanvas.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    GridComponent.panOffset.x = (width / 2) * AppConstants.scaleFactor;
    GridComponent.panOffset.y = (height / 2) * AppConstants.scaleFactor;
    GridComponent.scaleFactor = 1;
    this.zoomPoint(1 / AppConstants.scaleFactor, 0, 0);
    this.applyMatrixToSVG();
  }

  private static getMousePosition(e: MouseEvent) {
    const svg = GridComponent.SVGCanvas as SVGGraphicsElement;
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

  private static updateXYPos(x: number, y: number) {
    const xPos = document.getElementById('xPos');
    const yPos = document.getElementById('yPos');
    if (xPos && yPos) {
      xPos.innerText = GridComponent.roundNumber(x, 0).toString();
      yPos.innerText = GridComponent.roundNumber(y, 0).toString();
    }
  }

  private static panCanvas(x: number, y: number) {
    const offsetX = GridComponent.panOffset.x - x;
    const offsetY = GridComponent.panOffset.y - y;
    GridComponent.panOffset.x = x;
    GridComponent.panOffset.y = y;
    const box = GridComponent.SVGCanvas.getBoundingClientRect();
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    let correctedPan = false;
    // Cause panning outside the defined area to pan the user back in.
    if (GridComponent.transformMatrix.screenToGrid(offsetX, 0).x < -100) {
      GridComponent.transformMatrix.panSVG(Math.abs(offsetX), 0);
      correctedPan = true;
    }
    if (this.transformMatrix.screenToGrid(width + offsetX, 0).x > 100) {
      GridComponent.transformMatrix.panSVG(-Math.abs(offsetX), 0);
      correctedPan = true;
    }
    if (GridComponent.transformMatrix.screenToGrid(0, offsetY).y < -100) {
      GridComponent.transformMatrix.panSVG(0, Math.abs(offsetY));
      correctedPan = true;
    }
    if (GridComponent.transformMatrix.screenToGrid(0, height + offsetY).y > 100) {
      GridComponent.transformMatrix.panSVG(0, -Math.abs(offsetY));
      correctedPan = true;
    }
    if (!correctedPan) {
      GridComponent.transformMatrix.panSVG(offsetX, offsetY);
    }
  }
}
