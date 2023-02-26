import { SvgGridService } from '../../services/svg-grid.service';
import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MatMenuTrigger } from '@angular/material/menu';
import { MechanismService } from '../../services/mechanism.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { cMenuItem } from '../context-menu/context-menu.component';
import { Link, RealLink } from '../../model/link';
import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  determineSlope,
  determineYIntersect,
  determineX,
  determineY,
} from '../../model/utils';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';

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
    public activeObjService: ActiveObjService
  ) {}

  public cMenuItems: cMenuItem[] = [];
  public lastRightClick: Joint | Link | String = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  //TODO: These states should be a stateMachine that is a service
  private gridStates: gridStates = gridStates.waiting;
  private jointStates: jointStates = jointStates.waiting;
  private linkStates: linkStates = linkStates.waiting;
  private forceStates: forceStates = forceStates.waiting;

  private jointTempHolderSVG!: SVGElement;

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
  }

  updateContextMenuItems() {
    //Switch case based on what type the object is
    this.cMenuItems = [];
    // console.log(this.lastRightClick.constructor.name);
    switch (this.lastRightClick.constructor.name) {
      case 'RealLink':
        //Delete Link, Attach Link, Attach Tracer Point, Attach Joint
        this.cMenuItems.push(
          new cMenuItem('Delete Link', () => console.log('Delete Link'), 'delete')
        );
        this.cMenuItems.push(
          new cMenuItem('Attach Link', () => console.log('Attach Link'), 'edit')
        );
        this.cMenuItems.push(
          new cMenuItem('Attach Tracer Point', () => console.log('Attach Tracer Point'), 'edit')
        );
        this.cMenuItems.push(
          new cMenuItem('Attach Joint', () => console.log('Attach Joint'), 'edit')
        );
        break;
      case 'PrisJoint':
      //Fall through intentional
      case 'RevJoint':
        this.cMenuItems.push(
          new cMenuItem('Delete Joint', () => console.log('Delete Joint'), 'delete')
        );
        if ((this.lastRightClick as RealJoint).ground) {
          this.cMenuItems.push(
            new cMenuItem('Remove Ground', () => console.log('Remove Ground'), 'delete')
          );
        } else {
          this.cMenuItems.push(
            new cMenuItem('Add Ground', () => console.log('Set Ground'), 'delete')
          );
        }
        if ((this.lastRightClick as RealJoint).input) {
          this.cMenuItems.push(
            new cMenuItem('Remove Input', () => console.log('Remove Input'), 'delete')
          );
        } else {
          this.cMenuItems.push(
            new cMenuItem('Add Input', () => console.log('Set Input'), 'delete')
          );
        }
        if (this.lastRightClick instanceof PrisJoint) {
          this.cMenuItems.push(
            new cMenuItem('Remove Slider', () => console.log('Set Prismatic'), 'delete')
          );
        } else {
          this.cMenuItems.push(
            new cMenuItem('Add Slider', () => console.log('Set Slider'), 'delete')
          );
        }
        break;
      case 'String': //This means grid
        this.cMenuItems.push(new cMenuItem('Add Link', this.createLink.bind(this), 'add'));
    }
  }

  setLastRightClick(clickedObj: Joint | Link | String) {
    if (this.lastRightClick !== clickedObj) {
      this.lastRightClick = clickedObj;
      this.updateContextMenuItems();
    }
  }

  createLink() {
    console.log('createLink');
    console.log(this.lastRightClickCoord);
    let startCoord = this.svgGrid.screenToSVG(this.lastRightClickCoord);
    switch (this.lastRightClick.constructor.name) {
      case 'String':
        this.gridStates = gridStates.createJointFromGrid;

        break;
      // case 'PrisJoint':
      // case 'RevJoint':
      //   startCoord.x = GridComponent.selectedJoint.x;
      //   startCoord.y = GridComponent.selectedJoint.y;
      //   this.gridStates = gridStates.createJointFromJoint;
      //   this.jointStates = jointStates.creating;
      //   break;
      // case 'RealLink':
      //   // TODO: Create logic for attaching a link onto a link
      //   startX = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('x'));
      //   startY = Number(GridComponent.contextMenuAddLinkOntoLink.children[0].getAttribute('y'));
      //   startCoord = GridComponent.screenToGrid(startX, startY);
      //   this.gridStates = gridStates.createJointFromLink;
      //   this.linkStates = linkStates.creating;
      //   break;
      default:
        return;
    }
    // const mouseRawPos = GridComponent.getMousePosition($event);
    // if (mouseRawPos === undefined) {
    //   return;
    // }
    // const mousePos = GridComponent.screenToGrid(mouseRawPos.x, mouseRawPos.y * -1);
    // // TODO: Within future, create a tempJoint and temp Link and set those values as these values in order to avoid
    // // TODO: having to call setAttribute and have HTML update for you automatically
    console.log(startCoord);
    this.jointTempHolderSVG.children[0].setAttribute('x1', startCoord.x.toString());
    this.jointTempHolderSVG.children[0].setAttribute('y1', startCoord.y.toString());
    this.jointTempHolderSVG.children[1].setAttribute('x', startCoord.x.toString());
    this.jointTempHolderSVG.children[1].setAttribute('y', startCoord.y.toString());
    this.jointTempHolderSVG.style.display = 'block';
    // GridComponent.onMechUpdateState.next(3);
  }

  mouseMove($event: MouseEvent) {
    // console.warn('mouseMove');
    // console.log(typeChosen);
    // $event.preventDefault();
    // $event.stopPropagation();
    // TODO: Possibly put this somewhere else so don't have to copy/paste?
    // const rawCoord = GridComponent.getMousePosition($event)!;
    // const trueCoord = GridComponent.screenToGrid(rawCoord.x, -1 * rawCoord.y);
    // GridComponent.screenCoord =
    //   '(' + roundNumber(trueCoord.x, 1) + ' , ' + roundNumber(trueCoord.y, 1) + ')';
    let mousePosInSvg = this.svgGrid.screenToSVG(new Coord($event.clientX, $event.clientY));

    switch (this.gridStates) {
      case gridStates.createForce:
      case gridStates.createJointFromGrid:
      case gridStates.createJointFromJoint:
      case gridStates.createJointFromLink:
        this.jointTempHolderSVG.children[0].setAttribute('x2', mousePosInSvg.x.toString());
        this.jointTempHolderSVG.children[0].setAttribute('y2', mousePosInSvg.y.toString());
        break;
    }
    // switch (GridComponent.jointStates) {
    //   case jointStates.creating:
    //     GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
    //     GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
    //     break;
    //   case jointStates.dragging:
    //     if (AnimationBarComponent.animate === true) {
    //       GridComponent.sendNotification('Cannot edit while animation is running');
    //       return;
    //     }
    //     if (GridComponent.mechanismTimeStep !== 0) {
    //       GridComponent.sendNotification('Stop animation (or reset to 0 position) to edit');
    //       this.disappearContext();
    //       return;
    //     }
    //     GridComponent.selectedJoint = GridComponent.dragJoint(
    //       GridComponent.selectedJoint,
    //       trueCoord
    //     );
    //     GridComponent.updateMechanism();
    //     //So that the panel values update continously
    //     this.activeObjService.updateSelectedObj(GridComponent.selectedJoint);
    //     if (GridComponent.mechanisms[0].joints[0].length !== 0) {
    //       if (GridComponent.mechanisms[0].dof === 1) {
    //         if (GridComponent.showPathHolder == false) {
    //           GridComponent.onMechUpdateState.next(1);
    //         }
    //         GridComponent.showPathHolder = true;
    //       }
    //     }
    //     break;
    // }
    // switch (GridComponent.linkStates) {
    //   case linkStates.creating:
    //     GridComponent.jointTempHolderSVG.children[0].setAttribute('x2', trueCoord.x.toString());
    //     GridComponent.jointTempHolderSVG.children[0].setAttribute('y2', trueCoord.y.toString());
    //     break;
    //   case linkStates.dragging:
    //     // TODO: Add logic when dragging a link within edit shape mode
    //
    //     const offsetX = trueCoord.x - GridComponent.initialLinkMouseCoord.x;
    //     const offsetY = trueCoord.y - GridComponent.initialLinkMouseCoord.y;
    //     GridComponent.initialLinkMouseCoord.x = trueCoord.x;
    //     GridComponent.initialLinkMouseCoord.y = trueCoord.y;
    //     GridComponent.selectedLink.d = RealLink.getD(GridComponent.selectedLink.joints);
    //     GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(
    //       GridComponent.selectedLink.joints
    //     );
    //     GridComponent.updateMechanism();
    //     break;
    //   case linkStates.resizing:
    //     // Adjust the link's bounding boxes
    //     let b1n,
    //       b2n,
    //       b3n,
    //       b4n,
    //       arrow5n: Coord = new Coord(0, 0)!;
    //
    //     let drag_coord_x, side_coord_x_1, side_coord_x_2: number;
    //     let drag_coord_y, side_coord_y_1, side_coord_y_2: number;
    //
    //     let arrow5n_x, arrow5n_y: number;
    //
    //     let m1, closest_m, m2, m3, m4, m5: number;
    //     let b1, closest_b, b2, b3, b4, b5: number;
    //
    //     const typeOfBoundToCoordMap = new Map<string, Coord>();
    //
    //     // TOOD: Put this within function call to do all this logic
    //     const fixedCoord = typeOfBoundToCoordMap.get('fixed')!;
    //     const dragCoord = typeOfBoundToCoordMap.get('drag')!;
    //     const sideCoord1 = typeOfBoundToCoordMap.get('sideCoord1')!;
    //     const sideCoord2 = typeOfBoundToCoordMap.get('sideCoord2')!;
    //
    //     // determine line from b1 to b3
    //
    //     m1 = determineSlope(fixedCoord.x, fixedCoord.y, dragCoord.x, dragCoord.y);
    //     b1 = determineYIntersect(fixedCoord.x, fixedCoord.y, m1);
    //     // determine the point within this line that is closest to where the mouse is
    //     closest_m = -1 * Math.pow(m1, -1);
    //     closest_b = determineYIntersect(trueCoord.x, trueCoord.y, closest_m);
    //     // closest_b = determineYIntersect(newBound.x, newBound.y, closest_m);
    //     drag_coord_x = determineX(closest_m, closest_b, m1, b1);
    //     drag_coord_y = determineY(drag_coord_x, closest_m, closest_b);
    //     // determine the other 2 points
    //     m2 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord1.x, sideCoord1.y);
    //     b2 = determineYIntersect(fixedCoord.x, fixedCoord.y, m2);
    //     m3 = determineSlope(dragCoord.x, dragCoord.y, sideCoord1.x, sideCoord1.y);
    //     b3 = determineYIntersect(drag_coord_x, drag_coord_y, m3);
    //     side_coord_x_1 = determineX(m2, b2, m3, b3);
    //     side_coord_y_1 = determineY(side_coord_x_1, m2, b2);
    //
    //     m4 = determineSlope(fixedCoord.x, fixedCoord.y, sideCoord2.x, sideCoord2.y);
    //     b4 = determineYIntersect(fixedCoord.x, fixedCoord.y, m4);
    //     m5 = determineSlope(dragCoord.x, dragCoord.y, sideCoord2.x, sideCoord2.y);
    //     b5 = determineYIntersect(drag_coord_x, drag_coord_y, m5);
    //     side_coord_x_2 = determineX(m4, b4, m5, b5);
    //     side_coord_y_2 = determineY(side_coord_x_2, m4, b4);
    //
    //     GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(
    //       GridComponent.selectedLink.joints
    //     );
    //     GridComponent.selectedLink.updateCoMDs();
    //     break;
    // }
    // switch (GridComponent.forceStates) {
    //   case forceStates.creating:
    //     this.createForce($event);
    //     break;
    //   case forceStates.dragging:
    //     if (AnimationBarComponent.animate === true) {
    //       GridComponent.sendNotification('Cannot edit while animation is running');
    //       return;
    //     }
    //     if (GridComponent.mechanismTimeStep !== 0) {
    //       GridComponent.sendNotification('Stop animation (or reset to 0 position) to edit');
    //       this.disappearContext();
    //       return;
    //     }
    //     GridComponent.selectedForce = GridComponent.dragForce(
    //       GridComponent.selectedForce,
    //       trueCoord
    //     );
    //     break;
    // }
  }

  onContextMenu($event: MouseEvent) {
    this.lastRightClickCoord.x = $event.clientX;
    this.lastRightClickCoord.y = $event.clientY;
    console.log('context menu');
    console.log(this.lastRightClickCoord);
  }
}
