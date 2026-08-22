import { afterNextRender, DestroyRef, Injectable, Injector, inject } from '@angular/core';
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
import { DEFAULT_OBJECT_SCALE } from '../model/object-scale';
import {
  Rect,
  centerOf,
  drawingScreenBox,
  fitsInside,
  freeCanvasRect,
  sameRect,
} from './view-framing';
import { SelectedTabService } from '../selected-tab.service';
import { CHROME_MOVED } from '../model/chrome-motion';

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

/**
 * How much of the free canvas a fit fills.
 *
 * A margin all round, rather than the flat 30% shrink that a `fit()` followed
 * by a `zoomOut()` used to leave: that number was chosen to clear a toolbar
 * that has not existed for two layouts, and it was measured against the window
 * rather than against the part of it the drawing can be seen in.
 */
const FIT_FILL = 0.86;

/**
 * The layers a fit is about.
 *
 * The grid ruling and the axes are drawn to the viewport, so they are always
 * exactly as big as the window: a bounding box that includes them cannot be
 * fitted to anything. Ordered as they are drawn, which is only for reading.
 */
const DRAWING_LAYERS = [
  'railHolder',
  'jointBGHolder',
  'motorHolder',
  'linkHolder',
  'sliderHolder',
  'jointHolder',
  'pathsHolder',
  'forcesHolder',
  // Synthesis is drawing too: in that mode the positions being designed for are
  // often the only thing on the canvas, and a fit that could not see them
  // framed an empty grid and left them off the side of it.
  'synthesis',
] as const;

/**
 * How big a drawn mark is, as a fraction of the mechanism's larger dimension.
 *
 * Read off the drawings rather than picked: the wiper is 12.8 units across and
 * the scale a new project starts at draws its joints at 0.7, and the Jansen leg
 * is 126 units across and its author chose 7 -- both a twentieth of the
 * mechanism, from two people who never discussed it. Anything derived from the
 * zoom instead would make the size of a joint depend on the size of the window,
 * which is a property of the drawing depending on a property of the reader.
 */
const MARK_FRACTION = 0.055;

/**
 * How far off that a scale has to be before it is worth overriding.
 *
 * Wide, because the point is to fix the drawings the default is obviously
 * wrong for rather than to have an opinion about every one. An ordinary
 * mechanism lands within a few per cent of the default and must keep it
 * exactly -- both because it is right, and because a scale that drifted on
 * every load would churn the URL.
 */
const SCALE_SLACK = 2.5;

/** How many pixels a mark is drawn at when only the view is being fitted to. */
const MARK_TARGET_PX = 60;

/** How far a drawing may hang out of the free canvas before it counts as lost. */
const OVERHANG_SLACK = 8;

/**
 * How far inside the free canvas a point has to be to count as on screen.
 *
 * A position exactly on the edge is a position half of which is not there, and
 * the mark drawn at one is bigger than the point it stands for.
 */
const REVEAL_MARGIN = 48;

/**
 * How long to watch the chrome before framing around where it ended up.
 *
 * A panel takes about a third of a second to glide, and the mode says it has
 * changed before Angular has started moving it -- so a rect that looks settled
 * in the first few frames is only one that has not begun to move.
 */
const SETTLE_STABLE_FRAMES = 3;
const SETTLE_MIN_MS = 360;
const SETTLE_MAX_MS = 900;

