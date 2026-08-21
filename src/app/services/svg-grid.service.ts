import { afterNextRender, Injectable, Injector, inject } from '@angular/core';
// TS 6 no longer allows calling/constructing `import * as` namespaces of
// CommonJS (export =) modules - use default imports for these two.
import svgPanZoom from 'svg-pan-zoom';
import { Coord } from '../model/coord';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { SettingsService } from './settings.service';
import { DragStateService } from './drag-state.service';
import { NotificationService } from './notification.service';
import { MechanismService } from './mechanism.service';
import Hammer from 'hammerjs';
import { MODEL_SCALE } from '../model/render-scale';

/**
 * Minor lines to a major cell.
 *
 * Five, so the lines between two labels are whole units: the labels fall on
 * multiples of five, and at four divisions every line between them was a
 * quarter of whatever the label said.
 */
const MINOR_DIVISIONS = 5;
import { LengthUnit } from '../model/unit-enums';

/** One of each unit, in centimetres. The only ratio this file needs. */
const LENGTH_IN_CM: Record<LengthUnit, number> = {
  [LengthUnit.CM]: 1,
  [LengthUnit.METER]: 100,
  [LengthUnit.INCH]: 2.54,
  [LengthUnit.NULL]: 1,
};

@Injectable({
  providedIn: 'root',
})
export class SvgGridService {
  private settingsService = inject(SettingsService);
  private dragState = inject(DragStateService);
  private injector = inject(Injector);
  private notify = inject(NotificationService);

  /**
   * Where the cursor last was, in model units.
   *
   * Kept here rather than on the grid component so the status strip can read it
   * without reaching into a component to do so -- and so it survives the strip
   * and the grid being rebuilt independently.
   */
  public cursorAt: { x: number; y: number } | null = null;
  public panZoomObject!: SvgPanZoom.Instance;
  public CTM!: SVGMatrix;
  public viewBoxMinX: number = 0;
  public viewBoxMaxX: number = 0;
  public viewBoxMinY: number = 0;
  public viewBoxMaxY: number = 0;
  verticalLines: number[] = [];
  verticalLinesMinor: number[] = [];
  horizontalLines: number[] = [];
  horizontalLinesMinor: number[] = [];
  private defualtCellSize: number = 10000 * MODEL_SCALE;

  private cellSize: number = this.defualtCellSize;

  private panLockOut: boolean = false;

  // The same visual range as the old 3300/0.04, divided by MODEL_SCALE: model
  // coordinates are 200x larger, so the matrix is 200x smaller for the same
  // picture. Keeping MAX_ZOOM at ~16.5 is the guarantee that the compositor's
  // white-streak failure regime (matrix scale ≳450; verified clean at ≤11.3)
  // can never be zoomed into again.
  private MAX_ZOOM: number = 16.5;
  private MIN_ZOOM: number = 0.0002;

