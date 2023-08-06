import { SvgGridService } from '../../services/svg-grid.service';
import { AfterViewInit, Component, HostListener, ViewChild } from '@angular/core';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MechanismService } from '../../services/mechanism.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { cMenuItem } from '../context-menu/context-menu.component';
import { Link, RealLink } from '../../model/link';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import {
  forceStates,
  gridStates,
  is_touch_enabled,
  has_mouse_pointer,
  jointStates,
  line_line_intersect,
  linkStates,
  local_storage_available,
  isInside,
  getDistance,
  AngleUnit,
} from '../../model/utils';
import { Force } from '../../model/force';
import { PositionSolver } from '../../model/mechanism/position-solver';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatMenuTrigger } from '@angular/material/menu';
import { CdkContextMenuTrigger, Menu } from '@angular/cdk/menu';
import { MatDialog } from '@angular/material/dialog';
import { TouchscreenWarningComponent } from '../MODALS/touchscreen-warning/touchscreen-warning.component';
import * as util from 'util';
import { Line } from '../../model/line';
import { ColorService } from '../../services/color.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
})
export class NewGridComponent {
  public static debugValue: any;
  static debugPoints: Coord[] = [];
  public static debugLines: Line[] = [];

  public originInScreen: Coord = new Coord(0, 0);
  private timeMouseDown: number = 0;

  constructor(
    public svgGrid: SvgGridService,
    public mechanismSrv: MechanismService,
    private urlParser: UrlProcessorService,
    public gridUtils: GridUtilsService,
    public settings: SettingsService,
    public activeObjService: ActiveObjService,
    private snackBar: MatSnackBar,
    public dialog: MatDialog,
    private colorService: ColorService,
    public nup: NumberUnitParserService
  ) {
    //This is for debug purposes, do not make anything else static!
    NewGridComponent.instance = this;
  }

  private svgGridElement!: HTMLElement;
  public cMenuItems: cMenuItem[] = [];
  public lastRightClick: Joint | Link | Force | String = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  public lastLeftClick: Joint | Link | Force | String = '';
  lastLeftClickType: string = 'Nothing';

  //TODO: These states should be a one stateMachine that is a service
  private gridStates: gridStates = gridStates.waiting;
  private jointStates: jointStates = jointStates.waiting;
  private linkStates: linkStates = linkStates.waiting;
  private forceStates: forceStates = forceStates.waiting;

  private jointTempHolderSVG!: SVGElement;
  private forceTempHolderSVG!: SVGElement;

  public showLinkLengthOverlay: boolean = false;
  public showLinkAngleOverlay: boolean = false;

  static instance: NewGridComponent;
  private lastNotificationTime: number = Date.now();
  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;
  mouseLocation: Coord = new Coord(0, 0);
  mouseLocationRaw: Coord = new Coord(0, 0);

  @ViewChild('trigger') contextMenu!: CdkContextMenuTrigger;

  ngOnInit() {
    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);

    let dismissWarning = local_storage_available() && localStorage.getItem('dismiss') === 'true';

    // Touchscreen warning for when no mouse pointer
    if (!dismissWarning && !has_mouse_pointer()) {
      this.dialog.open(TouchscreenWarningComponent);
    }

    fromEvent(window, 'resize').subscribe((event) => {
      // console.log('resize');
      this.svgGrid.panZoomObject.resize();
      // this.svgGrid.panZoomObject.fit();
      // this.svgGrid.panZoomObject.center();
      // this.svgGrid.panZoomObject.resize();
      this.svgGrid.handlePan();
      // console.log(this.svgGrid.getZoom());
      // this.svgGrid.panZoomObject.updateBBox();
      // this.svgGrid.scaleToFitLinkage();
    });