@Injectable({
  providedIn: 'root',
})
export class SvgGridService {
  private settingsService = inject(SettingsService);
  private dragState = inject(DragStateService);
  private injector = inject(Injector);
  private notify = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

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
    this.restoreMissingPointerDown(root);
    this.releaseGesturesOnLostPointer();
    this.watchTheChrome();
    this.scaleToFitLinkage(false);
  }

  /**
   * End a canvas gesture the canvas never saw end.
   *
   * A press that goes down on the drawing can come up anywhere -- over a panel,
   * outside the window, or not at all if the browser cancels it. The canvas
   * hears `pointerup` only on itself, so those releases went unheard and the
   * gesture stayed live: the pan guard kept refusing to pan and the search
   * stayed frozen mid-drag until something else was clicked.
   *
   * On the window, and in the capture phase, so it runs wherever the release
   * lands and whatever else claims it.
   */
  private releaseGesturesOnLostPointer(): void {
    const release = () => NewGridComponent.instance?.releaseCanvasGestures();
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
  }

  /**
   * Hand the wheel to whatever gesture wants it, or give it back to the zoom.
   *
   * Synthesis turns the position it is about to drop with the wheel, and the
   * library binds its own wheel listener to the same element -- so asking it to
   * stand down is the only way to stop the canvas zooming under the gesture.
   * Through the library's own API rather than by swallowing the event, because
   * a swallowed event depends on which listener was registered first.
   */
  setWheelZoomEnabled(enabled: boolean): void {
    if (!this.panZoomObject) return;
    if (enabled === this.panZoomObject.isMouseWheelZoomEnabled()) return;
    if (enabled) this.panZoomObject.enableMouseWheelZoom();
    else this.panZoomObject.disableMouseWheelZoom();
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
    // Through `ourOwnMove`, because this is the app holding a view still across
    // a change of units rather than the reader choosing a new one: read as a
    // choice it would throw away a fit that is still perfectly fitted.
    this.ourOwnMove(() =>
      this.panZoomObject.zoomAtPointBy(LENGTH_IN_CM[toUnit] / LENGTH_IN_CM[fromUnit], {
        x: origin.x,
        y: origin.y,
      })
    );
  }

  /**
   * Carry the remembered view across a change in the size of the window.
   *
   * A view somebody drove to keeps the share of the canvas it had, so it scales
   * with the window. Nothing to do for a view a fit put there: that one is
   * framed afresh instead, and there is nothing written down to scale.
   */
  private growChosenView(growth: number): void {
    const held = this.chosenView;
    if (growth === 1 || !held) return;
    this.chosenView = {
      zoom: this.clampZoom(held.zoom * growth),
      offset: { x: held.offset.x * growth, y: held.offset.y * growth },
    };
  }

  /** Whatever the view was is now whatever the reader just made it. */
  private forgetChosenView(): void {
    this.viewIsFitted = false;
    this.chosenView = null;
  }

  /**
   * Run a view change the app is making on the reader's behalf.
   *
   * The library calls back into handlePan and handleZoom while these run, and
   * those are also how a wheel or a drag arrives. Flagged so the two can be
   * told apart: a view the app moved is still a view nobody chose. Public,
   * because the settings panel compensates for a unit change from its own side.
   */
  ourOwnMove(change: () => void): void {
    const was = this.movingTheViewOurselves;
    this.movingTheViewOurselves = true;
    try {
      change();
    } finally {
      this.movingTheViewOurselves = was;
    }
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

  /**
   * Give back the `pointerdown` Safari owes us after a native menu closes.
   *
   * The canvas is driven entirely by pointer events -- the root's own handler
   * and every joint, link and force binding are `(pointerdown)` -- while
   * svg-pan-zoom listens for `mousedown`. Normally the pair arrive together and
   * in that order, so whichever one the gesture belongs to claims it.
   *
   * Safari breaks the pair exactly once after dismissing a native `<select>`
   * popup: the next press arrives as a bare `mousedown` with no `pointerdown`
   * before it. Traced from the failing gesture, the whole of it:
   *
   *     pointerdown SELECT, mousedown SELECT      (popup opens; no release)
   *     mousedown path#AB                         (no pointerdown!)
   *     pointerup path#AB, mouseup path#AB
   *
   * So the library saw a press the app never did: nothing armed a drag, and the
   * canvas panned under a cursor that was holding a link. The press after that
   * is paired again, which is why a click "wakes it up" and hides the cause.
   *
   * Rather than teach every binding to accept either event -- and then dedupe
   * the pair on the browsers that send both -- put the missing event back at
   * its source. Dispatched during capture, before the mousedown reaches
   * anything, so handlers still see pointerdown first and in the right order;
   * every existing binding then works as written.
   */
  private restoreMissingPointerDown(root: HTMLElement) {
    let pressOpened = false;
    const opened = () => (pressOpened = true);
    const closed = () => (pressOpened = false);
    root.addEventListener('pointerdown', opened, true);
    root.addEventListener('pointerup', closed, true);
    root.addEventListener('pointercancel', closed, true);
    // Not every gesture ends in a pointerup -- a release outside the canvas
    // ends one without it -- so the mouse release clears the flag too.
    root.addEventListener('mouseup', closed, true);
    root.addEventListener(
      'mousedown',
      (event: MouseEvent) => {
        if (pressOpened) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        target.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            button: event.button,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          })
        );
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
    // Synthesis runs its gestures outside the state machine -- a position is a
    // question about a machine, not part of one -- so it is asked separately.
    // It used to be recognised by what was last clicked, which never stopped
    // being a pose: the canvas could not be panned again until something else
    // was selected.
    if (this.dragState.isDragging || NewGridComponent.isSynthesisGestureLive()) {
      return oldPan;
    }
    return newPan;
  }

  handlePan() {
    if (!this.movingTheViewOurselves) this.forgetChosenView();
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
    if (!this.movingTheViewOurselves) this.forgetChosenView();
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

  /**
   * The buttons zoom about the middle of the free canvas rather than the middle
   * of the window, which is where the library puts it. Zooming about a point
   * behind the panel walked a centred drawing sideways under it, a little
   * further with every press.
   */
  zoomIn() {
    this.panZoomObject.zoomAtPointBy(1.3, this.zoomAnchor());
  }

  zoomOut() {
    this.panZoomObject.zoomAtPointBy(0.7, this.zoomAnchor());
  }

  private zoomAnchor(): SvgPanZoom.Point {
    const canvas = this.canvasBounds();
    const free = this.freeRect();
    if (!canvas || !free) return { x: 0, y: 0 };
    const middle = centerOf(free);
    return { x: middle.x - canvas.x, y: middle.y - canvas.y };
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
   * Frame the drawing in the part of the canvas it can actually be seen in.
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
   *
   * Either way it is also where the drawn marks get a size to suit the result:
   * a Jansen leg is nearly two metres across, and joints drawn at the size a
   * new project starts with come out as specks. Only when the author never
   * chose a size of their own -- a drawing that carries one means it.
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

  /**
   * Wait out whatever the canvas is already doing, then frame it.
   *
   * Anything that measures the drawing has to let a glide finish first: mid
   * transition the transform attribute already reads as the destination while
   * the picture is still on its way there, and a measurement taken between the
   * two lands the drawing where neither of them meant.
   */
  private fitToLinkage(animate: boolean) {
    // Nothing to fit if the canvas has gone. Left unguarded this throws where
    // nothing is waiting to catch it, and the flag below stays stuck on — which
    // disables the grid for the rest of the session.
    if (!this.panZoomObject || !NewGridComponent.instance) {
      this.settingsService.tempGridDisable = false;
      return;
    }
    this.settingsService.tempGridDisable = false;
    if (this.settlePending) {
      // Framed against a panel that is still sliding, this would land in the
      // wrong place and be corrected a moment later.
      this.queuedFit = animate;
      return;
    }
    NewGridComponent.instance.afterGlide(() => this.frameDrawing(animate));
  }

  /**
   * Put the drawing in the middle of the free canvas at the size that fills it.
   *
   * Nothing happens when there is nothing drawn, which is not a failure -- an
   * empty grid has no frame to find, and the view it already has is as good as
   * any other.
   */
  private frameDrawing(animate: boolean): void {
    const free = this.freeRect();
    const drawn = this.measureDrawing();
    if (!free) return;
    if (!drawn || !(drawn.width > 0) || !(drawn.height > 0)) {
      // Nothing drawn is still a view worth resetting: somebody who has panned
      // an empty grid off into the corner pressed this to come back.
      this.moveViewTo(
        { x: 0, y: 0, width: 0, height: 0 },
        centerOf(free),
        this.clampZoom(MARK_TARGET_PX / this.settingsService.objectScale),
        animate
      );
      this.viewIsFitted = true;
      this.chosenView = null;
      return;
    }
    this.settledFree = free;
    const target = this.clampZoom(
      Math.min((free.width * FIT_FILL) / drawn.width, (free.height * FIT_FILL) / drawn.height)
    );
    if (this.scaleSuitedTo(drawn) !== undefined) {
      // In a task of its own. The mark size is read by bindings that whatever
      // led here has already checked -- a fit can be asked for from inside a
      // form's own value change -- and writing it during that render is a value
      // changing after it was checked. The marks are a different size
      // afterwards, so what was just measured is not what will be on screen;
      // the frame follows once Angular has drawn them.
      setTimeout(() => {
        this.adoptScaleForDrawing(drawn);
        this.scaleToFitLinkage(animate);
      });
      return;
    }
    this.moveViewTo(drawn, centerOf(free), target, animate);
    this.viewIsFitted = true;
    // A fit supersedes whatever the reader had driven to: they have just asked
    // for something else. Holding the old view would let a later squeeze hand
    // it back as though it were still theirs. `rescueFrame` puts it back where
    // the fit was the app's idea rather than a request.
    this.chosenView = null;
  }

  /**
   * Send the view to a zoom, with a given model box landing on a given point.
   *
   * `drawn` is in model units and `at` in client pixels, which is the one
   * conversion this file has to do. The library applies a new matrix on the
   * next animation frame rather than on the call, so nothing here reads the
   * canvas back after moving it -- a second fit in the same frame would
   * otherwise measure a picture that had not moved yet and correct for a move
   * it had already asked for. That is the whole reason the box comes in as a
   * parameter instead of being measured again.
   */
  private moveViewTo(
    drawn: Rect,
    at: { x: number; y: number },
    targetZoom: number,
    animate: boolean
  ): void {
    const canvas = this.canvasBounds();
    if (!canvas) return;
    const center = centerOf(drawn);

    if (animate) NewGridComponent.instance?.enableGridAnimationForThisAction();
    this.ourOwnMove(() => {
      this.setZoom(targetZoom);
      // A refused zoom locks the next pan out, and the pan is the half of this
      // that must not be dropped.
      this.panLockOut = false;
      this.panZoomObject.pan({
        x: at.x - canvas.x - targetZoom * center.x,
        y: at.y - canvas.y - targetZoom * center.y,
      });
    });
  }

  /**
   * Whether the view is where a fit put it, rather than where somebody drove it.
   *
   * The difference between a drawing that is *being shown whole* and one that
   * happens to fit: the first should go on being shown whole when the chrome
   * around it changes shape, growing back when a drawer closes as readily as it
   * shrank when the drawer opened; the second is a zoom somebody chose and must
   * be left alone. Asking whether the drawing fits cannot tell them apart -- a
   * reader zoomed out to look at the space around a linkage fits too.
   */
  private viewIsFitted = false;
  private movingTheViewOurselves = false;

  /**
   * The view somebody drove the canvas to, held on to while the chrome is
   * standing in front of it.
   *
   * A drawer opening over a drawing that was zoomed in on one joint has to move
   * it out of the way, and sometimes draw it smaller to do so -- but that is
   * the chrome's doing, not a new choice, so it is given back the moment there
   * is room for it again. Cleared by the next pan or zoom the reader makes,
   * which is a new choice and supersedes it.
   */
  private chosenView: { zoom: number; offset: { x: number; y: number } } | null = null;

  /**
   * Give the drawn marks a size to suit the mechanism, if nobody has chosen one.
   * Returns whether anything changed.
   *
   * A Jansen leg is nearly two metres across and its joints at the size a new
   * project starts with come out as specks -- which is what the "links are
   * drawn far smaller than the grid" warning was firing on load to say.
   *
   * Only when nobody has chosen a size. Typing 0.7 into the field is a choice
   * even though 0.7 is what the field already said, so the act of choosing is
   * recorded rather than inferred from the number -- see
   * SettingsService.objectScaleChosen. For a drawing that arrives from a URL
   * the act is not recoverable, since every URL carries a scale whether or not
   * its author picked one, and the comparison with the default is what is left.
   */
  private scaleSuitedTo(drawn: Rect): number | undefined {
    if (SettingsService.objectScaleChosen) return undefined;
    // Only for a drawing with parts in it. This number is how joints, blocks
    // and arrows are drawn, and a synthesis design has none of those -- its
    // bars are the question rather than an answer. Sizing marks for a mechanism
    // that does not exist yet gets it wrong twice: once now, and again when a
    // solution is inserted and every joint comes out matching a design that was
    // never a linkage.
    if (this.injector.get(MechanismService).joints.length === 0) return undefined;
    const scale = this.settingsService.objectScale;
    if (Math.abs(scale - DEFAULT_OBJECT_SCALE) > 0.5) return undefined;
    const suits = MARK_FRACTION * Math.max(drawn.width, drawn.height);
    if (!(suits > 0) || !Number.isFinite(suits)) return undefined;
    const ratio = suits / scale;
    if (ratio < SCALE_SLACK && ratio > 1 / SCALE_SLACK) return undefined;
    return Number(suits.toFixed(2));
  }

  private adoptScaleForDrawing(drawn: Rect): void {
    const suits = this.scaleSuitedTo(drawn);
    if (suits === undefined) return;
    SettingsService._objectScale.next(suits);
    // A link's outline is computed once and cached, and its width is a fraction
    // of this scale, so a route that changes it has to say so.
    this.injector.get(MechanismService).applyObjectScaleChange();
  }

  /** The canvas's own top-left in client pixels, which `pan` is measured from. */
  private canvasBounds(): Rect | null {
    const canvas = document.getElementById('canvas');
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    return { x: box.left, y: box.top, width: box.width, height: box.height };
  }

  private freeRect(): Rect | null {
    const canvas = document.getElementById('canvas');
    return canvas ? freeCanvasRect(canvas) : null;
  }

  /**
   * The drawing's box in model units, with the scenery this fit is not about
   * hidden.
   *
   * Measured on screen and divided back by the matrix that drew it, rather than
   * asked for as a `getBBox`: a joint is a nested `<svg>` that overflows its
   * own 20x20 box, so the bounding box the browser reports for the layers is
   * not the ink the reader sees. The matrix is read off the canvas, not off the
   * library, so it is the one those client rects were measured under even when
   * the library has a newer one waiting for the next frame.
   */
  private measureDrawing(): Rect | null {
    const restoreScenery = this.hideSceneryWhileMeasuring();
    const box = drawingScreenBox(DRAWING_LAYERS);
    restoreScenery();
    const canvas = this.canvasBounds();
    const drawnUnder = (
      document.querySelector('svg#canvas > g') as SVGGElement | null
    )?.getCTM();
    if (!box || !canvas || !drawnUnder || !(drawnUnder.a > 0) || !(drawnUnder.d > 0)) return null;
    return {
      x: (box.x - canvas.x - drawnUnder.e) / drawnUnder.a,
      y: (box.y - canvas.y - drawnUnder.f) / drawnUnder.d,
      width: box.width / drawnUnder.a,
      height: box.height / drawnUnder.d,
    };
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, zoom));
  }

  /** svg-pan-zoom counts zoom from the viewBox; everything here counts pixels. */
  private setZoom(realZoom: number): void {
    const sizes = this.panZoomObject.getSizes();
    const perUnit = sizes.realZoom / this.panZoomObject.getZoom();
    if (!(perUnit > 0)) return;
    this.panZoomObject.zoom(realZoom / perUnit);
  }

  /**
   * Keep the drawing framed when the chrome around it moves.
   *
   * Called for everything that changes the shape of the free canvas without
   * anybody touching the view: the window being resized, a mode change -- which
   * both widens the panel and brings the transport in or out -- and the drawer
   * over the right of the canvas.
   *
   * What it does is the least it can. A view somebody drove to keeps its size
   * and its place relative to the space it is being seen in; the zoom changes
   * only where holding it would take the drawing out of sight, and is given
   * back the moment there is room for it again. A view a fit put there stays
   * fitted, which is what makes a drawer opening and closing symmetrical.
   */
  notifyChromeChanged(alreadyMoved = false, growth = 1): void {
    if (this.settlePending) {
      // A resize heard while the last one is still settling still counts. The
      // window size it was measured against has already been written down, so
      // a ratio dropped here can never be recovered -- and a run of resize
      // events at frame rate is the ordinary way a window gets dragged, so this
      // is the common case rather than the corner. The settle already running
      // reads the remembered view afresh on every frame and will follow it.
      this.growChosenView(growth);
      return;
    }
    if (!this.panZoomObject || !NewGridComponent.instance) return;
    this.settlePending = true;

    const startedAt = performance.now();
    const drawn = this.measureDrawing();
    const shown = drawn && this.screenBoxOf(drawn);
    const matrix = this.drawnMatrix();
    // A resize is heard once the window has already changed, so sampling from
    // where the chrome is now would find it settled on the first frame and the
    // view would never be moved at all. Started from where it was when the view
    // was last put somewhere, so an instantaneous change is followed exactly
    // like a panel gliding into place.
    let previous = alreadyMoved ? (this.settledFree ?? this.freeRect()) : this.freeRect();
    // Where the drawing sits relative to the space it is being seen in. Held,
    // not corrected: somebody who has panned to look at one corner keeps that
    // corner, and the view merely follows the chrome that moved.
    const offset =
      shown && previous
        ? { x: centerOf(shown).x - centerOf(previous).x, y: centerOf(shown).y - centerOf(previous).y }
        : null;
    // Judged against where the chrome was when the view was last settled, not
    // against where it is now: a resize is only heard once the window has
    // already changed, so asking whether the drawing fits the rect it is about
    // to be fitted to always answers no.
    const before = this.settledFree ?? previous;
    const wasFramed = !!(shown && before && fitsInside(shown, before, OVERHANG_SLACK));
    const stayFramed = this.viewIsFitted;
    // The view to hold on to while the chrome moves. Whatever the reader last
    // drove the canvas to, which may be from before an earlier squeeze -- so a
    // drawer opening over a drawer does not lose the view under both of them.
    if (!stayFramed && !this.chosenView && matrix && offset) {
      this.chosenView = { zoom: matrix.a, offset };
    }
    // Grown *after* the view is taken down, never before: on the way into a
    // resize the canvas has not moved yet, so what is captured is the view for
    // the window that has just gone and growth is what expresses it for the
    // window that has arrived. Applied before the capture instead, a shrink
    // that had nothing remembered yet scaled nothing while the matching grow
    // scaled what the shrink had since written down -- and the round trip came
    // back a size out.
    this.growChosenView(growth);
    let stable = 0;
    // A window resize is heard once the window has already changed, so the
    // chrome has moved before this is called and there is nothing to wait for.
    // Only a mode change needs the floor below, because Angular has not begun
    // animating the panel by the time the mode says it changed.
    let everMoved = alreadyMoved;

    const step = () => {
      const now = this.freeRect();
      const held = sameRect(previous, now);
      stable = held ? stable + 1 : 0;
      everMoved = everMoved || !held;
      // Followed frame by frame rather than waited out: the panel takes about a
      // third of a second to glide, and a view that holds still for all of it
      // and then glides itself reads as two separate movements with a pause in
      // between. Moved straight, with no transition of its own, the drawing
      // travels with the panel.
      if (!sameRect(previous, now) && now && drawn && matrix) {
        // A drawing that is being shown whole goes on being shown whole, which
        // is what makes the drawer symmetrical: it draws smaller as the drawer
        // takes the canvas from the right and grows back as the drawer leaves.
        const held = stayFramed ? null : this.chosenView;
        const at = held && {
          x: centerOf(now).x + held.offset.x,
          y: centerOf(now).y + held.offset.y,
        };
        const landing = held &&
          at && {
            x: at.x - (drawn.width * held.zoom) / 2,
            y: at.y - (drawn.height * held.zoom) / 2,
            width: drawn.width * held.zoom,
            height: drawn.height * held.zoom,
          };
        // A view somebody drove to is put back exactly whenever there is room
        // for it, and only stood aside from while there is not -- so a drawer
        // that pushed a zoomed-in reader out of the way gives their view back
        // on the way out, rather than leaving them at whatever it squeezed
        // them down to.
        if (held && at && landing && (!wasFramed || fitsInside(landing, now, OVERHANG_SLACK))) {
          this.moveViewTo(drawn, at, held.zoom, false);
        } else {
          const target = this.clampZoom(
            Math.min((now.width * FIT_FILL) / drawn.width, (now.height * FIT_FILL) / drawn.height)
          );
          this.moveViewTo(drawn, centerOf(now), target, false);
        }
      }
      previous = now;
      // Once the chrome has been seen to move, it stopping is the whole answer.
      // The floor is only there for the wait before it starts: a mode says it
      // has changed before Angular has begun animating the panel, and a rect
      // that looks settled in those first frames is one that has not begun.
      const waited = performance.now() - startedAt;
      const done = everMoved ? stable >= SETTLE_STABLE_FRAMES : waited > SETTLE_MIN_MS;
      if (done || waited > SETTLE_MAX_MS) {
        this.settlePending = false;
        this.settledFree = now;
        this.finishSettle({ free: now, drawn, wasFramed });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private settlePending = false;
  private lastWindowSize = { width: 0, height: 0 };
  /** Where the chrome stood the last time the view was put somewhere. */
  private settledFree: Rect | null = null;
  /** A fit asked for while the chrome was still moving, run once it stops. */
  private queuedFit: boolean | null = null;

  /**
   * Settle the view once the chrome has stopped moving.
   *
   * A fit somebody pressed for mid-transition wins outright -- it is a fresh
   * instruction about where the view should be, and running it against a panel
   * that was still sliding is what made Reset glide twice with a pause.
   *
   * Otherwise the zoom is left alone. Somebody looking closely at one joint
   * should not be zoomed out for opening a panel. The two exceptions: a window
   * that changed size takes the view with it, so the drawing keeps the share of
   * the canvas it had and a resize is its own undo; and a drawing that was
   * framed and now would not fit is framed again, because that is the one case
   * where holding the zoom loses part of the mechanism.
   */
  private finishSettle(settle: {
    free: Rect | null;
    drawn: Rect | null;
    wasFramed: boolean;
  }): void {
    const fit = this.queuedFit;
    this.queuedFit = null;
    if (fit !== null) {
      this.frameDrawing(fit);
      return;
    }
    const { free, drawn } = settle;
    if (!free || !drawn) return;

    // The tracking above has already put the view where it belongs -- at the
    // remembered one if there is room for it, framed if there is not. All that
    // is left is the case it cannot see: a drawing that was whole in view and
    // no longer is, which is the one place holding the zoom loses part of the
    // mechanism.
    const shown = this.screenBoxOf(drawn);
    if (settle.wasFramed && shown && !fitsInside(shown, free, OVERHANG_SLACK)) {
      this.rescueFrame();
    }
  }

  /**
   * Frame the drawing without claiming anybody asked to see the whole of it.
   *
   * A fit that rescues a drawing the chrome was about to squeeze out of sight
   * is the app keeping a view usable until there is room for it again, not a
   * request. Read as a request it would take the view away for good: the first
   * window that got smaller would end the reader's zoom, and growing the window
   * back would frame the drawing rather than give their zoom back.
   */
  private rescueFrame(): void {
    const held = this.chosenView;
    this.frameDrawing(true);
    if (held) {
      this.viewIsFitted = false;
      this.chosenView = held;
    }
  }

  /**
   * Bring a point on the drawing into view, if it is not already there.
   *
   * For something that arrives without anybody having pointed at it -- a
   * synthesis position typed into the panel rather than dropped on the canvas,
   * which can name any coordinate at all, including one off the side of the
   * window. Nothing happens when the point is already on screen: somebody
   * nudging a number for a thing right in front of them should not have the
   * view move under the keystroke.
   */
  revealOnCanvas(at: Coord): void {
    const free = this.freeRect();
    const canvas = this.canvasBounds();
    const matrix = this.drawnMatrix();
    if (!free || !canvas || !matrix) return;
    // The drawing layers carry the grid's own y-flip and the matrix does not:
    // +y is up on the drawing and down on the screen.
    const x = canvas.x + matrix.a * at.x + matrix.e;
    const y = canvas.y + matrix.d * -at.y + matrix.f;
    const inView =
      x >= free.x + REVEAL_MARGIN &&
      x <= free.x + free.width - REVEAL_MARGIN &&
      y >= free.y + REVEAL_MARGIN &&
      y <= free.y + free.height - REVEAL_MARGIN;
    if (!inView) this.scaleToFitLinkage(true);
  }

  /** The matrix the canvas is drawn under right now, which may be a frame old. */
  private drawnMatrix(): DOMMatrix | null {
    const viewport = document.querySelector('svg#canvas > g') as SVGGElement | null;
    const matrix = viewport?.getCTM();
    return matrix && matrix.a > 0 && matrix.d > 0 ? matrix : null;
  }

  /** Where a model box currently sits on screen, in client pixels. */
  private screenBoxOf(box: Rect): Rect | null {
    const canvas = this.canvasBounds();
    const matrix = this.drawnMatrix();
    if (!canvas || !matrix) return null;
    return {
      x: canvas.x + matrix.e + matrix.a * box.x,
      y: canvas.y + matrix.f + matrix.d * box.y,
      width: matrix.a * box.width,
      height: matrix.d * box.height,
    };
  }

  /** Follow the chrome that moves on its own: the window, and the mode. */
  private watchingChrome = false;

  private watchTheChrome(): void {
    // The canvas can be built more than once in a session; the service it talks
    // to is built once, and a second set of listeners would run a second settle
    // loop against the same view.
    if (this.watchingChrome) return;
    this.watchingChrome = true;
    this.lastWindowSize = { width: window.innerWidth, height: window.innerHeight };
    const onResize = () => {
      // The view somebody drove to goes with the window, so a drawing keeps the
      // share of the canvas it had. Measured off the window rather than off the
      // free rect, because by the time a resize is heard the free rect has
      // already changed and there is nothing left to compare it against; and
      // the geometric mean of the two sides rather than the smaller of them, so
      // shrinking a window and pulling it back out lands on the zoom it started
      // at -- taking the smaller each way multiplies to less than one, and every
      // round trip left the drawing a little smaller than it was found.
      //
      // Applied to the remembered view rather than to what is on screen, so a
      // shrink that had to frame the drawing to keep it in sight still gives
      // the reader's own zoom back when the window grows again.
      const was = this.lastWindowSize;
      this.lastWindowSize = { width: window.innerWidth, height: window.innerHeight };
      const growth =
        was.width > 0 && was.height > 0
          ? Math.sqrt(
              (this.lastWindowSize.width / was.width) * (this.lastWindowSize.height / was.height)
            )
          : 1;
      this.notifyChromeChanged(true, growth);
    };
    window.addEventListener('resize', onResize);
    // Late, and through the injector: the tab service reaches the mechanism,
    // which reaches back here.
    const following = this.injector
      .get(SelectedTabService)
      .tabChanged.subscribe(() => this.notifyChromeChanged());
    // The drawer over the right of the canvas. It used to be left alone as
    // transient furniture, on the argument that a view which jumped away and
    // back for it would be worse than one that let it overlap -- but a drawer
    // that covers the mechanism is not something a reader can read around, and
    // the move is small: the drawing slides left ahead of it, and only zooms
    // out if sliding would take it under the panel on the other side.
    const chrome = CHROME_MOVED.subscribe(() => this.notifyChromeChanged());
    // A root service outlives everything in an ordinary session, but not a test
    // harness or a hot reload -- and a listener that outlives its service goes
    // on measuring a canvas that has gone.
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      following.unsubscribe();
      chrome.unsubscribe();
      this.watchingChrome = false;
    });
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
    // Only ever pressed by hand -- from Settings, or from the zoom warning that
    // offers it -- so it is somebody saying what size they want.
    SettingsService.objectScaleChosen = true;
    SettingsService._objectScale.next(Number((MARK_TARGET_PX / this.getZoom()).toFixed(2)));
    // A link's outline is computed once and cached, and its width is a fraction
    // of this scale -- so a route that changes the scale has to say so, or the
    // bars stay the width they were while every joint, ground mark and arrow
    // around them changes size. The Settings panel does this from its own
    // field; this is the other way in, from the warning that offers it as a fix.
    this.injector.get(MechanismService).applyObjectScaleChange();
  }
}
