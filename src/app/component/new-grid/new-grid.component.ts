import { SvgGridService } from '../../services/svg-grid.service';
import { Component } from '@angular/core';
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
import { forceStates, gridStates, jointStates, linkStates } from '../../model/utils';
import { Force } from '../../model/force';
import { PositionSolver } from '../../model/mechanism/position-solver';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { GridComponent } from '../grid/grid.component';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
})
export class NewGridComponent {
  constructor(
    public svgGrid: SvgGridService,
    public mechanismSrv: MechanismService,
    private urlParser: UrlProcessorService,
    public gridUtils: GridUtilsService,
    public settings: SettingsService,
    public activeObjService: ActiveObjService,
    private snackBar: MatSnackBar
  ) {
    //This is for debug purposes, do not make anything else static!
    NewGridComponent.instance = this;
  }

  public cMenuItems: cMenuItem[] = [];
  public lastRightClick: Joint | Link | Force | String = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  //TODO: These states should be a one stateMachine that is a service
  private gridStates: gridStates = gridStates.waiting;
  private jointStates: jointStates = jointStates.waiting;
  private linkStates: linkStates = linkStates.waiting;
  private forceStates: forceStates = forceStates.waiting;

  private jointTempHolderSVG!: SVGElement;
  private forceTempHolderSVG!: SVGElement;

  private static instance: NewGridComponent;
  private lastNotificationTime: number = Date.now();
  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;

  //This is for debug purposes, do not make anything else static!

  ngOnInit() {
    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);

