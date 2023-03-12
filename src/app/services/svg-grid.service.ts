import { Injectable } from '@angular/core';
import * as svgPanZoom from 'svg-pan-zoom';
import { Coord } from '../model/coord';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { forceStates, jointStates } from '../model/utils';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root',
})
export class SvgGridService {
  public panZoomObject: any;
  public CTM!: SVGMatrix;
  public viewBoxMinX: number = 0;
  public viewBoxMaxX: number = 0;
  public viewBoxMinY: number = 0;
  public viewBoxMaxY: number = 0;
  verticalLines: number[] = [];
  verticalLinesMinor: number[] = [];
  horizontalLines: number[] = [];
  horizontalLinesMinor: number[] = [];
  private defualtCellSize: number = 500;

  private cellSize: number = this.defualtCellSize;

  defaultZoom: number = 80;

  constructor(private settingsService: SettingsService) {}

  setNewElement(root: HTMLElement) {
    //This is like the constructor, and allows you to set the root element where the library is loaded
    this.panZoomObject = svgPanZoom(root, {
      zoomEnabled: true,
      fit: false,
      center: false,
      zoomScaleSensitivity: 0.15,
      dblClickZoomEnabled: false,
      maxZoom: 150,
      onPan: this.handlePan.bind(this),
      onZoom: this.handleZoom.bind(this),
      beforePan: this.handleBeforePan.bind(this),
      onUpdatedCTM: this.handleUpdatedCTM.bind(this),
    });
    this.scaleToFitLinkage();
  }

  screenToSVG(screenPos: Coord): Coord {
    const CTM: SVGMatrix = this.CTM;
    const inverseCTM = CTM.inverse();
    const svgPos = screenPos.applyMatrix(inverseCTM);
    svgPos.y = svgPos.y * -1;
    return svgPos;
  }

  screenToSVGfromXY(screenX: number, screenY: number): Coord {
    return this.screenToSVG(new Coord(screenX, screenY));
  }

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

  handleBeforePan(oldPan: any, newPan: any) {
    if (
      NewGridComponent.debugGetJointState() == jointStates.dragging ||
      NewGridComponent.debugGetForceState() == forceStates.draggingStart ||
      NewGridComponent.debugGetForceState() == forceStates.draggingEnd
    ) {
      return oldPan;
    }
    return newPan;
  }

  handlePan() {
    this.updateVisibleCoords();
    this.verticalLines = [];
    let currentLine = Math.floor(this.viewBoxMinX / this.cellSize) * this.cellSize;
    while (currentLine < this.viewBoxMaxX) {
      if (currentLine === 0) {
        currentLine += this.cellSize;
        continue;
      }
      this.verticalLines.push(currentLine);
      currentLine += this.cellSize;
    }

    this.verticalLinesMinor = [];
    currentLine = Math.floor(this.viewBoxMinX / (this.cellSize / 4)) * (this.cellSize / 4);
    while (currentLine < this.viewBoxMaxX) {
      this.verticalLinesMinor.push(currentLine);
      currentLine += this.cellSize / 4;
    }

    this.horizontalLines = [];
    currentLine = Math.floor(this.viewBoxMinY / this.cellSize) * this.cellSize;
    while (currentLine < this.viewBoxMaxY) {
      if (currentLine === 0) {
        currentLine += this.cellSize;
        continue;
      }
      this.horizontalLines.push(currentLine);
      currentLine += this.cellSize;
    }

    this.horizontalLinesMinor = [];
    currentLine = Math.floor(this.viewBoxMinY / (this.cellSize / 4)) * (this.cellSize / 4);
    while (currentLine < this.viewBoxMaxY) {
      this.horizontalLinesMinor.push(currentLine);
      currentLine += this.cellSize / 4;
    }
  }

  handleZoom() {
    this.cellSize = this.defualtCellSize;
    const divisionSequnece: number[] = [2.5, 2, 2];
    let i = 0;
    while (this.cellSize * this.getZoom() > 200) {
      this.cellSize = this.cellSize / divisionSequnece[i % divisionSequnece.length];
      i++;
    }
    this.handlePan();
  }

  handleUpdatedCTM(newCTM: SVGMatrix) {
    this.CTM = newCTM;
  }

  zoomIn() {
    this.panZoomObject.zoomBy(1.3);
  }

  zoomOut() {
    this.panZoomObject.zoomBy(0.7);
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

  scaleToFitLinkage() {
    this.settingsService.tempGridDisable = true;
    setTimeout(() => {
      this.panZoomObject.updateBBox(); // Update viewport bounding box
      this.settingsService.tempGridDisable = false;
      NewGridComponent.instance.enableGridAnimationForThisAction();
      this.panZoomObject.fit();
      this.panZoomObject.center();
      this.zoomOut();
    }, 1);
  }
}
