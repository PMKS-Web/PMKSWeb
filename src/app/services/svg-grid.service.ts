import { Injectable } from '@angular/core';
// TS 6 no longer allows calling/constructing `import * as` namespaces of
// CommonJS (export =) modules - use default imports for these two.
import svgPanZoom from 'svg-pan-zoom';
import { Coord } from '../model/coord';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { SettingsService } from './settings.service';
import { DragStateService } from './drag-state.service';
import Hammer from 'hammerjs';

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
  private defualtCellSize: number = 10000;

  private cellSize: number = this.defualtCellSize;

  private panLockOut: boolean = false;

  private MAX_ZOOM: number = 3300;
  private MIN_ZOOM: number = 0.04;

  constructor(
    private settingsService: SettingsService,
    private dragState: DragStateService
  ) {}

  setNewElement(root: HTMLElement) {
    var eventsHandler;
    const dragState = this.dragState;

    eventsHandler = {
      haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
      init: function (options: any) {
        var instance = options.instance,
          initialScale = 1,
          pannedX = 0,
          pannedY = 0;

        // Init Hammer
        // Listen only for pointer and touch events
        this.hammer = new Hammer(options.svgElement, {
          inputClass: Hammer.TouchMouseInput,
        });

        // Enable pinch
        this.hammer.get('pinch').set({ enable: true });

        // Handle double tap
        this.hammer.on('doubletap', function (ev: any) {
          // instance.zoomIn();
        });

        // Handle tap (click) and no drag.
        this.hammer.on('tap', function (ev: any) {
          NewGridComponent.instance.handleTap();
        });

        // Handle pan
        this.hammer.on('panstart panmove', function (ev: any) {
          // The canvas may only pan while a pointer is genuinely down. Hammer
          // tracks that from events on the element it is bound to, and a
          // gesture whose target is destroyed mid-drag — a joint merged into
          // another, say — can leave it believing the press never ended, so it
          // would pan on every later move with no button held. The pointerup on
          // the root svg always lands, so the state machine is the authority.
          if (!dragState.isPointerDown) {
            pannedX = 0;
            pannedY = 0;
            return;
          }

          // On pan start reset panned variables
          if (ev.type === 'panstart') {
            pannedX = 0;
            pannedY = 0;
          }

          // Pan only the difference
          instance.panBy({ x: ev.deltaX - pannedX, y: ev.deltaY - pannedY });
          pannedX = ev.deltaX;
          pannedY = ev.deltaY;
        });

        // Handle pinch
        this.hammer.on('pinchstart pinchmove', function (ev: any) {
          // On pinch start remember initial zoom
          if (ev.type === 'pinchstart') {
            initialScale = instance.getZoom();
            instance.zoomAtPoint(initialScale * ev.scale, { x: ev.center.x, y: ev.center.y });
          }

          instance.zoomAtPoint(initialScale * ev.scale, { x: ev.center.x, y: ev.center.y });
        });

        // this.hammer.on('press', function (ev: any) {
        //   NewGridComponent.onContextMenu(ev.center.x, ev.center.y);
        // });

        // Prevent moving the page on some devices when panning over SVG
        options.svgElement.addEventListener('touchmove', function (e: TouchEvent) {
          e.preventDefault();
        });
      },

      destroy: function () {
        this.hammer.destroy();
      },
    };

    //This is like the constructor, and allows you to set the root element where the library is loaded
    this.panZoomObject = svgPanZoom(root, {
      zoomEnabled: true,
      fit: true,
      center: true,
      zoomScaleSensitivity: 0.15,
      dblClickZoomEnabled: false,
      maxZoom: 10000, //These are not used, look at MAX_ZOOM
      minZoom: 0.00001, //These are not used, look at MIN_ZOOM
      onPan: this.handlePan.bind(this),
      onZoom: this.handleZoom.bind(this),
      beforePan: this.handleBeforePan.bind(this),
      beforeZoom: this.handleBeforeZoom.bind(this),
      onUpdatedCTM: this.handleUpdatedCTM.bind(this),
      customEventsHandler: eventsHandler,
    });
    this.guardAgainstStuckPan(root);
    this.scaleToFitLinkage();
  }

  screenToSVG(screenPos: Coord): Coord {
    const CTM: SVGMatrix = this.CTM;
    //Temporary solution. Maybe okay to have...
    if (this.CTM === undefined) {
      return new Coord(0, 0);
    }
    const inverseCTM = CTM.inverse();
    const svgPos = screenPos.applyMatrix(inverseCTM);
    svgPos.y = svgPos.y * -1;
    return svgPos;
  }

  SVGtoScreen(svgPos: Coord): Coord {
    const CTM: SVGMatrix = this.CTM;
    //Temporary solution. Maybe okay to have...
    if (this.CTM === undefined) {
      return new Coord(0, 0);
    }
    const screenPos = svgPos.applyMatrix(CTM);
    // screenPos.y = screenPos.y * -1;
    return screenPos;
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
    // console.log(this.viewBoxMinY, this.viewBoxMaxY);
  }

  /**
   * Stop svg-pan-zoom panning a canvas nobody is holding.
   *
   * Its mouse listeners live on the root svg: `mousedown` puts it into a "pan"
   * state that only `mouseup` or `mouseleave` leaves, and every `mousemove`
   * until then drags the viewport. A release that never reaches this element
   * therefore leaves the canvas following the bare cursor. Chrome does re-aim a
   * release whose target was deleted mid-gesture at the nearest surviving
   * ancestor, so a joint merge alone does not lose one, but anything stacked
   * over the canvas that swallows the release would.
   *
   * Rather than chase the ways a release can go missing, hold the invariant it
   * exists to protect: a move carrying no held button cannot belong to a pan.
   * The button state on each move is the authority, so end the gesture at its
   * source before the library gets to act on it.
   *
   * `handleBeforePan` cannot host this test: by then a pan with no button held
   * is indistinguishable from `fit`, `center` and wheel zoom, which are all
   * legitimate.
   */
  private guardAgainstStuckPan(root: HTMLElement) {
    let gestureLive = false;
    // The release is watched on the root rather than on the window, because the
    // flag has to stay set for exactly the releases the library missed.
    root.addEventListener('mousedown', () => (gestureLive = true), true);
    root.addEventListener('mouseup', () => (gestureLive = false), true);
    // On the window, so this runs before the library's listener whatever the
    // move is aimed at: on the root itself the two would race by registration
    // order, and the library registered first.
    window.addEventListener(
      'mousemove',
      (event) => {
        if (!gestureLive || event.buttons !== 0) return;
        gestureLive = false;
        // Non-bubbling, so only the listeners on the root see it.
        root.dispatchEvent(new MouseEvent('mouseup', { bubbles: false }));
      },
      true
    );
  }

  handleBeforePan(oldPan: any, newPan: any) {
    if (this.panLockOut) {
      this.panLockOut = false;
      return oldPan;
    }

    // Any drag in flight owns the pointer. Asking the state machine rather than
    // enumerating the drag states is what keeps this correct as gestures are
    // added: link dragging panned the canvas underneath itself for exactly as
    // long as this list did not mention it, which made the drag look inert
    // because the content moved with the cursor.
    if (this.dragState.isDragging || NewGridComponent.getLastLeftClickType() === 'SynthesisPose') {
      return oldPan;
    }
    return newPan;
  }

  handlePan() {
    this.updateVisibleCoords();
    this.verticalLines = [];
    let currentLine = Math.floor(this.viewBoxMinX / this.cellSize) * this.cellSize;
    while (currentLine < this.viewBoxMaxX) {
      if (Math.abs(currentLine) < 0.001) {
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
      if (Math.abs(currentLine) < 0.001) {
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

    //Clean up the lines by rounding them to 2 decimal places
    this.verticalLines = this.verticalLines.map((line) => {
      return Math.round(line * 10000) / 10000;
    });
    this.horizontalLines = this.horizontalLines.map((line) => {
      return Math.round(line * 10000) / 10000;
    });
    this.verticalLinesMinor = this.verticalLinesMinor.map((line) => {
      return Math.round(line * 10000) / 10000;
    });
    this.horizontalLinesMinor = this.horizontalLinesMinor.map((line) => {
      return Math.round(line * 10000) / 10000;
    });

    // console.log(this.verticalLines);
    // console.log(this.verticalLinesMinor);
  }

  handleBeforeZoom(oldZoom: any, newZoom: any) {
    let isZoomingIn = newZoom > oldZoom;
    // console.log('handleBeforeZoom');
    // console.log(oldZoom, newZoom);
    // console.log(this.getZoom());
    if (isZoomingIn && this.getZoom() > this.MAX_ZOOM) {
      this.panLockOut = true;
      return false;
    } else if (!isZoomingIn && this.getZoom() < this.MIN_ZOOM) {
      this.panLockOut = true;
      return false;
    }
    return;
    // if (this.getZoom() < 0.4 || this.getZoom() > 330) {
    //   // this.panLockOut = true;
    //   return false;
    // } else {
    //   return true;
    // }
  }

  handleZoom(zoomLevel: number) {
    // console.log(this.getZoom());
    this.cellSize = this.defualtCellSize;
    const divisionSequnece: number[] = [2.5, 2, 2];
    let i = 0;
    while (this.cellSize * this.getZoom() > 200) {
      //This number is the maximum size of the cell, if it's any larger it will get sub-divided
      this.cellSize = this.cellSize / divisionSequnece[i % divisionSequnece.length];
      i++;
    }
    this.handlePan();
    if (this.getZoom() * this.settingsService.objectScale < 5) {
      NewGridComponent.sendNotification(
        'The visual size of the links might be too small. Try using the "Update Object Scale" button in the settings menu or use the "Reset View" button on the bottom right.',
        20000
      );
    }
    if (this.getZoom() * this.settingsService.objectScale > 200) {
      NewGridComponent.sendNotification(
        'The visual size of the links might be too large. Try using the "Update Object Scale" button in the settings menu.',
        20000
      );
    }
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

  updateObjectScale() {
    SettingsService._objectScale.next(Number((60 / this.getZoom()).toFixed(2)));
  }
}
