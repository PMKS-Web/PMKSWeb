import { Injectable } from '@angular/core';
import * as svgPanZoom from 'svg-pan-zoom';

@Injectable({
  providedIn: 'root',
})
export class SvgGridService {
  private panZoomObject: any;
  public viewBoxMinX: number = 0;
  public viewBoxMaxX: number = 0;
  public viewBoxMinY: number = 0;
  public viewBoxMaxY: number = 0;
  constructor() {}

  updateVisibleCoords(unused: any) {
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
    // console.log(this);
    // console.log(this.viewBoxMinX, this.viewBoxMaxX);
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
      onPan: this.updateVisibleCoords.bind(this),
      onZoom: this.updateVisibleCoords.bind(this),
    });
  }

  getZoom() {
    return this.panZoomObject.getZoom();
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
