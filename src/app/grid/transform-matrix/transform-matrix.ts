import {Coord} from '../coord/coord';
import {AppConstants} from "../app-constants/app-constants";

export class TransformMatrix {
  matrixSVG: SVGElement; // The SVG Group used for the transform matrix
  gridSVG: SVGElement;
  containerSVG: SVGElement; // The SVG container we are transforming with our transform matrix
  scaleFactor: number;
  offsetX: number;
  offsetY: number;

  constructor(scaleFactor: number, offsetX: number, offsetY: number, matrixSVG: SVGElement, gridSVG: SVGElement, containerSVG: SVGElement) {
    this.scaleFactor = scaleFactor;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.matrixSVG = matrixSVG;
    this.gridSVG = gridSVG;
    this.containerSVG = containerSVG;
  }

  // Transforms coordinates from screen coordinates to grid coordinates
  screenToGrid(x: number, y: number) {
    const newX = (1 / this.scaleFactor) * (x - this.offsetX);
    const newY = (1 / this.scaleFactor) * (y - this.offsetY);
    return new Coord(newX, newY);
  }

  gridToScreen(x: number, y: number) {
    const newX = (this.scaleFactor * x) + this.offsetX;
    const newY = (this.scaleFactor * y) + this.offsetY;
    return new Coord(newX, newY);
  }

  // Apply the current transform matrix to the svg
  applyMatrixToSVG() {
    if (isNaN(this.offsetX) || isNaN(this.offsetY)) {
      this.reset();
    } else {
      const offsetX = this.offsetX;
      const offsetY = this.offsetY;
      const newMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + this.scaleFactor + ')';
      const gridMatrix = 'translate(' + offsetX + ' ' + offsetY + ') scale(' + this.scaleFactor * AppConstants.scaleFactor + ')';
      this.matrixSVG.setAttributeNS(null, 'transform', newMatrix);
      this.gridSVG.setAttributeNS(null, 'transform', gridMatrix);
    }
  }

  // Pan the screen by a change in x and y
  panSVG(dx: number, dy: number) {
    const newOffsetX = this.offsetX - dx;
    const newOffsetY = this.offsetY - dy;
    this.offsetX = newOffsetX;
    this.offsetY = newOffsetY;
    this.applyMatrixToSVG();
  }

  // Pan the screen by a change in x and y
  // panPoint(x: number, y: number) {
  //   const box = this.containerSVG.getBoundingClientRect();
  //   const width = box.right - box.left;
  //   const height = box.bottom - box.top;
  //   this.offsetX = (width / 2);
  //   this.offsetY = (height / 2);
  //   this.applyMatrixToSVG();
  // }

  // Zoom the screen in to the given coordinate
  zoomPoint(newScale: number, pointX: number, pointY: number) {
    const beforeScaleCoords = this.screenToGrid(pointX, pointY);
    // Prevent zooming in or out too far
    if ((newScale * this.scaleFactor) < AppConstants.maxZoomOut) {
      this.scaleFactor = AppConstants.maxZoomOut;
    } else if ((newScale * this.scaleFactor) > AppConstants.maxZoomIn) {
      this.scaleFactor = AppConstants.maxZoomIn;
    } else {
      this.scaleFactor = newScale * this.scaleFactor;
    }
    const afterScaleCoords = this.screenToGrid(pointX, pointY);
    this.offsetX = this.offsetX - (beforeScaleCoords.x - afterScaleCoords.x) * this.scaleFactor;
    this.offsetY = this.offsetY - (beforeScaleCoords.y - afterScaleCoords.y) * this.scaleFactor;
    this.applyMatrixToSVG();
  }

  // Pan and zoom the Transform Matrix to center the screen around the origin and zoom it in so that it extends 10 units out on the x axis
  reset() {
    const box = this.containerSVG.getBoundingClientRect();
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    this.offsetX = (width / 2) * AppConstants.scaleFactor;
    this.offsetY = (height / 2) * AppConstants.scaleFactor;
    this.scaleFactor = 1;
    this.zoomPoint(1 / AppConstants.scaleFactor, 0, 0);
    this.applyMatrixToSVG();
  }
}