    this.activeObjService.onActiveObjChange.subscribe((obj) => {
      this.showLinkAngleOverlay = false;
      this.showLinkLengthOverlay = false;
      //Disable focus on any text input when changing active object
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  ngAfterViewInit() {
    this.jointTempHolderSVG = document.getElementById('jointTempHolder') as unknown as SVGElement;
    this.forceTempHolderSVG = document.getElementById('forceTempHolder') as unknown as SVGElement;
    this.svgGridElement = document.getElementsByClassName(
      'svg-pan-zoom_viewport'
    )[0] as HTMLElement;
  }

  static debugGetGridState() {
    return this.instance.gridStates;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetJointState() {
    return this.instance.jointStates;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetLinkState() {
    return this.instance.linkStates;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetForceState() {
    return this.instance.forceStates;
    //This is for debug purposes, do not make anything else static!
  }

  enableGridAnimationForThisAction() {
    this.svgGridElement.setAttribute('class', 'animated');
    //Disable after 0.5 seconds
    setTimeout(() => {
      this.svgGridElement.removeAttribute('class');
    }, 300);
  }

  updateContextMenuItems() {
    //Switch case based on what type the object is
    this.cMenuItems = [];
    // console.log(this.lastRightClick.constructor.name);
    switch (this.lastRightClick.constructor.name) {
      case 'Force':
        //Switch force direction, switch force local, delete Force
        this.cMenuItems.push(
          new cMenuItem(
            (this.lastRightClick as Force).local ? 'Make Force Global' : 'Make Force Local',
            this.mechanismSrv.changeForceLocal.bind(this.mechanismSrv),
            (this.lastRightClick as Force).local ? 'force_global' : 'force_local'
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Switch Force Direction',
            this.mechanismSrv.changeForceDirection.bind(this.mechanismSrv),
            'switch_force_dir'
          )
        );
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Force',
            this.mechanismSrv.deleteForce.bind(this.mechanismSrv),
            'remove'
          )
        );
        break;
      case 'RealLink':
        //Delete Link, Attach Link, Attach Tracer Point, Attach Joint
        //Don't give options if a fillet it selected and not a primary link
        if (
          !(this.lastRightClick as RealLink).isWelded ||
          (this.lastRightClick as RealLink).lastSelectedSublink != null
        ) {
          this.cMenuItems.push(
            new cMenuItem('Attach Tracer Point', this.addJoint.bind(this), 'add_tracer')
          );
          this.cMenuItems.push(
            new cMenuItem('Attach Link', this.createLink.bind(this), 'new_link')
          );
          this.cMenuItems.push(
            new cMenuItem('Attach Force', this.createForce.bind(this), 'add_force')
          );
        }
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Link',
            this.mechanismSrv.deleteLink.bind(this.mechanismSrv),
            'remove'
          )
        );
        break;
      case 'RevJoint':
        if (this.gridUtils.isAttachedToSlider(this.lastRightClick)) {
          this.cMenuItems.push(
            new cMenuItem(
              (this.gridUtils.getSliderJoint(this.lastRightClick as RealJoint) as RealJoint).input
                ? 'Remove Input'
                : 'Make Input',
              this.mechanismSrv.adjustInput.bind(this.mechanismSrv),
              (this.gridUtils.getSliderJoint(this.lastRightClick as RealJoint) as RealJoint).input
                ? 'remove_input'
                : 'add_input'
            )
          ); //Rev Joint Slider
        }
        this.cMenuItems.push(new cMenuItem('Attach Link', this.createLink.bind(this), 'new_link'));
        if ((this.lastRightClick as RealJoint).ground) {
          this.cMenuItems.push(
            new cMenuItem(
              'Remove Ground',
              this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
              'remove_ground'
            )
          ); //Rev Joint - Ground
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).input ? 'Remove Input' : 'Attach Input',
              this.mechanismSrv.adjustInput.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).input ? 'remove_input' : 'add_input'
            ) //Rev Joint - Input
          );
        } else {
          if (!this.gridUtils.isAttachedToSlider(this.lastRightClick)) {
            this.cMenuItems.push(
              new cMenuItem(
                'Ground Joint',
                this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
                'add_ground'
              )
            ); //Rev Joint - Not Ground
          }
        }
        this.cMenuItems.push(
          new cMenuItem(
            this.gridUtils.isAttachedToSlider(this.lastRightClick) ? 'Remove Slider' : 'Add Slider',
            this.mechanismSrv.toggleSlider.bind(this.mechanismSrv),
            this.gridUtils.isAttachedToSlider(this.lastRightClick) ? 'remove_slider' : 'add_slider'
          )
        ); //Rev Joint - Always
        if ((this.lastRightClick as RealJoint).canBeWeldedOrUnwelded()) {
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).isWelded ? 'Unweld Joint' : 'Weld Joint',
              this.mechanismSrv.toggleWeldedJoint.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).isWelded ? 'unweld_joint' : 'weld_joint'
            )
          ); //Rev Joint - Can be welded
        }
        if (
          !(this.lastRightClick as RealJoint).ground &&
          this.mechanismSrv.oneValidMechanismExists()
        ) {
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).showCurve ? 'Hide Path' : 'Show Path',
              () => {
                this.gridUtils.toggleCurve(this.lastRightClick);
              },
              (this.lastRightClick as RealJoint).showCurve ? 'hide_path' : 'show_path'
            )
          ); //Rev Joint - Not Ground and at least one valid mechanism exists
        }
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Joint',
            this.mechanismSrv.deleteJoint.bind(this.mechanismSrv),
            'remove'
          )
        );
        break;
      case 'String': //This means grid
        this.cMenuItems.push(new cMenuItem('Add Link', this.createLink.bind(this), 'new_link'));
    }
  }

  setLastRightClick(clickedObj: Joint | Link | String | Force, event?: MouseEvent) {
    this.lastRightClick = clickedObj;

    switch (clickedObj.constructor.name) {
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
    }

    this.updateContextMenuItems();
  }

  setLastLeftClick(clickedObj: Joint | Link | String | Force, event?: MouseEvent) {
    this.lastLeftClick = clickedObj;
    // console.warn('Last Left Click: ');
    // console.error(clickedObj.constructor.name);
    switch (clickedObj.constructor.name) {
      case 'Force':
        this.lastLeftClickType = 'Force';
        break;
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
      case 'PrisJoint':
      //Fall through intentional
      case 'RevJoint':
        this.lastLeftClickType = 'Joint';
        break;
      case 'String':
        this.lastLeftClickType = 'Grid';
        break;
      default:
        this.lastLeftClickType = 'Unknown';
        console.error('Unknown object type clicked: ' + clickedObj.constructor.name);
    }
    this.activeObjService.updateSelectedObj(clickedObj);
  }

  addJoint() {
    // const newJoint = this.createRevJoint()
    // const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    // const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    // TODO: Make sure you add logic within here so that joint is part of fixedLocations for respective link subset
    const coord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );

    this.mechanismSrv.addJointAt(coord);
  }

  createForce() {
    this.forceStates = forceStates.creating;
    this.gridStates = gridStates.createForce;
    this.forceTempHolderSVG.style.display = 'block';
    this.mechanismSrv.onMechUpdateState.next(3);
  }

  creatingForce($event: MouseEvent) {
    const startCoord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );
    const mousePos = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.forceTempHolderSVG.children[0].setAttribute(
      'd',
      'M ' + startCoord.x + ' ' + startCoord.y + ' L ' + mousePos.x + ' ' + mousePos.y
    );
    this.forceTempHolderSVG.children[1].setAttribute(
      'd',
      'M ' + startCoord.x + ' ' + startCoord.y + ' L ' + mousePos.x + ' ' + mousePos.y
    );
  }

  createLink() {
    // console.log('createLink');
    // console.log(this.lastRightClickCoord);
    const startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
    switch (this.lastRightClick.constructor.name) {
      case 'String':
        this.gridStates = gridStates.createJointFromGrid;
        break;
      case 'PrisJoint':
      case 'RevJoint':
        startCoord.x = this.activeObjService.selectedJoint.x;
        startCoord.y = this.activeObjService.selectedJoint.y;
        this.gridStates = gridStates.createJointFromJoint;
        this.jointStates = jointStates.creating;
        break;
      case 'RealLink':
        // TODO: Create logic for attaching a link onto a link
        this.gridStates = gridStates.createJointFromLink;
        this.linkStates = linkStates.creating;
        break;
      default:
        return;
    }
    // const mouseRawPos = this.getMousePosition($event);
    // if (mouseRawPos === undefined) {
    //   return;
    // }
    // const mousePos = this.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    // // TODO: Within future, create a tempJoint and temp Link and set those values as these values in order to avoid
    // // TODO: having to call setAttribute and have HTML update for you automatically
    // console.log(startCoord);
    this.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    this.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    this.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    this.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    this.jointTempHolderSVG.style.display = 'block';
    // this.onMechUpdateState.next(3);
  }

  mouseMove($event: MouseEvent) {
    this.originInScreen = this.svgGrid.SVGtoScreen(new Coord(0, 0));
    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);
    this.mouseLocationRaw = new Coord($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;

    switch (this.gridStates) {
      case gridStates.createForce:
      case gridStates.createJointFromGrid:
      case gridStates.createJointFromJoint:
      case gridStates.createJointFromLink:
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
        break;
    }
    switch (this.jointStates) {
      case jointStates.creating:
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
        break;
      case jointStates.dragging:
        if (AnimationBarComponent.animate) {
          this.sendNotification('Cannot edit while animation is running');
          return;
        }
        if (this.mechanismSrv.mechanismTimeStep !== 0) {
          this.sendNotification('Stop animation (or reset to 0 position) to edit');
          return;
        }

        //Break the timeout if the user is clearly trying to drag the joint
        if (getDistance(new Coord(this.startX, this.startY), new Coord($event.x, $event.y)) > 10) {
          this.timeMouseDown = 0;
        }
        //If it has been less than 1 seccond since the mouse was pressed down, ignore the drag
        if (this.timeMouseDown !== undefined && Date.now() - this.timeMouseDown < 100) {
          return;
        }
        this.activeObjService.selectedJoint = this.gridUtils.dragJoint(
          this.activeObjService.selectedJoint,
          mousePosInSvg
        );
        this.mechanismSrv.updateMechanism();
        //So that the panel values update continously
        this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
        if (this.mechanismSrv.mechanisms[0].joints[0].length !== 0) {
          if (this.mechanismSrv.mechanisms[0].dof === 1) {
            if (this.mechanismSrv.showPathHolder == false) {
              this.mechanismSrv.onMechUpdateState.next(1);
            }
            this.mechanismSrv.showPathHolder = true;
          }
        }
        break;
    }
    switch (this.linkStates) {
      case linkStates.creating:
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
        break;
    }
    switch (this.forceStates) {
      case forceStates.creating:
        this.creatingForce($event);
        break;
      case forceStates.draggingEnd:
        if (AnimationBarComponent.animate) {
          this.sendNotification('Cannot edit while animation is running');
          return;
        }
        if (this.mechanismSrv.mechanismTimeStep !== 0) {
          this.sendNotification('Stop animation (or reset to 0 position) to edit');
          return;
        }
        //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
        this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, false);
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        break;
      case forceStates.draggingStart:
        if (AnimationBarComponent.animate) {
          this.sendNotification('Cannot edit while animation is running');
          return;
        }
        if (this.mechanismSrv.mechanismTimeStep !== 0) {
          this.sendNotification('Stop animation (or reset to 0 position) to edit');
          return;
        }
        const fake_link = document.getElementById(this.activeObjService.selectedLink.id) as unknown;
        const link_svg = fake_link as SVGElement;
        const geo = fake_link as SVGGeometryElement;
        let isIn = false;
        if (geo.isPointInFill) {
          const fakeGrid = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          const svgp = fakeGrid.createSVGPoint();
          svgp.x = mousePosInSvg.x;
          svgp.y = mousePosInSvg.y;
          isIn = geo.isPointInFill(svgp);
        } else {
          isIn = isInside([mousePosInSvg.x, mousePosInSvg.y], geo.getAttribute('d')); //1634 in SVGFuncs.ts
        }
        // force is in link. Check to make sure that the force is not on top of a joint
        if (isIn) {
          this.activeObjService.selectedLink.joints.forEach((j) => {
            if (!(j instanceof RealJoint)) {
              return;
            }
            const x = j.x;
            const y = j.y;
            const r = this.settings.objectScale * j.r * 2;
            let dx = x - mousePosInSvg.x;
            let dy = y - mousePosInSvg.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= r) {
              isIn = false;
            }
          });
        }
        if (isIn) {
          //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
          this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, true);
        }
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        break;
    }
  }

  onContextMenu($event: MouseEvent) {
    if (AnimationBarComponent.animate == true) {
      this.sendNotification('Cannot open context menu while animating. Stop animation to edit');
      this.cMenuItems = [];
      return;
    }
    if (this.mechanismSrv.mechanismTimeStep !== 0) {
      this.sendNotification('Stop animation (or reset to 0 position) to edit');
      //Close the MatContextMenu
      // console.log(this.contextMenu);
      // this.contextMenu.close();
      return;
    }
    this.lastRightClickCoord.x = $event.clientX;
    this.lastRightClickCoord.y = $event.clientY;
    console.log('context menu');
    console.log(this.lastRightClickCoord);
  }

  mouseUp($event: MouseEvent) {
    //This is the mouseUp that is called no matter what is clicked on
    // TODO check for condition when a state was not waiting. If it was not waiting, then update the mechanism
    this.gridStates = gridStates.waiting;
    this.jointStates = jointStates.waiting;
    this.linkStates = linkStates.waiting;
    if (this.forceStates !== forceStates.waiting) {
      this.forceStates = forceStates.waiting;
      this.mechanismSrv.updateMechanism();
    }
    if (this.mechanismSrv.showPathHolder) {
      this.mechanismSrv.onMechUpdateState.next(2);
    }
    this.mechanismSrv.showPathHolder = false;
    // this.activeObjService.updateSelectedObj(thing);
  }

  mouseDown($event: MouseEvent) {
    // Log the time that the mouse was clicked
    this.timeMouseDown = new Date().getTime();
    // console.warn('mouseDown');
    // console.log(typeChosen);
    // console.log(thing);
    // $event.preventDefault();
    // $event.stopPropagation();
    // this.disappearContext();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    // console.log(this.startX, this.startY);
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // let clickPos = new Coord($event.pageX, $event.pageY);
        // let mousePosInSvg = this.svgGrid.screenToSVG(clickPos);
        // console.warn('Mouse down: ');
        // console.log(NewGridComponent.isInsideLink(this.mechanismSrv.links[0], mousePosInSvg));
        // console.warn(this.activeObjService.objType);
        switch (this.lastLeftClickType) {
          case 'Grid':
            switch (this.gridStates) {
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                if (this.mechanismSrv.links.length == 0) {
                  // console.log('first link');
                  this.svgGrid.updateObjectScale();
                  // console.log(this.svgGrid.panZoomObject);
                  // console.log(this.svgGrid.panZoomObject.getZoom().toFixed(2));
                  // console.log(Number((70 / this.svgGrid.panZoomObject.getZoom()).toFixed(2)));
                }

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.linkStates = linkStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromJoint:
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!
                );
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.jointStates = jointStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                  joint1.id
                );
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                if (
                  this.activeObjService.selectedLink.isWelded &&
                  this.activeObjService.selectedLink.lastSelectedSublink
                ) {
                  this.activeObjService.selectedLink.lastSelectedSublink.id =
                    this.activeObjService.selectedLink.lastSelectedSublink?.id.concat(joint1.id);
                  this.activeObjService.selectedLink.lastSelectedSublink.fixedLocations.push({
                    id: joint1.id,
                    label: joint1.id,
                  });
                  this.activeObjService.selectedLink.lastSelectedSublink.joints.push(joint1);
                }
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.activeObjService.selectedLink.d =
                  this.activeObjService.selectedLink.getPathString();
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.linkStates = linkStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createForce:
                const startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
                // const endCoordRaw = this.getMousePosition($event);
                const endCoord = this.svgGrid.screenToSVG(
                  new Coord($event.clientX, $event.clientY)
                );
                this.mechanismSrv.createForce(startCoord, endCoord);
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.forceStates = forceStates.waiting;
                this.forceTempHolderSVG.style.display = 'none';
                break;
            }
            break;
          case 'Joint':
            // this.jointXatMouseDown = thing.x;
            // this.jointYatMouseDown = thing.y;
            // Get the joint that was clicked on and top left of the rectangualr bounds
            switch (this.gridStates) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.activeObjService.selectedJoint;
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism();
                // PositionSolver.setUpSolvingForces(link.forces); // needed to determine force location when dragging a joint
                this.gridStates = gridStates.waiting;
                this.linkStates = linkStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromJoint:
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                // );

                joint2 = this.activeObjService.selectedJoint;
                let commonLinkCheck = false;
                // Make sure link is not being attached to the same link
                joint2.links.forEach((l) => {
                  if (commonLinkCheck) return;
                  if (
                    this.activeObjService.prevSelectedJoint.links.findIndex(
                      (li) => li.id === l.id
                    ) !== -1
                  ) {
                    commonLinkCheck = true;
                  }
                });
                if (commonLinkCheck) {
                  this.gridStates = gridStates.waiting;
                  this.jointStates = jointStates.waiting;
                  this.jointTempHolderSVG.style.display = 'none';
                  this.sendNotification("Don't link to a joint on the same link");
                  return;
                }
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.jointStates = jointStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
              case gridStates.createJointFromLink:
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint2 = this.activeObjService.selectedJoint;
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                link = new RealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism();
                this.gridStates = gridStates.waiting;
                this.linkStates = linkStates.waiting;
                this.jointTempHolderSVG.style.display = 'none';
                break;
            }
            switch (this.jointStates) {
              case jointStates.waiting:
                this.jointStates = jointStates.dragging;
                // this.selectedJoint = thing;
                break;
            }
            break;
          case 'Link':
            if (
              this.gridStates === gridStates.createJointFromGrid ||
              this.gridStates === gridStates.createJointFromJoint ||
              this.gridStates === gridStates.createJointFromLink
            ) {
              this.sendNotification(
                'Cannot link to a bar. Please create and select a tracer point on the link.'
              );
              this.gridStates = gridStates.waiting;
              this.jointStates = jointStates.waiting;
              this.jointTempHolderSVG.style.display = 'none';
            }
            break;
          case 'Force':
            console.log('force is last left click');
            switch (this.forceStates) {
              case forceStates.waiting:
                console.log(this.activeObjService.selectedForce);
                if (this.activeObjService.selectedForce.isStartSelected) {
                  this.forceStates = forceStates.draggingStart;
                } else if (this.activeObjService.selectedForce.isEndSelected) {
                  this.forceStates = forceStates.draggingEnd;
                }
            }
            break;
          case 'JointTemp':
            this.gridStates = gridStates.waiting;
            this.jointStates = jointStates.waiting;
            this.jointTempHolderSVG.style.display = 'none';
            this.sendNotification("Don't link a joint to itself");
        }
        break;
      // TODO: Be sure all things reset
      case 1: // Middle-Click
        this.gridStates = gridStates.waiting;
        this.jointStates = jointStates.waiting;
        this.linkStates = linkStates.waiting;
        this.forceStates = forceStates.waiting;
        this.jointTempHolderSVG.style.display = 'none';
        return;
      case 2: // Right-Click
        this.gridStates = gridStates.waiting;
        this.jointStates = jointStates.waiting;
        this.linkStates = linkStates.waiting;
        this.forceStates = forceStates.waiting;
        this.jointTempHolderSVG.style.display = 'none';
        break;
    }
  }

  static sendNotification(text: string, rateLimitMS?: number) {
    NewGridComponent.instance.sendNotification(text, rateLimitMS);
  }

  sendNotification(text: string, rateLimitMS?: number) {
    rateLimitMS = rateLimitMS || 1000; //Default to 1 second
    //If there is more than one notification in the last seccond, ingore all but the first
    if (this.lastNotificationTime + rateLimitMS < Date.now()) {
      this.lastNotificationTime = Date.now();
      this.snackBar.open(text, '', {
        panelClass: 'my-custom-snackbar',
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 4000,
      });
    }
  }

  debug() {
    console.log('debug');
  }

  handleTap() {
    if (this.lastLeftClick == 'grid') {
      console.log('tap on grid');
      this.activeObjService.updateSelectedObj(undefined);
    }
  }

  getFirstPosCoords(link: Link) {
    if (this.mechanismSrv.oneValidMechanismExists()) {
      const jointIndex = this.mechanismSrv.joints.indexOf(link.joints[0]);
      return this.mechanismSrv.mechanisms[0].joints[0][jointIndex];
    } else {
      return link.joints[0];
    }
  }

  getFirstXPos(link: Link) {
    return this.getFirstPosCoords(link).x;
  }

  getFirstYPos(link: Link) {
    return this.getFirstPosCoords(link).y;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    if (($event.ctrlKey || $event.metaKey) && $event.keyCode == 90) {
      //Ctrl + Z
      NewGridComponent.sendNotification(
        'You attempted to undo. What were you trying to undo? Please let us know through the report button in the help section.'
      );
    }

    if ($event.keyCode == 27) {
      //Escape Key
      // NewGridComponent.sendNotification(
      //   'You pressed the "Escape" key. What were you trying to do and in what context? (This is an Easter Egg. Please talk about in the final question of the survey.)'
      // );
      this.activeObjService.updateSelectedObj(undefined);
    }

    if ($event.keyCode == 46) {
      //Delete Key
      if (true) {
        //TODO: Sorry jacob you need to fix this it used to say: if(GridComponent.canDelete)
        if (this.activeObjService.objType === 'Grid') {
          NewGridComponent.sendNotification('Select an object to delete.');
          return;
        }
        if (this.activeObjService.objType === 'Joint') {
          this.mechanismSrv.deleteJoint();
        } else if (this.activeObjService.objType === 'Link') {
          this.mechanismSrv.deleteLink();
        }
        this.activeObjService.updateSelectedObj(undefined);
        NewGridComponent.sendNotification('Deleted Selected Object.');
      } else {
        return;
      }
    }
  }

  isRenderFail(link: Link) {
    return (link as RealLink).renderError;
  }

  returnDebugValue() {
    return NewGridComponent.debugValue;
  }

  getDebugPointX(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.x;
  }

  getDebugPointY(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.y;
  }

  getDebugPoints() {
    return NewGridComponent.debugPoints;
  }

  getDebugLines(): Line[] {
    return NewGridComponent.debugLines;
  }

  getSVGPerpendicularLine1() {
    //Return the SVG path of the line that is perpendicular to the first line and intersects the first line at the first joint
    //The line will be 1 unit long and will be centered at the first joint
    //It will act was an end cap for the line to represnet the lenght of the line
    let length = SettingsService.objectScale / 7;
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Find the slope of the original line
    let m1 = (y2 - y1) / (x2 - x1);

    //Find the slope of the perpendicular line
    let m2 = -1 / m1;

    //Find the angle of the perpendicular line
    let angle = Math.atan(m2);

    //Find the endpoints of the perpendicular line
    let x3 = x1 + length * Math.cos(angle);
    let y3 = y1 + length * Math.sin(angle);
    let x4 = x1 - length * Math.cos(angle);
    let y4 = y1 - length * Math.sin(angle);

    //Return the SVG path of the perpendicular line
    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPerpendicularLine2() {
    //Same as getSVGPerpendicularLine1 but for the second joint
    let length = SettingsService.objectScale / 7;
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    let m1 = (y2 - y1) / (x2 - x1);
    let m2 = -1 / m1;
    let angle = Math.atan(m2);

    let x3 = x2 + length * Math.cos(angle);
    let y3 = y2 + length * Math.sin(angle);
    let x4 = x2 - length * Math.cos(angle);
    let y4 = y2 - length * Math.sin(angle);

    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPrimaryAxisLine1() {
    //Return the SVG path of the line that is the primary axis
    //Cut the middle 1/3 of the line off, return two lines that are 1/3 of the length of the original line
    //Each line should start the joints
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Find the length of the original line
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1); //Use atan2 instead of atan

    //Find the coordinates of the points that divide the line into three equal parts
    let x3 = x1 + (length / 3) * Math.cos(angle);
    let y3 = y1 + (length / 3) * Math.sin(angle);

    //Return the SVG paths of the two lines that start from the joints and end at the middle points
    return 'M' + x1 + ' ' + y1 + ' L' + x3 + ' ' + y3;
  }

  getSVGPrimaryAxisLine2() {
    //Return the SVG path of the line that is the primary axis
    //Cut the middle 1/3 of the line off, return two lines that are 1/3 of the length of the original line
    //Each line should start the joints
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Find the length of the original line
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1); //Use atan2 instead of atan

    //Find the coordinates of the points that divide the line into three equal parts
    let x4 = x2 - (length / 3) * Math.cos(angle);
    let y4 = y2 - (length / 3) * Math.sin(angle);

    //Return the SVG paths of the two lines that start from the joints and end at the middle points
    return 'M' + x4 + ' ' + y4 + ' L' + x2 + ' ' + y2;
  }

  getSVGAngleOverlayLines() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 2;
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + lengthOfIndicator * Math.cos(angle);
    let y3 = y1 + lengthOfIndicator * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Return the SVG paths of the angle overlay without the arrow
    let line1 = 'M' + x3 + ' ' + y3 + ' L' + x1 + ' ' + y1;
    let line2 = ' M' + x1 + ' ' + y1 + ' L' + x4 + ' ' + y4;

    //Return the SVG path of the angle overlay with the arrow
    return line1 + line2;
  }

  getSVGAngleOverlayArc() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 1.8;
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + lengthOfIndicator * Math.cos(angle);
    let y3 = y1 + lengthOfIndicator * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Find the direction and flags for drawing the arc
    //Assume that we want to draw a quarter circle with radius equal to lengthOfIndicator
    let sweepFlag = angle > 0 ? 1 : 0;

    //Return the SVG paths of the angle overlay without the arrow
    let arc =
      ' M' +
      x4 +
      ' ' +
      y4 +
      ' A' +
      lengthOfIndicator +
      ' ' +
      lengthOfIndicator +
      ' ' +
      '90' +
      ' ' +
      0 +
      ' ' +
      sweepFlag +
      ' ' +
      x3 +
      ' ' +
      y3;

    //Return the SVG path of the angle overlay with the arrow
    return arc;
  }

  protected readonly AngleUnit = AngleUnit;

  getSVGAngleOverlayTextPos() {
    //Get the positon to put the angle label
    //It needs to be at the midpoint of the arc which goes from x axis to the primary axis
    //But with an offset so it's farther from the radius
    //Make sure to use atan2
    const offSetRadius = SettingsService.objectScale * 2;
    let link = this.activeObjService.selectedLink;
    let x1 = link.joints[0].x;
    let y1 = link.joints[0].y;
    let x2 = link.joints[1].x;
    let y2 = link.joints[1].y;

    //Calculate the angle between the x-axis and the primary axis
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Calculate the midpoint of the arc
    let midAngle = angle / 2;
    let midX = offSetRadius * Math.cos(midAngle);
    let midY = offSetRadius * Math.sin(midAngle);

    //Add the offset to the midpoint
    let labelX = midX + x1;
    let labelY = midY + y1;

    //Return an object with x and y properties
    return { x: labelX, y: labelY };
  }

  protected readonly RealJoint = RealJoint;

  secondJointIsGrounded(selectedLink: RealLink) {
    return (selectedLink.joints[1] as RealJoint).ground;
  }
}