  setNewElement(root: HTMLElement) {
    var eventsHandler;
    const dragState = this.dragState;

    eventsHandler = {
      haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
      init: function (options: SvgPanZoom.CustomEventOptions) {
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
        this.hammer.on('doubletap', function (ev: HammerInput) {
          // instance.zoomIn();
        });

        // Handle tap (click) and no drag.
        this.hammer.on('tap', function (ev: HammerInput) {
          NewGridComponent.instance.handleTap();
        });

        // Handle pan
        this.hammer.on('panstart panmove', function (ev: HammerInput) {
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
        this.hammer.on('pinchstart pinchmove', function (ev: HammerInput) {
          // On pinch start remember initial zoom
          if (ev.type === 'pinchstart') {
            initialScale = instance.getZoom();
            instance.zoomAtPoint(initialScale * ev.scale, { x: ev.center.x, y: ev.center.y });
          }

          instance.zoomAtPoint(initialScale * ev.scale, { x: ev.center.x, y: ev.center.y });
        });

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
    this.scaleToFitLinkage(false);
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

  /**
   * Keep the drawing the same size on screen across a change of length unit.
   *
   * A unit change rescales the stored geometry, so without this the linkage
   * would appear to grow or shrink by the conversion factor. The settings panel
   * does this for a change the reader made; undo and redo replay a URL that can
   * carry the same change, and had no way to do it -- the geometry came back at
   * its old size through a viewport still zoomed for the new one, which is the
   * jump.
   */
  compensateForUnitChange(fromUnit: LengthUnit, toUnit: LengthUnit): void {
    if (fromUnit === toUnit || !this.panZoomObject) return;
    const origin = this.SVGtoScreen(new Coord(0, 0));
    this.panZoomObject.zoomAtPointBy(LENGTH_IN_CM[toUnit] / LENGTH_IN_CM[fromUnit], {
      x: origin.x,
      y: origin.y,
    });
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

  handleBeforePan(oldPan: SvgPanZoom.Point, newPan: SvgPanZoom.Point) {
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
    currentLine =
      Math.floor(this.viewBoxMinX / (this.cellSize / MINOR_DIVISIONS)) *
      (this.cellSize / MINOR_DIVISIONS);
    while (currentLine < this.viewBoxMaxX) {
      this.verticalLinesMinor.push(currentLine);
      currentLine += this.cellSize / MINOR_DIVISIONS;
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
    currentLine =
      Math.floor(this.viewBoxMinY / (this.cellSize / MINOR_DIVISIONS)) *
      (this.cellSize / MINOR_DIVISIONS);
    while (currentLine < this.viewBoxMaxY) {
      this.horizontalLinesMinor.push(currentLine);
      currentLine += this.cellSize / MINOR_DIVISIONS;
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
  }

  handleBeforeZoom(oldZoom: number, newZoom: number) {
    let isZoomingIn = newZoom > oldZoom;
    if (isZoomingIn && this.getZoom() > this.MAX_ZOOM) {
      this.panLockOut = true;
      return false;
    } else if (!isZoomingIn && this.getZoom() < this.MIN_ZOOM) {
      this.panLockOut = true;
      return false;
    }
    return;
  }

  handleZoom(zoomLevel: number) {
    this.cellSize = this.cellSizeFor(this.getZoom());
    this.handlePan();
    // Zooming is continuous, so these have a much longer quiet period than
    // anything else -- but their own, now. They used to share one timer with
    // every other message in the app, which meant they were silent for the
    // first twenty seconds of a session and for twenty seconds after any
    // unrelated message: the whole of the time somebody is finding their zoom.
    const drawnAt = this.getZoom() * this.settingsService.objectScale;
    // Both fixes are in this service, and the message used to name neither of
    // the buttons that hold them without offering either. Which one somebody
    // wants depends on which they think is wrong: "Fit to zoom" keeps the view
    // and resizes the drawing to suit it; "Reset view" keeps the drawing and
    // moves the view back to it.
    const fixes = [
      { label: 'Fit to zoom', run: () => this.updateObjectScale() },
      { label: 'Reset view', run: () => this.scaleToFitLinkage() },
    ];
    if (drawnAt < 5) {
      this.notify.warning(
        'zoom.links-tiny',
        'The links are drawn far smaller than the grid at this zoom.',
        { cooldownMs: 60000, actions: fixes }
      );
    }
    if (drawnAt > 200) {
      this.notify.warning(
        'zoom.links-huge',
        'The links are drawn far larger than the grid at this zoom.',
        { cooldownMs: 60000, actions: fixes }
      );
    }
  }

  /**
   * The spacing of the smallest square drawn on the grid.
   *
   * What "snap to grid" snaps to: the lines a reader can actually see, so a
   * joint lands where they are aiming rather than on a lattice the app knows
   * about and they do not.
   */
  get minorCellSize(): number {
    return this.cellSize / MINOR_DIVISIONS;
  }

  /**
   * The nearest corner of the drawn grid, if snapping is on.
   *
   * Off, suspended, or with no grid to snap to, the point is returned as it
   * came -- callers can use this unconditionally.
   *
   * `suspended` is the Option key, which already means "no help from the app"
   * while dragging: it is what turns off capturing a joint you drop on, and it
   * turns off the grid for the same gesture and the same reason.
   */
  snapToGrid(coord: Coord, suspended = false): Coord {
    const cell = this.minorCellSize;
    if (suspended || !this.settingsService.isSnapToGrid.value || !(cell > 0)) {
      return coord;
    }
    return new Coord(Math.round(coord.x / cell) * cell, Math.round(coord.y / cell) * cell);
  }

  /**
   * How far apart the labelled lines go at this zoom.
   *
   * One, two or five of whatever decade fits, which is the ladder every graph
   * paper and plotting library climbs: 0.5, 1, 2, 5, 10, 20, 50. Five minor
   * lines to a major, so the labelled lines land on round numbers and the
   * grid subdivides at a steady rate rather than in jumps.
   *
   * It used to halve and quarter its way down from a fixed starting size,
   * which is a one-two-four ladder: the labels came out on multiples of four
   * and the lines between them on quarters of whatever the label said.
   */
  private cellSizeFor(zoom: number): number {
    const MAX_MAJOR_PX = 200;
    const unitsPerMajor = MAX_MAJOR_PX / (zoom * MODEL_SCALE);
    if (!(unitsPerMajor > 0) || !Number.isFinite(unitsPerMajor)) {
      return this.defualtCellSize;
    }
    // The largest one, two or five of this decade that still fits the budget.
    const decade = 10 ** Math.floor(Math.log10(unitsPerMajor));
    const majorUnits = [5, 2, 1].find((step) => decade * step <= unitsPerMajor) ?? 1;
    return decade * majorUnits * MODEL_SCALE;
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

  /**
   * Frame the whole mechanism.
   *
   * Deferred to after the next render, because whatever asked for a fit is
   * usually the thing that just changed what there is to fit, and the bounding
   * box this measures does not exist until Angular has drawn it. That is a
   * thing Angular can be asked directly; it used to be guessed at with a timer,
   * and guessed generously, because a shared URL is decoded in
   * UrlProcessorService's own constructor — before there is any grid at all.
   *
   * `animate` is for a fit the user asked for by pressing the button: the
   * canvas glides so they can see what moved. A fit that merely follows a
   * mechanism arriving passes false, because there is nothing to show them yet
   * — animating that is a zoom-in on every single load.
   */
  scaleToFitLinkage(animate = true) {
    this.settingsService.tempGridDisable = true;
    // Rendered first, then fitted a task later. Fitting changes the zoom, and
    // the zoom is read by bindings that the render being waited on has already
    // checked — done inside it, Angular rightly calls that a value that changed
    // after it was checked. A zero-delay timer is a fresh change-detection
    // cycle, which is all that was ever wanted from the old one-second wait.
    afterNextRender(() => setTimeout(() => this.fitToLinkage(animate), 0), {
      injector: this.injector,
    });
  }

  private fitToLinkage(animate: boolean) {
    // Nothing to fit if the canvas has gone. Left unguarded this throws where
    // nothing is waiting to catch it, and the flag below stays stuck on — which
    // disables the grid for the rest of the session.
    if (!this.panZoomObject || !NewGridComponent.instance) {
      this.settingsService.tempGridDisable = false;
      return;
    }
    const restoreScenery = this.hideSceneryWhileMeasuring();
    this.panZoomObject.updateBBox(); // Update viewport bounding box
    restoreScenery();
    this.settingsService.tempGridDisable = false;
    if (animate) NewGridComponent.instance.enableGridAnimationForThisAction();
    this.panZoomObject.fit();
    this.panZoomObject.center();
    this.zoomOut();
  }

  /**
   * Take everything that is not the linkage out of the box this fit measures.
   *
   * `tempGridDisable` is meant to do this in the template, but afterNextRender
   * can land before Angular has acted on the flag -- which went unnoticed while
   * the only thing it hid was the grid ruling, drawn to the viewport and so
   * never bigger than the box anyway. A background image is as big as the user
   * made it, and a hundred-centimetre photograph got framed instead of the
   * linkage. Hidden straight on the element, so it is gone by the next
   * statement rather than by the next render.
   *
   * Centre-of-mass marks are in the list for the same reason. A mark is a
   * decoration a few pixels wide, but it sits wherever its link's centre of
   * mass is, and a hand-placed one can be anywhere at all -- a URL carrying a
   * point 90,000 units off framed that instead of the mechanism, at a zoom
   * where the whole linkage drew as a single pixel and every joint became
   * unclickable. What a reader wants to see is the machine, wherever its
   * marks happen to have been put.
   *
   * Tracer paths deliberately stay in: a curve that runs wider than the bars
   * is the thing being looked at.
   *
   * Returns the undo, to be called once the measurement is taken.
   */
  private hideSceneryWhileMeasuring(): () => void {
    const layers = [
      'backgroundImageHolder',
      'backgroundImageHandles',
      'backgroundImageGrips',
      'comTagHolder',
    ]
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    const was = layers.map((node) => node.style.display);
    layers.forEach((node) => (node.style.display = 'none'));
    return () => layers.forEach((node, index) => (node.style.display = was[index]));
  }

  updateObjectScale() {
    SettingsService._objectScale.next(Number((60 / this.getZoom()).toFixed(2)));
    // A link's outline is computed once and cached, and its width is a fraction
    // of this scale -- so a route that changes the scale has to say so, or the
    // bars stay the width they were while every joint, ground mark and arrow
    // around them changes size. The Settings panel does this from its own
    // field; this is the other way in, from the warning that offers it as a fix.
    this.injector.get(MechanismService).applyObjectScaleChange();
  }
}
