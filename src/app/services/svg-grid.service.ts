import { Injectable } from '@angular/core';
import * as svgPanZoom from 'svg-pan-zoom';

@Injectable({
  providedIn: 'root',
})
export class SvgGridService {
  public panZoomObject: any;
  public viewBoxMinX: number = 0;
  public viewBoxMaxX: number = 0;
  public viewBoxMinY: number = 0;
  public viewBoxMaxY: number = 0;
  verticalLines: number[] = [];
  horizontalLines: number[] = [];
  private defualtCellSize: number = 200;
  private cellSize: number = this.defualtCellSize;
  constructor() {}

  updateVisibleCoords() {
    let zoomLevel = this.getZoom();
    const { width, height } = this.getSizes();
    const { x, y } = this.getPan();
    const visibleWidth = width / zoomLevel; // calculate visible width
    const visibleHeight = height / zoomLevel; // calculate visible height
    const visibleX = -x / zoomLevel; // calculate visible X position
    const visibleY = -y / zoomLevel; // calculate visible Y position
    this.viewBoxMinX = visibleX;
    this.viewBoxMaxX = visibleX + visibleWidth;
    this.viewBoxMinY = visibleY;
    this.viewBoxMaxY = visibleY + visibleHeight;
    // this.panZoomObject.updateBBox(); // Update viewport bounding box
    // console.log(viewBox);
    // console.log(this.viewBoxMinX, this.viewBoxMaxX);
  }

  handlePan() {
    this.updateVisibleCoords();
    this.verticalLines = [];
    let currentLine = Math.floor(this.viewBoxMinX / this.cellSize) * this.cellSize;
    while (currentLine < this.viewBoxMaxX) {
      this.verticalLines.push(currentLine);
      currentLine += this.cellSize;
    }

    this.horizontalLines = [];
    currentLine = Math.floor(this.viewBoxMinY / this.cellSize) * this.cellSize;
    while (currentLine < this.viewBoxMaxY) {
      this.horizontalLines.push(currentLine);
      currentLine += this.cellSize;
    }
  }

  handleZoom() {
    // From viewBox min to viewbox max make a line every 100px centered on 0
    // this.verticalLines = [];
    // let cellSize = 400;
    // while (this.verticalLines.length < 10) {
    //   this.verticalLines = [];
    //   let currentLine = Math.floor(this.viewBoxMinX / cellSize) * cellSize;
    //   while (currentLine < this.viewBoxMaxX) {
    //     this.verticalLines.push(currentLine);
    //     currentLine += cellSize;
    //   }
    //   cellSize /= 2;
    //   console.log(cellSize);
    // }

    this.cellSize = this.defualtCellSize;
    while (this.cellSize * this.getZoom() > 200) {
      this.cellSize /= 2;
    }
    this.handlePan();
  }

  zoomIn() {
    this.panZoomObject.zoomIn();
  }

  zoomOut() {
    this.panZoomObject.zoomOut();
  }

  setNewElement(root: HTMLElement) {
    this.panZoomObject = svgPanZoom(root, {
      zoomEnabled: true,
      fit: false,
      center: false,
      zoomScaleSensitivity: 0.15,
      onPan: this.handlePan.bind(this),
      onZoom: this.handleZoom.bind(this),
    });
    this.panZoomObject.center();
  }

  getZoom() {
    return this.panZoomObject.getSizes().realZoom;
  }

  getPan() {
    return this.panZoomObject.getPan();
  }

  getSizes() {
    return this.panZoomObject.getSizes();
  }

  scaleWithZoom(value: number) {
    return value / this.getZoom();
  }
}