    fromEvent(window, 'resize')
      .pipe(debounceTime(25))
      .subscribe((event) => {
        console.log('resize');
        this.svgGrid.panZoomObject.resetZoom();
        this.svgGrid.panZoomObject.resize();
        this.svgGrid.panZoomObject.center();
      });
  }

  ngAfterViewInit() {
    this.jointTempHolderSVG = document.getElementById('jointTempHolder') as unknown as SVGElement;
    this.forceTempHolderSVG = document.getElementById('forceTempHolder') as unknown as SVGElement;
  }

  static getLinkWidthSettingStaticly() {
    return this.instance.settings.linkWidth.value;
    //This is for debug purposes, do not make anything else static!
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

  updateContextMenuItems() {
    //Switch case based on what type the object is
    this.cMenuItems = [];
    console.log(this.lastRightClick.constructor.name);
    switch (this.lastRightClick.constructor.name) {
      case 'Force':
        //Swtich force direction, switch force local, delete Force
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Force',
            this.mechanismSrv.deleteForce.bind(this.mechanismSrv),
            'remove'
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
            (this.lastRightClick as Force).local ? 'Make Force Global' : 'Make Force Local',
            this.mechanismSrv.changeForceLocal.bind(this.mechanismSrv),
            (this.lastRightClick as Force).local ? 'force_global' : 'force_local'
          )
        );
        break;
      case 'RealLink':
        //Delete Link, Attach Link, Attach Tracer Point, Attach Joint
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Link',
            this.mechanismSrv.deleteLink.bind(this.mechanismSrv),
            'remove'
          )
        );
        this.cMenuItems.push(
          new cMenuItem('Attach Force', this.createForce.bind(this), 'add_force')
        );
        this.cMenuItems.push(new cMenuItem('Attach Link', this.createLink.bind(this), 'new_link'));
        this.cMenuItems.push(
          new cMenuItem('Attach Tracer Point', this.addJoint.bind(this), 'add_tracer')
        );
        break;
      case 'PrisJoint':
      //Fall through intentional
      case 'RevJoint':
        this.cMenuItems.push(
          new cMenuItem(
            'Delete Joint',
            this.mechanismSrv.deleteJoint.bind(this.mechanismSrv),
            'remove'
          )
        );
        this.cMenuItems.push(new cMenuItem('Attach Link', this.createLink.bind(this), 'new_link'));
        if ((this.lastRightClick as RealJoint).ground) {
          this.cMenuItems.push(
            new cMenuItem(
              'Remove Ground',
              this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
              'remove_ground'
            )
          );
          this.cMenuItems.push(
            new cMenuItem(
              (this.lastRightClick as RealJoint).input ? 'Remove Input' : 'Make Input',
              this.mechanismSrv.toggleInput.bind(this.mechanismSrv),
              (this.lastRightClick as RealJoint).input ? 'remove_input' : 'add_input'
            )
          );
        } else {
          this.cMenuItems.push(
            new cMenuItem(
              'Add Ground',
              this.mechanismSrv.toggleGround.bind(this.mechanismSrv),
              'add_ground'
            )
          );
        }
        this.cMenuItems.push(
          new cMenuItem(
            this.lastRightClick instanceof PrisJoint ? 'Remove Slider' : 'Add Slider',
            this.mechanismSrv.toggleSlider.bind(this.mechanismSrv),
            this.lastRightClick instanceof PrisJoint ? 'remove_slider' : 'add_slider'
          )
        );

        break;
      case 'String': //This means grid
        this.cMenuItems.push(new cMenuItem('Add Link', this.createLink.bind(this), 'new_link'));
    }
  }

  setLastRightClick(clickedObj: Joint | Link | String | Force) {
    this.lastRightClick = clickedObj;
    this.updateContextMenuItems();
  }

  addJoint() {
    // const newJoint = this.createRevJoint()
    // const screenX = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('x'));
    // const screenY = Number(GridComponent.contextMenuAddTracerPoint.children[0].getAttribute('y'));
    const coord = this.svgGrid.screenToSVGfromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );
    // TODO: Add logic to add joint to selectedLink. Also, add adjacent joint to tracer joint
    const newId = this.mechanismSrv.determineNextLetter();
    const newJoint = new RevJoint(newId, coord.x, coord.y);
    this.activeObjService.selectedLink.joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      j.connectedJoints.push(newJoint);
      newJoint.connectedJoints.push(j);
    });
    newJoint.links.push(this.activeObjService.selectedLink);
    this.activeObjService.selectedLink.joints.push(newJoint);
    this.activeObjService.selectedLink.id += newJoint.id;
    this.activeObjService.selectedLink.d = RealLink.getD(this.activeObjService.selectedLink.joints);
    this.mechanismSrv.joints.push(newJoint);
    this.mechanismSrv.updateMechanism();
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
      Force.createForceLine(startCoord, mousePos)
    );
    this.forceTempHolderSVG.children[1].setAttribute(
      'd',
      Force.createForceArrow(startCoord, mousePos)
    );
  }

  createLink() {
    console.log('createLink');
    console.log(this.lastRightClickCoord);
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
    console.log(startCoord);
    this.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    this.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    this.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    this.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    this.jointTempHolderSVG.style.display = 'block';
    // this.onMechUpdateState.next(3);
  }

  mouseMove($event: MouseEvent) {
    // console.warn('mouseMove');
    // console.log(typeChosen);
    // $event.preventDefault();
    // $event.stopPropagation();
    // TODO: Possibly put this somewhere else so don't have to copy/paste?
    // const rawCoord = this.getMousePosition($event)!;
    // const trueCoord = this.screenToGrid(rawCoord.x, -1 * rawCoord.y);
    // this.screenCoord =
    //   '(' + roundNumber(trueCoord.x, 1) + ' , ' + roundNumber(trueCoord.y, 1) + ')';
    const mousePosInSvg = this.svgGrid.screenToSVGfromXY($event.clientX, $event.clientY);

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
      // case linkStates.dragging:
      //   // TODO: Add logic when dragging a link within edit shape mode
      //
      //   const offsetX = mousePosInSvg.x - this.initialLinkMouseCoord.x;
      //   const offsetY = mousePosInSvg.y - this.initialLinkMouseCoord.y;
      //   this.initialLinkMouseCoord.x = mousePosInSvg.x;
      //   this.initialLinkMouseCoord.y = mousePosInSvg.y;
      //   this.selectedLink.d = RealLink.getD(this.selectedLink.joints);
      //   this.selectedLink.CoM = RealLink.determineCenterOfMass(this.selectedLink.joints);
      //   this.updateMechanism();
      //   break;
      // case linkStates.resizing:
      //   // Adjust the link's bounding boxes
      //   let b1n,
      //     b2n,
      //     b3n,
      //     b4n,
      //     arrow5n: Coord = new Coord(0, 0)!;
      //
      //   let drag_coord_x, side_coord_x_1, side_coord_x_2: number;
      //   let drag_coord_y, side_coord_y_1, side_coord_y_2: number;
      //
      //   let arrow5n_x, arrow5n_y: number;
      //
      //   let m1, closest_m, m2, m3, m4, m5: number;
      //   let b1, closest_b, b2, b3, b4, b5: number;
      //
      //   const typeOfBoundToCoordMap = new Map<string, Coord>();
      //
      //   // TOOD: Put this within function call to do all this logic
      //   const fixedCoord = typeOfBoundToCoordMap.get('fixed')!;
      //   const dragCoord = typeOfBoundToCoordMap.get('drag')!;
      //   const sideCoord1 = typeOfBoundToCoordMap.get('sideCoord1')!;
      //   const sideCoord2 = typeOfBoundToCoordMap.get('sideCoord2')!;
      //
      //   // determine line from b1 to b3
      //
      //   m1 = determineSlope(fixedCoord.x, fixedCoord.y, dragCoord.x, dragCoord.y);
      //   b1 = determineYIntersect(fixedCoord.x, fixedCoord.y, m1);
      //   // determine the point within this line that is closest to where the mouse is
      //   closest_m = -1 * Math.pow(m1, -1);
      //   closest_b = determineYIntersect(trueCoord.x, trueCoord.y, closest_m);
      //   // closest_b = determineYIntersect(newBound.x, newBound.y, closest_m);
      //   drag_coord_x = determineX(closest_m, closest_b, m1, b1);
      //   drag_coord_y = determineY(drag_coord_x, closest_m, closest_b);
      //   // determine the other 2 points
      //   m2 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord1.x, sideCoord1.y);
      //   b2 = determineYIntersect(fixedCoord.x, fixedCoord.y, m2);
      //   m3 = determineSlope(dragCoord.x, dragCoord.y, sideCoord1.x, sideCoord1.y);
      //   b3 = determineYIntersect(drag_coord_x, drag_coord_y, m3);
      //   side_coord_x_1 = determineX(m2, b2, m3, b3);
      //   side_coord_y_1 = determineY(side_coord_x_1, m2, b2);
      //
      //   m4 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord2.x, sideCoord2.y);
      //   b4 = determineYIntersect(fixedCoord.x, fixedCoord.y, m4);
      //   m5 = determineSlope(dragCoord.x, dragCoord.y, sideCoord2.x, sideCoord2.y);
      //   b5 = determineYIntersect(drag_coord_x, drag_coord_y, m5);
      //   side_coord_x_2 = determineX(m4, b4, m5, b5);
      //   side_coord_y_2 = determineY(side_coord_x_2, m4, b4);
      //
      //   this.selectedLink.CoM = RealLink.determineCenterOfMass(this.selectedLink.joints);
      //   this.selectedLink.updateCoMDs();
      //   break;
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
        //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
        this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, true);
        break;
    }
  }

  onContextMenu($event: MouseEvent) {
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

    //This is for more targeted mouseUp evnets, only one should be called for each object
    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // console.warn('mouseUp');
        // console.log(typeChosen);
        // console.log(thing);
        // console.log(this.activeObjService.objType);
        let clickOnlyWithoutDrag: boolean = false;

        const diffX = Math.abs($event.pageX - this.startX);
        const diffY = Math.abs($event.pageY - this.startY);
        if (diffX < this.delta && diffY < this.delta) {
          clickOnlyWithoutDrag = true;
        }

        switch (this.activeObjService.objType) {
          case 'Grid':
            if (clickOnlyWithoutDrag) {
              this.activeObjService.updateSelectedObj(undefined);
            }
            break;
          case 'Joint':
            //If the animation is running or the mechansim is not at t=0, don't allow selection
            // if (AnimationBarComponent.animate === true) {
            //   return;
            // }
            // if (GridComponent.mechanismTimeStep !== 0) {
            //   return;
            // }
            // this.activeObjService.updateSelectedObj(thing);
            // GridComponent.canDelete = true;

            if (clickOnlyWithoutDrag) {
              //Revert the joint to its original position
              // console.warn('click only without drag');
              // if (thing.x !== this.jointXatMouseDown || thing.y !== this.jointYatMouseDown) {
              //   // console.warn('Diff exsits');
              //   this.gridUtils.dragJoint(
              //     thing,
              //     new Coord(this.jointXatMouseDown, this.jointYatMouseDown)
              //   );
              //   // this.activeObjService.updateSelectedObj(thing);
              //   this.mechanismSrv.onMechUpdateState.next(0);
              // }
            }
            break;
          default:
            // GridComponent.canDelete = true;
            //If the animation is running or the mechansim is not at t=0, don't allow selection
            // if (AnimationBarComponent.animate === true) {
            //   return;
            // }
            // if (GridComponent.mechanismTimeStep !== 0) {
            //   return;
            // }
            // this.activeObjService.updateSelectedObj(thing);
            break;
        }
        break;
    }
  }

  mouseDown($event: MouseEvent) {
    console.warn('mouseDown');
    // console.log(typeChosen);
    // console.log(thing);
    // $event.preventDefault();
    // $event.stopPropagation();
    // this.disappearContext();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        console.warn(this.activeObjService.objType);
        switch (this.activeObjService.objType) {
          case 'Grid':
            switch (this.gridStates) {
              case gridStates.createJointFromGrid:
                console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
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
                // console.warn('reset position');
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
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
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.activeObjService.selectedLink.d = RealLink.getD(
                  this.activeObjService.selectedLink.joints
                );
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
                // TODO: Be sure the force added is at correct position for binary link
                const force = new Force(
                  'F' + (this.mechanismSrv.forces.length + 1).toString(),
                  this.activeObjService.selectedLink,
                  startCoord,
                  endCoord
                );
                this.activeObjService.selectedLink.forces.push(force);
                this.mechanismSrv.forces.push(force);
                PositionSolver.setUpSolvingForces(this.activeObjService.selectedLink.forces); // needed to determine force position when dragging a joint
                // PositionSolver.setUpInitialJointLocations(this.selectedLink.joints);
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
            switch (this.gridStates) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.jointTempHolderSVG.children[0].getAttribute('x1')!,
                  this.jointTempHolderSVG.children[0].getAttribute('y1')!
                );
                joint2 = this.activeObjService.prevSelectedJoint;
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
            // if (this.gridStates === gridStates.createJointFromGrid) {
            //   this.sendNotification(
            //     'Cannot link to a bar. Please create and select a tracer point on the link.'
            //   );
            //   this.gridStates = gridStates.waiting;
            //   this.jointStates = jointStates.waiting;
            //   this.jointTempHolderSVG.style.display = 'none';
            // }
            break;
          case 'Force':
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

  static sendNotification(text: string) {
    NewGridComponent.instance.sendNotification(text);
  }

  sendNotification(text: string) {
    //If there is more than one notification in the last seccond, ingore all but the first
    if (this.lastNotificationTime + 1000 < Date.now()) {
      this.lastNotificationTime = Date.now();
      this.snackBar.open(text, '', {
        panelClass: 'my-custom-snackbar',
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 4000,
      });
    }
  }
}
